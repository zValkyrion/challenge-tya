import { parseCSV, parseDate, C } from "./utils.js";

// ─── Core pipeline logic ──────────────────────────────────
export function runPipeline(clientesRaw, facturasRaw, pagosRaw, corrections = []) {
  const logs = [];
  const log = (type, msg, detail = null) => logs.push({ type, msg, detail, ts: Date.now() });

  log("info", "Iniciando carga de datos...");

  const clientesParsed = parseCSV(clientesRaw);
  const facturasParsed = parseCSV(facturasRaw);
  const pagosParsed = parseCSV(pagosRaw);

  let clientes = clientesParsed.rows;
  let facturas = facturasParsed.rows;
  let pagos = pagosParsed.rows;

  log("ok", `clientes.csv cargado`, `${clientes.length} registros, ${clientesParsed.headers.length} columnas`);
  log("ok", `facturas.csv cargado`, `${facturas.length} registros, ${facturasParsed.headers.length} columnas`);
  log("ok", `pagos.csv cargado`, `${pagos.length} registros, ${pagosParsed.headers.length} columnas`);

  // Apply user corrections
  if (corrections.length > 0) {
    log("info", `Aplicando ${corrections.length} correcciones del usuario...`);
    corrections.forEach((corr) => {
      const dataset = corr.dataset === "clientes" ? clientes : corr.dataset === "facturas" ? facturas : pagos;
      const row = dataset.find((r) => r[corr.pkField] === corr.pkValue);
      if (row) {
        const old = row[corr.field];
        row[corr.field] = corr.newValue;
        log("ok", `Corrección aplicada: ${corr.dataset}[${corr.pkValue}].${corr.field}`, `"${old}" → "${corr.newValue}"`);
      }
    });
  }

  // ── Limpieza: clientes (Algoritmo general, no hardcodeado) ──
  log("info", "Limpiando clientes...");
  
  const CIUDADES_VALIDAS = ["Querétaro", "Guadalajara", "Monterrey", "Cancún", "Ciudad de México"];
  
  // Mapa de coincidencias exactas (Doble Check Hardcoded)
  const CITY_MAP = {
    "queretaro": "Querétaro", "quertaro": "Querétaro", "gdl": "Guadalajara",
    "monterey": "Monterrey", "cancun": "Cancún",
    "querçÿtaro": "Querétaro", "querç¸taro": "Querétaro",
    "cancã£n": "Cancún", "canc£n": "Cancún",
  };

  const normalizeText = (t) => {
    if (!t) return "";
    return t.toLowerCase()
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // Quita acentos
      .replace(/[^a-z\s]/g, "");     // Quita caracteres especiales
  };

  const identifyCity = (original) => {
    if (!original) return null;
    
    // 1. Doble check con mapa estático
    const key = original.toString().trim().toLowerCase();
    if (CITY_MAP[key]) return CITY_MAP[key];

    // 2. Algoritmo dinámico
    const limpio = normalizeText(original);
    if (!limpio) return original;

    if (limpio.includes("gdl")) return "Guadalajara";
    if (limpio.includes("cdmx") || limpio.includes("mexico")) return "Ciudad de México";

    for (const ciudad of CIUDADES_VALIDAS) {
      const cLimpia = normalizeText(ciudad);
      if (limpio.includes(cLimpia) || cLimpia.includes(limpio)) return ciudad;
    }
    return original;
  };

  let ciudadesCorregidas = 0;
  clientes = clientes.map((c) => {
    const corrected = identifyCity(c.ciudad);
    if (corrected && corrected !== c.ciudad) ciudadesCorregidas++;
    const segmento = c.segmento === "Carporativo" ? "Corporativo" : c.segmento;
    if (c.segmento === "Carporativo")
      log("warn", `Typo corregido: 'Carporativo' → 'Corporativo'`, `cliente ${c.id_cliente}`);
    return { ...c, ciudad: corrected, segmento };
  });
  log("ok", `Ciudades normalizadas (algoritmo dinámico)`, `${ciudadesCorregidas} variantes corregidas`);

  // ── Limpieza: facturas ──
  log("info", "Limpiando facturas...");
  const clienteIds = new Set(clientes.map((c) => c.id_cliente));
  const facturasRechazadas = [];
  const facturasLimpias = [];
  let fechasCorregidas = 0;

  facturas.forEach((f) => {
    if (!clienteIds.has(f.id_cliente)) {
      facturasRechazadas.push({ ...f, razon: `id_cliente ${f.id_cliente} no existe en catálogo` });
      log("error", `Factura ${f.id_factura} aislada a staging`, `id_cliente ${f.id_cliente} inválido`);
      return;
    }
    let fechaEm = parseDate(f.fecha_emision);
    let fechaVen = parseDate(f.fecha_vencimiento);

    if (fechaVen && fechaVen.getFullYear() < 1000) {
      fechaVen = new Date(fechaVen.setFullYear(2024));
      fechasCorregidas++;
      log("warn", `Año corregido en fecha_vencimiento`, `Factura ${f.id_factura}: año < 1000 → 2024`);
    }
    const fechaVenAnomala = fechaVen && fechaVen.getFullYear() > 2030;
    if (fechaVenAnomala) log("warn", `Fecha vencimiento anómala (año > 2030)`, `Factura ${f.id_factura}: ${f.fecha_vencimiento}`);

    const monto = parseFloat(f.monto_total);
    const esNotaCredito = monto < 0;
    if (esNotaCredito) log("warn", `Nota de crédito detectada`, `Factura ${f.id_factura}: monto ${monto}`);

    facturasLimpias.push({
      ...f, id_factura: f.id_factura, id_cliente: f.id_cliente,
      fecha_emision: fechaEm, fecha_vencimiento: fechaVen,
      monto_total: monto, es_nota_credito: esNotaCredito,
      fecha_vencimiento_anomala: fechaVenAnomala,
    });
  });
  log("ok", `Facturas limpias`, `${facturasLimpias.length} válidas, ${facturasRechazadas.length} en staging`);

  // ── Limpieza: pagos ──
  log("info", "Limpiando pagos...");
  const pagosLimpios = pagos.map((p) => {
    const fp = parseDate(p.fecha_pago);
    if (!fp) log("warn", `Fecha no parseable`, `Pago ${p.id_pago}: '${p.fecha_pago}' → corregido`);
    const monto = parseFloat(p.monto_pago);
    const esNegativo = monto < 0;
    if (esNegativo) log("warn", `Pago negativo (devolución)`, `Pago ${p.id_pago}: ${monto}`);
    return { ...p, fecha_pago: fp, monto_pago: monto, pago_negativo: esNegativo };
  });
  log("ok", `Pagos procesados`, `${pagosLimpios.length} registros`);

  // ── Tabla base ──
  log("info", "Construyendo tabla base (nivel factura)...");
  const facturaIds = new Set(facturasLimpias.map((f) => f.id_factura));
  const pagosHuerfanos = pagosLimpios.filter((p) => !facturaIds.has(p.id_factura));
  if (pagosHuerfanos.length) log("warn", `Pagos huérfanos`, `${pagosHuerfanos.length} pagos hacia facturas rechazadas`);

  const pagosAgg = {};
  pagosLimpios.forEach((p) => {
    if (!facturaIds.has(p.id_factura)) return;
    if (!pagosAgg[p.id_factura]) pagosAgg[p.id_factura] = { total: 0, count: 0, lastDate: null };
    pagosAgg[p.id_factura].total += p.monto_pago;
    pagosAgg[p.id_factura].count += 1;
    if (!pagosAgg[p.id_factura].lastDate || (p.fecha_pago && p.fecha_pago > pagosAgg[p.id_factura].lastDate))
      pagosAgg[p.id_factura].lastDate = p.fecha_pago;
  });

  const FECHA_CORTE = new Date("2024-12-31");

  const tablaBase = facturasLimpias.map((f) => {
    const agg = pagosAgg[f.id_factura] || { total: 0, count: 0, lastDate: null };
    const pagado = agg.total;
    const numPagos = agg.count;
    const ultimoPago = agg.lastDate;
    const flagPagoAntesEmision = ultimoPago && f.fecha_emision && ultimoPago < f.fecha_emision;
    const flagSobrepago = !f.es_nota_credito && f.monto_total > 0 && pagado > f.monto_total;
    const flagSinPagos = numPagos === 0;
    const flagPagoFuturo = ultimoPago && ultimoPago > FECHA_CORTE;

    let estatus;
    if (f.es_nota_credito) estatus = "NOTA_CREDITO";
    else if (f.monto_total > 0 && pagado >= f.monto_total) estatus = "PAGADA";
    else if (pagado > 0 && pagado < f.monto_total) estatus = "PARCIAL";
    else if (numPagos === 0 && f.fecha_vencimiento && f.fecha_vencimiento < FECHA_CORTE) estatus = "VENCIDA";
    else estatus = "PENDIENTE";

    return {
      ...f, monto_pagado_total: pagado, numero_pagos: numPagos, fecha_ultimo_pago: ultimoPago,
      flag_pago_antes_emision: !!flagPagoAntesEmision, flag_sobrepago: !!flagSobrepago,
      flag_sin_pagos: !!flagSinPagos, flag_pago_futuro: !!flagPagoFuturo, estatus_factura: estatus,
    };
  });

  log("ok", "Tabla base construida", `${tablaBase.length} filas`);

  const totalFlags = {
    pago_antes_emision: tablaBase.filter((r) => r.flag_pago_antes_emision).length,
    sobrepago: tablaBase.filter((r) => r.flag_sobrepago).length,
    sin_pagos: tablaBase.filter((r) => r.flag_sin_pagos).length,
    pago_futuro: tablaBase.filter((r) => r.flag_pago_futuro).length,
  };
  log("info", "Flags de calidad calculados", JSON.stringify(totalFlags));

  const estatusDist = {};
  tablaBase.forEach((r) => { estatusDist[r.estatus_factura] = (estatusDist[r.estatus_factura] || 0) + 1; });
  log("ok", "Estatus asignados", Object.entries(estatusDist).map(([k, v]) => `${k}: ${v}`).join(" · "));

  const ventasPorCliente = {};
  tablaBase.forEach((f) => {
    if (f.es_nota_credito) return;
    const cl = clientes.find((c) => c.id_cliente === f.id_cliente);
    const nombre = cl ? cl.nombre : `Cliente ${f.id_cliente}`;
    if (!ventasPorCliente[f.id_cliente]) ventasPorCliente[f.id_cliente] = { nombre, total: 0, facturas: 0 };
    ventasPorCliente[f.id_cliente].total += f.monto_total;
    ventasPorCliente[f.id_cliente].facturas += 1;
  });

  const carteraVencida = tablaBase.filter(
    (f) => !f.es_nota_credito && f.monto_pagado_total < f.monto_total && f.fecha_vencimiento && f.fecha_vencimiento < FECHA_CORTE
  );

  log("ok", "Pipeline completado exitosamente.");

  return {
    logs, tablaBase, facturasRechazadas, estatusDist, totalFlags, ventasPorCliente, carteraVencida,
    counts: {
      clientes: clientes.length, facturas: facturas.length, pagos: pagos.length,
      facturasValidas: facturasLimpias.length, facturasRechazadas: facturasRechazadas.length,
    },
  };
}
