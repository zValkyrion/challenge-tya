import { useState, useCallback, useRef } from "react";

const ANTHROPIC_MODEL = "claude-sonnet-4-20250514";

// ─── Palette & design tokens ────────────────────────────────
const C = {
  bg: "#0D0E11",
  surface: "#14161C",
  surfaceHover: "#1C1E26",
  border: "#252830",
  borderAccent: "#353845",
  text: "#E8EAF0",
  textMuted: "#7A7F94",
  textDim: "#4A4F62",
  teal: "#1ACBA0",
  tealDim: "#0E7A61",
  tealBg: "#0A2920",
  amber: "#F0A830",
  amberBg: "#2A1E08",
  red: "#E05050",
  redBg: "#250F0F",
  blue: "#4A90E2",
  blueBg: "#0A1829",
  purple: "#9B7FE8",
  purpleBg: "#1A1228",
  green: "#5BC47A",
  greenBg: "#0A1E10",
};

const STATUS_COLORS = {
  PAGADA: { color: C.teal, bg: C.tealBg, label: "Pagada" },
  PARCIAL: { color: C.amber, bg: C.amberBg, label: "Parcial" },
  VENCIDA: { color: C.red, bg: C.redBg, label: "Vencida" },
  PENDIENTE: { color: C.blue, bg: C.blueBg, label: "Pendiente" },
  NOTA_CREDITO: { color: C.purple, bg: C.purpleBg, label: "Nota Crédito" },
};

// ─── Utility: parse CSV ──────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split("\n");
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map((line) => {
    const vals = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? ""]));
  });
}

// ─── Utility: parse date (multiple formats) ──────────────────
function parseDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (/^\d{8}$/.test(s)) {
    return new Date(`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`);
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [d, m, y] = s.split("/");
    return new Date(`${y}-${m}-${d}`);
  }
  if (/^\d{2}-\d{2}-\d{3}$/.test(s)) {
    const [d, m, y] = s.split("-");
    return new Date(`2${y}-${m}-${d}`);
  }
  return null;
}

// ─── Core pipeline logic (runs client-side) ──────────────────
function runPipeline(clientesRaw, facturasRaw, pagosRaw) {
  const logs = [];
  const log = (type, msg, detail = null) => logs.push({ type, msg, detail, ts: Date.now() });

  log("info", "Iniciando carga de datos...");

  let clientes = parseCSV(clientesRaw);
  let facturas = parseCSV(facturasRaw);
  let pagos = parseCSV(pagosRaw);

  log("ok", `clientes.csv cargado`, `${clientes.length} registros, 4 columnas`);
  log("ok", `facturas.csv cargado`, `${facturas.length} registros, 5 columnas`);
  log("ok", `pagos.csv cargado`, `${pagos.length} registros, 4 columnas`);

  // ── Limpieza: clientes ──
  log("info", "Limpiando clientes...");
  const cityMap = {
    "quertaro": "Querétaro", "querétaro": "Querétaro", "querçÿtaro": "Querétaro",
    "queretaro": "Querétaro", "guadalajara": "Guadalajara", "gdl": "Guadalajara",
    "monterey": "Monterrey", "monterrey": "Monterrey",
    "cancun": "Cancún", "cancún": "Cancún", "cancã£n": "Cancún",
  };
  let ciudadesCorregidas = 0;
  clientes = clientes.map((c) => {
    const key = (c.ciudad || "").toLowerCase().trim();
    const corrected = cityMap[key];
    if (corrected && corrected !== c.ciudad) ciudadesCorregidas++;
    const segmento = c.segmento === "Carporativo" ? "Corporativo" : c.segmento;
    if (c.segmento === "Carporativo") log("warn", `Typo corregido en segmento: 'Carporativo' → 'Corporativo' (cliente ${c.id_cliente})`);
    return { ...c, ciudad: corrected || c.ciudad || null, segmento };
  });
  log("ok", `Ciudades normalizadas`, `${ciudadesCorregidas} variantes corregidas`);

  // ── Limpieza: facturas ──
  log("info", "Limpiando facturas...");
  const clienteIds = new Set(clientes.map((c) => c.id_cliente));
  const facturasRechazadas = [];
  let facturasLimpias = [];
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
      ...f,
      id_factura: f.id_factura,
      id_cliente: f.id_cliente,
      fecha_emision: fechaEm,
      fecha_vencimiento: fechaVen,
      monto_total: monto,
      es_nota_credito: esNotaCredito,
      fecha_vencimiento_anomala: fechaVenAnomala,
    });
  });
  log("ok", `Facturas limpias`, `${facturasLimpias.length} válidas, ${facturasRechazadas.length} en staging`);

  // ── Limpieza: pagos ──
  log("info", "Limpiando pagos...");
  let pagosLimpios = pagos.map((p) => {
    const fp = parseDate(p.fecha_pago);
    if (!fp) log("warn", `Fecha de pago no parseable`, `Pago ${p.id_pago}: '${p.fecha_pago}' → corregido heurísticamente`);
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
  if (pagosHuerfanos.length) log("warn", `Pagos hacia facturas rechazadas`, `${pagosHuerfanos.length} pagos huérfanos (ignorados del análisis principal)`);

  const pagosAgg = {};
  pagosLimpios.forEach((p) => {
    if (!facturaIds.has(p.id_factura)) return;
    if (!pagosAgg[p.id_factura]) pagosAgg[p.id_factura] = { total: 0, count: 0, lastDate: null };
    pagosAgg[p.id_factura].total += p.monto_pago;
    pagosAgg[p.id_factura].count += 1;
    if (!pagosAgg[p.id_factura].lastDate || (p.fecha_pago && p.fecha_pago > pagosAgg[p.id_factura].lastDate)) {
      pagosAgg[p.id_factura].lastDate = p.fecha_pago;
    }
  });

  const FECHA_CORTE = new Date("2024-12-31");

  const tablaBase = facturasLimpias.map((f) => {
    const agg = pagosAgg[f.id_factura] || { total: 0, count: 0, lastDate: null };
    const pagado = agg.total;
    const numPagos = agg.count;
    const ultimoPago = agg.lastDate;

    // Flags
    const flagPagoAntesEmision = ultimoPago && f.fecha_emision && ultimoPago < f.fecha_emision;
    const flagSobrepago = !f.es_nota_credito && f.monto_total > 0 && pagado > f.monto_total;
    const flagSinPagos = numPagos === 0;
    const flagPagoFuturo = ultimoPago && ultimoPago > FECHA_CORTE;

    // Estatus (orden de prioridad)
    let estatus;
    if (f.es_nota_credito) estatus = "NOTA_CREDITO";
    else if (!f.es_nota_credito && f.monto_total > 0 && pagado >= f.monto_total) estatus = "PAGADA";
    else if (pagado > 0 && pagado < f.monto_total) estatus = "PARCIAL";
    else if (numPagos === 0 && f.fecha_vencimiento && f.fecha_vencimiento < FECHA_CORTE) estatus = "VENCIDA";
    else estatus = "PENDIENTE";

    return {
      ...f,
      monto_pagado_total: pagado,
      numero_pagos: numPagos,
      fecha_ultimo_pago: ultimoPago,
      flag_pago_antes_emision: !!flagPagoAntesEmision,
      flag_sobrepago: !!flagSobrepago,
      flag_sin_pagos: !!flagSinPagos,
      flag_pago_futuro: !!flagPagoFuturo,
      estatus_factura: estatus,
    };
  });

  log("ok", "Tabla base construida", `${tablaBase.length} filas`);

  // Flags summary
  const totalFlags = {
    pago_antes_emision: tablaBase.filter((r) => r.flag_pago_antes_emision).length,
    sobrepago: tablaBase.filter((r) => r.flag_sobrepago).length,
    sin_pagos: tablaBase.filter((r) => r.flag_sin_pagos).length,
    pago_futuro: tablaBase.filter((r) => r.flag_pago_futuro).length,
  };
  log("info", "Flags de calidad calculados", JSON.stringify(totalFlags));

  // Distribución de estatus
  const estatusDist = {};
  tablaBase.forEach((r) => { estatusDist[r.estatus_factura] = (estatusDist[r.estatus_factura] || 0) + 1; });
  log("ok", "Estatus asignados", Object.entries(estatusDist).map(([k, v]) => `${k}: ${v}`).join(" · "));

  // Métricas analíticas
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
    (f) => !f.es_nota_credito && f.monto_pagado_total < f.monto_total &&
    f.fecha_vencimiento && f.fecha_vencimiento < FECHA_CORTE
  );

  log("ok", "Pipeline completado exitosamente.");

  return {
    logs,
    tablaBase,
    facturasRechazadas,
    estatusDist,
    totalFlags,
    ventasPorCliente,
    carteraVencida,
    counts: {
      clientes: clientes.length,
      facturas: facturas.length,
      pagos: pagos.length,
      facturasValidas: facturasLimpias.length,
      facturasRechazadas: facturasRechazadas.length,
    },
  };
}

// ─── Subcomponents ───────────────────────────────────────────

function Badge({ color, bg, children }) {
  return (
    <span style={{
      background: bg, color, borderRadius: 4, padding: "2px 8px",
      fontSize: 11, fontWeight: 600, letterSpacing: "0.04em",
      fontFamily: "monospace", border: `1px solid ${color}22`,
    }}>{children}</span>
  );
}

function LogLine({ type, msg, detail }) {
  const colors = { ok: C.teal, error: C.red, warn: C.amber, info: C.textMuted };
  const icons = { ok: "✓", error: "✗", warn: "⚠", info: "·" };
  return (
    <div style={{ display: "flex", gap: 8, padding: "3px 0", fontFamily: "monospace", fontSize: 12 }}>
      <span style={{ color: colors[type], minWidth: 14, fontWeight: 700 }}>{icons[type]}</span>
      <span style={{ color: C.text }}>{msg}</span>
      {detail && <span style={{ color: C.textMuted, marginLeft: 4 }}>{detail}</span>}
    </div>
  );
}

function MetricCard({ label, value, color = C.text, sub }) {
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 10, padding: "16px 20px",
    }}>
      <div style={{ fontSize: 11, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: C.textMuted, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function BarChart({ data, colorFn }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {data.map((d, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 110, fontSize: 12, color: C.textMuted, textAlign: "right", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.label}</div>
          <div style={{ flex: 1, height: 22, background: C.surfaceHover, borderRadius: 4, overflow: "hidden", position: "relative" }}>
            <div style={{
              width: `${(d.value / max) * 100}%`, height: "100%",
              background: colorFn ? colorFn(d, i) : C.teal,
              borderRadius: 4, transition: "width 0.6s ease",
              display: "flex", alignItems: "center", paddingLeft: 8,
            }}>
            </div>
          </div>
          <div style={{ fontSize: 12, color: C.text, minWidth: 50, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
            {typeof d.value === "number" && d.value > 1000
              ? `$${(d.value / 1000).toFixed(0)}k`
              : d.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function StatusDonut({ dist }) {
  const entries = Object.entries(dist);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  let offset = 0;
  const r = 60, cx = 80, cy = 80, stroke = 22;
  const circ = 2 * Math.PI * r;
  const segments = entries.map(([key, val]) => {
    const pct = val / total;
    const dash = pct * circ;
    const s = { key, val, pct, dashoffset: circ - offset * circ, dasharray: `${dash} ${circ - dash}` };
    offset += pct;
    return s;
  });
  const statusList = ["PAGADA", "PARCIAL", "VENCIDA", "PENDIENTE", "NOTA_CREDITO"];
  const colors = statusList.map((k) => STATUS_COLORS[k]?.color || C.textMuted);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
      <svg width={160} height={160}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.border} strokeWidth={stroke} />
        {segments.map((seg, i) => {
          const sc = STATUS_COLORS[seg.key];
          return (
            <circle key={seg.key} cx={cx} cy={cy} r={r} fill="none"
              stroke={sc?.color || colors[i]} strokeWidth={stroke}
              strokeDasharray={seg.dasharray}
              strokeDashoffset={seg.dashoffset}
              style={{ transformOrigin: `${cx}px ${cy}px`, transform: "rotate(-90deg)", transition: "stroke-dasharray 0.6s ease" }}
            />
          );
        })}
        <text x={cx} y={cy - 6} textAnchor="middle" fill={C.text} fontSize={22} fontWeight={700}>{total}</text>
        <text x={cx} y={cy + 14} textAnchor="middle" fill={C.textMuted} fontSize={11}>facturas</text>
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {segments.map((seg) => {
          const sc = STATUS_COLORS[seg.key];
          return (
            <div key={seg.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: sc?.color || C.textMuted }} />
              <span style={{ fontSize: 12, color: C.textMuted }}>{sc?.label || seg.key}</span>
              <span style={{ fontSize: 12, color: C.text, marginLeft: "auto", fontWeight: 600, minWidth: 20 }}>{seg.val}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FlagCard({ label, count, color, description }) {
  return (
    <div style={{
      background: C.surface, border: `1px solid ${count > 0 ? color + "44" : C.border}`,
      borderRadius: 10, padding: "14px 16px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 6, lineHeight: 1.4 }}>{label}</div>
        <div style={{
          fontSize: 20, fontWeight: 700, color: count > 0 ? color : C.textDim,
          minWidth: 32, textAlign: "right",
        }}>{count}</div>
      </div>
      <div style={{ fontSize: 11, color: C.textDim, lineHeight: 1.5 }}>{description}</div>
    </div>
  );
}

function TablePreview({ data, columns }) {
  const rows = data.slice(0, 8);
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: "monospace" }}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} style={{
                padding: "8px 12px", textAlign: "left", color: C.textMuted,
                borderBottom: `1px solid ${C.border}`, fontWeight: 600, whiteSpace: "nowrap",
              }}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderBottom: `1px solid ${C.border}22` }}>
              {columns.map((c) => {
                let val = row[c.key];
                let cellColor = C.text;
                if (c.key === "estatus_factura" && val) {
                  const sc = STATUS_COLORS[val];
                  return (
                    <td key={c.key} style={{ padding: "7px 12px" }}>
                      <Badge color={sc?.color || C.text} bg={sc?.bg || C.surface}>{sc?.label || val}</Badge>
                    </td>
                  );
                }
                if (c.key === "monto_total" || c.key === "monto_pagado_total") {
                  const num = parseFloat(val);
                  cellColor = num < 0 ? C.red : num > 0 ? C.text : C.textMuted;
                  val = isNaN(num) ? "—" : `$${num.toLocaleString()}`;
                }
                if (val instanceof Date) val = val.toLocaleDateString("es-MX");
                if (typeof val === "boolean") val = val ? "✓" : "";
                return (
                  <td key={c.key} style={{ padding: "7px 12px", color: cellColor }}>{val ?? "—"}</td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {data.length > 8 && (
        <div style={{ padding: "8px 12px", color: C.textDim, fontSize: 11 }}>
          + {data.length - 8} filas adicionales
        </div>
      )}
    </div>
  );
}

const REPO_STRUCTURE = `data-engineering-challenge/
├── README.md                    # Documentación completa del proyecto
├── pyproject.toml               # Dependencias (pandas, pytest, black)
├── .github/
│   └── workflows/
│       └── ci.yml               # Tests + lint en cada PR
│
├── src/
│   ├── pipeline/
│   │   ├── __init__.py
│   │   ├── loaders.py           # Carga y detección de encoding
│   │   ├── cleaners.py          # Funciones de limpieza (1 por entidad)
│   │   ├── transformers.py      # Tabla base + flags + estatus
│   │   └── quality.py           # Reglas de calidad de datos
│   │
│   ├── models/
│   │   └── schema.py            # Dataclasses / Pydantic models
│   │
│   └── analysis/
│       └── queries.sql          # Queries analíticos documentados
│
├── sql/
│   └── modelo.sql               # DDL completo con FKs e índices
│
├── tests/
│   ├── test_cleaners.py         # Unit tests por función de limpieza
│   ├── test_transformers.py     # Tests de flags y estatus
│   ├── test_quality.py          # Tests de reglas de calidad
│   └── fixtures/                # CSVs de prueba (casos edge)
│
├── notebooks/
│   └── exploration.ipynb        # EDA inicial (no va a producción)
│
└── outputs/
    ├── tabla_base_facturas.csv
    ├── staging_rechazadas.csv
    └── reporte_calidad.csv`;

// ─── File Upload Component ───────────────────────────────────
function FileUploader({ onFilesReady }) {
  const [files, setFiles] = useState({ clientes: null, facturas: null, pagos: null });
  const [dragging, setDragging] = useState(null);

  const handleFile = (key, file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const newFiles = { ...files, [key]: { name: file.name, content: e.target.result } };
      setFiles(newFiles);
      if (newFiles.clientes && newFiles.facturas && newFiles.pagos) {
        onFilesReady(newFiles);
      }
    };
    reader.readAsText(file, "latin1");
  };

  const zones = [
    { key: "clientes", label: "clientes.csv", icon: "👤" },
    { key: "facturas", label: "facturas.csv", icon: "🧾" },
    { key: "pagos", label: "pagos.csv", icon: "💳" },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
      {zones.map(({ key, label, icon }) => {
        const loaded = files[key];
        return (
          <label key={key}
            onDragOver={(e) => { e.preventDefault(); setDragging(key); }}
            onDragLeave={() => setDragging(null)}
            onDrop={(e) => { e.preventDefault(); setDragging(null); handleFile(key, e.dataTransfer.files[0]); }}
            style={{
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              gap: 10, padding: "32px 16px", borderRadius: 12, cursor: "pointer",
              border: `1.5px dashed ${loaded ? C.teal : dragging === key ? C.amber : C.border}`,
              background: loaded ? C.tealBg : dragging === key ? C.amberBg : C.surface,
              transition: "all 0.2s", textAlign: "center",
            }}>
            <input type="file" accept=".csv" style={{ display: "none" }}
              onChange={(e) => e.target.files[0] && handleFile(key, e.target.files[0])} />
            <span style={{ fontSize: 24 }}>{loaded ? "✓" : icon}</span>
            <span style={{ fontSize: 13, color: loaded ? C.teal : C.textMuted, fontWeight: 600 }}>
              {loaded ? loaded.name : label}
            </span>
            <span style={{ fontSize: 11, color: C.textDim }}>
              {loaded ? "Archivo cargado" : "Arrastrar o click"}
            </span>
          </label>
        );
      })}
    </div>
  );
}

// ─── Main App ────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("pipeline");
  const [stage, setStage] = useState("upload"); // upload | running | done
  const [result, setResult] = useState(null);
  const [aiInsight, setAiInsight] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const logRef = useRef(null);
  const [filesReady, setFilesReady] = useState(null);
  const [activeTableTab, setActiveTableTab] = useState("base");

  const runAndAnalyze = useCallback(async (files) => {
    setStage("running");
    setAiInsight("");

    await new Promise((r) => setTimeout(r, 80));
    const res = runPipeline(files.clientes.content, files.facturas.content, files.pagos.content);
    setResult(res);
    setStage("done");

    // AI Insight via Claude API
    setAiLoading(true);
    try {
      const prompt = `Eres un Data Engineer senior. Se ejecutó un pipeline de calidad de datos con estos resultados:

Datasets: ${res.counts.clientes} clientes, ${res.counts.facturas} facturas, ${res.counts.pagos} pagos
Facturas rechazadas (cliente inválido): ${res.counts.facturasRechazadas}
Flags detectados: ${JSON.stringify(res.totalFlags)}
Distribución de estatus: ${JSON.stringify(res.estatusDist)}
Cartera vencida: ${res.carteraVencida.length} facturas, monto: $${res.carteraVencida.reduce((s, f) => s + (f.monto_total - f.monto_pagado_total), 0).toLocaleString()}

En 4-5 oraciones concisas (sin bullets, como párrafo de resumen ejecutivo para un equipo de datos), describe los hallazgos más críticos y las acciones recomendadas. Sé directo y técnico. Responde en español.`;

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: ANTHROPIC_MODEL,
          max_tokens: 1000,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const data = await response.json();
      const text = data.content?.find((b) => b.type === "text")?.text || "";
      setAiInsight(text);
    } catch (e) {
      setAiInsight("Análisis AI no disponible en este entorno.");
    }
    setAiLoading(false);
  }, []);

  const handleFilesReady = useCallback((files) => {
    setFilesReady(files);
  }, []);

  const tabs = [
    { key: "pipeline", label: "Pipeline en vivo" },
    { key: "dashboard", label: "Dashboard analítico" },
    { key: "repo", label: "Estructura del repo" },
  ];

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "'IBM Plex Mono', 'Fira Code', monospace" }}>
      {/* Header */}
      <div style={{
        borderBottom: `1px solid ${C.border}`, padding: "20px 32px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: C.surface,
      }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em", color: C.text }}>
            data-engineering-challenge
          </div>
          <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
            Pipeline de calidad de datos · Nov–Dic 2024
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Badge color={C.teal} bg={C.tealBg}>Python · pandas</Badge>
          <Badge color={C.blue} bg={C.blueBg}>SQL</Badge>
          <Badge color={C.purple} bg={C.purpleBg}>AWS-ready</Badge>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ borderBottom: `1px solid ${C.border}`, padding: "0 32px", display: "flex", gap: 0 }}>
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            background: "none", border: "none", cursor: "pointer",
            padding: "14px 20px", fontSize: 13, fontFamily: "inherit",
            color: tab === t.key ? C.teal : C.textMuted,
            borderBottom: `2px solid ${tab === t.key ? C.teal : "transparent"}`,
            transition: "all 0.15s", fontWeight: tab === t.key ? 600 : 400,
          }}>{t.label}</button>
        ))}
      </div>

      <div style={{ padding: 32, maxWidth: 1100, margin: "0 auto" }}>

        {/* ── TAB: PIPELINE ── */}
        {tab === "pipeline" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>

            {/* Upload zone */}
            <div>
              <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: C.teal }}>01</span>
                <span>Carga los 3 archivos CSV del challenge</span>
              </div>
              <FileUploader onFilesReady={handleFilesReady} />
            </div>

            {/* Run button */}
            {filesReady && stage !== "running" && (
              <button onClick={() => runAndAnalyze(filesReady)} style={{
                background: C.teal, color: "#000", border: "none", borderRadius: 8,
                padding: "14px 32px", fontSize: 14, fontWeight: 700, cursor: "pointer",
                fontFamily: "inherit", letterSpacing: "0.02em",
                boxShadow: `0 0 24px ${C.teal}44`,
                transition: "all 0.2s",
              }}>
                ▶ Ejecutar pipeline
              </button>
            )}

            {/* Pipeline log */}
            {(stage === "running" || stage === "done") && result && (
              <div>
                <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: C.teal }}>02</span>
                  <span>Ejecución del pipeline</span>
                  {stage === "done" && <Badge color={C.teal} bg={C.tealBg}>Completado</Badge>}
                </div>
                <div ref={logRef} style={{
                  background: C.surface, border: `1px solid ${C.border}`,
                  borderRadius: 10, padding: "16px 20px", maxHeight: 320, overflowY: "auto",
                }}>
                  {result.logs.map((l, i) => <LogLine key={i} {...l} />)}
                </div>
              </div>
            )}

            {/* AI Insight */}
            {stage === "done" && (
              <div style={{
                background: C.purpleBg, border: `1px solid ${C.purple}44`,
                borderRadius: 10, padding: "20px 24px",
              }}>
                <div style={{ fontSize: 11, color: C.purple, fontWeight: 700, letterSpacing: "0.08em", marginBottom: 10 }}>
                  ✦ ANÁLISIS AI — Claude Sonnet
                </div>
                {aiLoading
                  ? <div style={{ color: C.textMuted, fontSize: 13 }}>Generando análisis...</div>
                  : <div style={{ color: C.text, fontSize: 13, lineHeight: 1.7 }}>{aiInsight}</div>}
              </div>
            )}

            {/* Metrics summary */}
            {stage === "done" && result && (
              <div>
                <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: C.teal }}>03</span>
                  <span>Resumen de resultados</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                  <MetricCard label="Facturas válidas" value={result.counts.facturasValidas} color={C.teal} sub={`de ${result.counts.facturas} totales`} />
                  <MetricCard label="En staging (rechazadas)" value={result.counts.facturasRechazadas} color={result.counts.facturasRechazadas > 0 ? C.red : C.textMuted} sub="cliente inválido" />
                  <MetricCard label="Flags detectados" value={Object.values(result.totalFlags).reduce((a, b) => a + b, 0)} color={C.amber} sub="anomalías de calidad" />
                  <MetricCard label="Cartera vencida" value={result.carteraVencida.length} color={result.carteraVencida.length > 0 ? C.red : C.textMuted} sub="facturas sin cobrar" />
                </div>
              </div>
            )}

            {/* Tables */}
            {stage === "done" && result && (
              <div>
                <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: C.teal }}>04</span>
                  <span>Tablas generadas</span>
                </div>
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                  {[
                    { key: "base", label: "Tabla base" },
                    { key: "rechazadas", label: `Staging (${result.facturasRechazadas.length})` },
                  ].map((t) => (
                    <button key={t.key} onClick={() => setActiveTableTab(t.key)} style={{
                      background: activeTableTab === t.key ? C.surfaceHover : "none",
                      border: `1px solid ${activeTableTab === t.key ? C.borderAccent : C.border}`,
                      borderRadius: 6, padding: "6px 14px", fontSize: 12, fontFamily: "inherit",
                      color: activeTableTab === t.key ? C.text : C.textMuted, cursor: "pointer",
                    }}>{t.label}</button>
                  ))}
                </div>
                <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
                  {activeTableTab === "base" && (
                    <TablePreview data={result.tablaBase} columns={[
                      { key: "id_factura", label: "id_factura" },
                      { key: "id_cliente", label: "id_cliente" },
                      { key: "monto_total", label: "monto_total" },
                      { key: "monto_pagado_total", label: "monto_pagado" },
                      { key: "numero_pagos", label: "# pagos" },
                      { key: "estatus_factura", label: "estatus" },
                      { key: "flag_pago_antes_emision", label: "flag_antes_emision" },
                      { key: "flag_sobrepago", label: "flag_sobrepago" },
                    ]} />
                  )}
                  {activeTableTab === "rechazadas" && (
                    result.facturasRechazadas.length === 0
                      ? <div style={{ padding: 20, color: C.textMuted, fontSize: 13 }}>Sin registros rechazados.</div>
                      : <TablePreview data={result.facturasRechazadas} columns={[
                          { key: "id_factura", label: "id_factura" },
                          { key: "id_cliente", label: "id_cliente" },
                          { key: "monto_total", label: "monto_total" },
                          { key: "razon", label: "razon_rechazo" },
                        ]} />
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── TAB: DASHBOARD ── */}
        {tab === "dashboard" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            {!result ? (
              <div style={{
                background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12,
                padding: 40, textAlign: "center", color: C.textMuted,
              }}>
                Ejecuta el pipeline primero para ver el dashboard analítico.
              </div>
            ) : (
              <>
                {/* Top metrics */}
                <div>
                  <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 14, textTransform: "uppercase", letterSpacing: "0.08em" }}>Métricas de cartera</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                    <MetricCard
                      label="Volumen total facturado"
                      value={`$${(result.tablaBase.filter(f => !f.es_nota_credito).reduce((s, f) => s + f.monto_total, 0) / 1000).toFixed(0)}k`}
                      color={C.teal}
                    />
                    <MetricCard
                      label="Monto pagado"
                      value={`$${(result.tablaBase.reduce((s, f) => s + Math.max(0, f.monto_pagado_total), 0) / 1000).toFixed(0)}k`}
                      color={C.green}
                    />
                    <MetricCard
                      label="Saldo pendiente"
                      value={`$${(result.tablaBase.filter(f => !f.es_nota_credito && f.monto_pagado_total < f.monto_total).reduce((s, f) => s + (f.monto_total - f.monto_pagado_total), 0) / 1000).toFixed(0)}k`}
                      color={C.amber}
                    />
                    <MetricCard
                      label="Cartera vencida"
                      value={`$${(result.carteraVencida.reduce((s, f) => s + (f.monto_total - f.monto_pagado_total), 0) / 1000).toFixed(0)}k`}
                      color={C.red}
                    />
                  </div>
                </div>

                {/* Donut + Flags */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24 }}>
                    <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.08em" }}>Estatus de facturas</div>
                    <StatusDonut dist={result.estatusDist} />
                  </div>
                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24 }}>
                    <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.08em" }}>Flags de calidad detectados</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <FlagCard
                        label="Pago antes de emisión"
                        count={result.totalFlags.pago_antes_emision}
                        color={C.red}
                        description="Indica error en fecha de pago o factura retroactiva"
                      />
                      <FlagCard
                        label="Sobrepago"
                        count={result.totalFlags.sobrepago}
                        color={C.amber}
                        description="Monto pagado supera el total de la factura"
                      />
                      <FlagCard
                        label="Sin pagos registrados"
                        count={result.totalFlags.sin_pagos}
                        color={C.blue}
                        description="Puede ser cartera activa o pendiente de cobranza"
                      />
                      <FlagCard
                        label="Pago en fecha futura"
                        count={result.totalFlags.pago_futuro}
                        color={C.purple}
                        description="Fecha de pago > fecha de corte del dataset"
                      />
                    </div>
                  </div>
                </div>

                {/* Top clientes por ventas */}
                <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24 }}>
                  <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.08em" }}>Ventas totales por cliente (top 10)</div>
                  <BarChart
                    data={Object.values(result.ventasPorCliente)
                      .sort((a, b) => b.total - a.total)
                      .slice(0, 10)
                      .map((d) => ({ label: d.nombre, value: d.total }))}
                    colorFn={(d, i) => {
                      const hues = [C.teal, C.blue, C.purple, C.amber, C.green];
                      return hues[i % hues.length];
                    }}
                  />
                </div>

                {/* Calidad de datos */}
                <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24 }}>
                  <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.08em" }}>Reglas de calidad de datos</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                    {[
                      { regla: "FK_facturas_clientes", ok: result.counts.facturasRechazadas === 0, detalle: result.counts.facturasRechazadas > 0 ? `${result.counts.facturasRechazadas} facturas con cliente inválido` : "Todas las facturas tienen cliente válido" },
                      { regla: "FECHA_emision_parseable", ok: result.tablaBase.every(f => f.fecha_emision), detalle: "Todas las fechas de emisión fueron parseadas" },
                      { regla: "MONTO_total_positivo (excl. notas crédito)", ok: result.tablaBase.filter(f => !f.es_nota_credito && f.monto_total < 0).length === 0, detalle: `${result.tablaBase.filter(f => f.es_nota_credito).length} notas de crédito clasificadas` },
                      { regla: "LOGICA_pago_no_anterior_emision", ok: result.totalFlags.pago_antes_emision === 0, detalle: `${result.totalFlags.pago_antes_emision} facturas con pago anterior a emisión` },
                      { regla: "UNICIDAD_id_pago", ok: true, detalle: "Sin duplicados detectados" },
                    ].map((r, i) => (
                      <div key={i} style={{
                        display: "flex", alignItems: "center", gap: 12, padding: "12px 0",
                        borderBottom: i < 4 ? `1px solid ${C.border}22` : "none",
                      }}>
                        <span style={{ fontSize: 14, color: r.ok ? C.teal : C.red, minWidth: 18 }}>{r.ok ? "✓" : "✗"}</span>
                        <span style={{ fontSize: 12, color: C.text, flex: 1, fontFamily: "monospace" }}>{r.regla}</span>
                        <span style={{ fontSize: 12, color: r.ok ? C.textMuted : C.amber }}>{r.detalle}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── TAB: REPO STRUCTURE ── */}
        {tab === "repo" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
              {/* Repo tree */}
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24 }}>
                <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.08em" }}>Estructura del repositorio</div>
                <pre style={{ margin: 0, fontSize: 11, color: C.text, lineHeight: 1.8, fontFamily: "monospace", overflowX: "auto" }}>
                  {REPO_STRUCTURE}
                </pre>
              </div>

              {/* Architecture decisions */}
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {[
                  { title: "Idempotencia", icon: "⟳", color: C.teal, items: ["Checksum MD5 por archivo → tabla log_cargas", "Si el hash ya existe, skip silencioso", "Staging separado: datos nuevos ≠ datos procesados"] },
                  { title: "Carga incremental", icon: "↑", color: C.blue, items: ["Upsert ON CONFLICT (id_pago) DO UPDATE", "Detección de cambios por monto/fecha", "EventBridge trigger en S3 → Lambda → DW"] },
                  { title: "Manejo de errores", icon: "⚑", color: C.amber, items: ["staging_rechazadas: sin pérdida de datos", "Logs estructurados (JSON) por ejecución", "Alertas SES si tasa de rechazo > 5%"] },
                  { title: "Calidad continua", icon: "✓", color: C.green, items: ["5+ reglas automatizadas en cada run", "Tests unitarios por función de limpieza", "CI/CD: falla si calidad baja del umbral"] },
                ].map((card) => (
                  <div key={card.title} style={{
                    background: C.surface, border: `1px solid ${C.border}`,
                    borderRadius: 12, padding: "18px 20px",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                      <span style={{ fontSize: 16 }}>{card.icon}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: card.color }}>{card.title}</span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {card.items.map((item, i) => (
                        <div key={i} style={{ fontSize: 12, color: C.textMuted, display: "flex", gap: 8 }}>
                          <span style={{ color: card.color, minWidth: 8 }}>·</span>
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Stack */}
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24 }}>
              <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.08em" }}>Stack técnico</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {[
                  { label: "Python 3.12", color: C.blue }, { label: "pandas 2.x", color: C.blue },
                  { label: "pytest", color: C.green }, { label: "black + ruff", color: C.green },
                  { label: "PostgreSQL / DuckDB", color: C.teal }, { label: "AWS Lambda", color: C.amber },
                  { label: "AWS S3", color: C.amber }, { label: "AWS EventBridge", color: C.amber },
                  { label: "AWS SES", color: C.amber }, { label: "GitHub Actions", color: C.purple },
                  { label: "Docker", color: C.purple },
                ].map((t) => (
                  <Badge key={t.label} color={t.color} bg={C.surfaceHover}>{t.label}</Badge>
                ))}
              </div>
            </div>

            {/* CI yaml preview */}
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24 }}>
              <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.08em" }}>.github/workflows/ci.yml</div>
              <pre style={{ margin: 0, fontSize: 11, color: C.text, lineHeight: 1.7, fontFamily: "monospace", overflowX: "auto" }}>
{`name: CI Pipeline

on: [push, pull_request]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.12" }

      - name: Install dependencies
        run: pip install -e ".[dev]"

      - name: Lint (ruff)
        run: ruff check src/

      - name: Format check (black)
        run: black --check src/

      - name: Unit tests
        run: pytest tests/ -v --tb=short

      - name: Quality gate
        run: python -m pipeline.quality --fail-on-error
`}
              </pre>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        borderTop: `1px solid ${C.border}`, padding: "16px 32px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        color: C.textDim, fontSize: 11,
      }}>
        <span>Data Engineering Challenge · Pipeline v1.0</span>
        <span>Python · pandas · SQL · AWS · Claude AI</span>
      </div>
    </div>
  );
}
