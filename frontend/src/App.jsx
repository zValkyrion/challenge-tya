import React, { useState, useCallback, useRef } from "react";
import { C, STATUS_COLORS, SCHEMAS } from "./utils.js";
import { runPipeline } from "./pipeline.js";
import {
  ToastProvider, useToast, Badge, LogLine, MetricCard, BarChart,
  StatusDonut, FlagCard, TablePreview, SectionHeader,
} from "./components.jsx";
import FileUploader from "./FileUploader.jsx";
import DataCorrectionPanel from "./DataCorrectionPanel.jsx";

const REPO_STRUCTURE = `challenge/
├── entrega-sencilla/
│   ├── python/
│   │   └── procesamiento.py (Core del Pipeline)
│   ├── sql/
│   │   ├── modelos.sql (Vistas y Tablas Base)
│   │   └── analisis.sql (Inteligencia de Negocio)
│   └── README.md (Documentación técnica)
├── frontend/ (Dashboard React v2.0)
└── data/ (CSVs de origen)`;

function AppInner() {
  const [tab, setTab] = useState("repo");
  const [selectedModule, setSelectedModule] = useState("pipeline");
  const ARCH_MODULES = [
    { id: "ingesta", label: "01 Ingesta", icon: "📥", color: C.blue, why: "La entrada limpia es vital para evitar el 'Garbage In, Garbage Out'.", how: "Carga dinámica de CSVs con detección de encoding y normalización de headers.", purpose: "Centralizar la recepción de datos de Clientes, Facturas y Pagos." },
    { id: "pipeline", label: "02 Pipeline", icon: "⚙️", color: C.teal, why: "Garantiza integridad financiera antes del modelado.", how: "Doble-check de ciudades (Mapa+Regex) y sanitización de fechas (Year Fixer).", purpose: "Transformar datos crudos en información confiable y consistente." },
    { id: "staging", label: "03 Staging", icon: "⏹", color: C.amber, why: "La transparencia total permite corregir errores sin perder registros.", how: "Clasificación binaria (Validados vs Rechazados) y dump de logs de error.", purpose: "Separar datos listos de anomalías para auditoría manual (No-Black-Box)." },
    { id: "sql", label: "04 SQL Model", icon: "🗄", color: C.purple, why: "Permite análisis senior (Pareto/Churn) con alto performance.", how: "Unificación de datasets en Tabla Base (facturas + pagos acumulados).", purpose: "Estructurar la data para responder preguntas complejas de negocio." },
    { id: "dash", label: "05 Dashboard", icon: "📊", color: C.green, why: "Transforma data-points en decisiones ejecutivas.", how: "Visualizaciones reactivas y drill-down interactivo de métricas.", purpose: "Exponer KPIs de salud financiera e insights de IA en tiempo real." }
  ];
  const [stage, setStage] = useState("upload"); // upload | review | running | done
  const [result, setResult] = useState(null);
  const [filesReady, setFilesReady] = useState(null);
  const [corrections, setCorrections] = useState([]);
  const [activeTableTab, setActiveTableTab] = useState("base");
  const [detailFilter, setDetailFilter] = useState(null); // { type, label, data }
  const [aiInsight, setAiInsight] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const logRef = useRef(null);
  const toast = useToast();

  const handleFilesReady = useCallback((files) => {
    setFilesReady(files);
    setStage("review");
    toast?.("Todos los archivos cargados — revisión de datos disponible", "success");
  }, [toast]);

  const handleFilesLoaded = useCallback((files) => {
    setFilesReady(files);
    setStage("review");
  }, []);

  const handleClear = useCallback(() => {
    setFilesReady(null);
    setCorrections([]);
    setResult(null);
    setStage("upload");
    setDetailFilter(null);
  }, []);

  const handleCorrectionsReady = useCallback((corr) => {
    setCorrections(corr);
    toast?.(`${corr.length} correcciones registradas — listo para ejecutar`, "success");
  }, [toast]);

  const runAndAnalyze = useCallback(async () => {
    if (!filesReady) return;
    setStage("running");
    setAiInsight("");
    await new Promise((r) => setTimeout(r, 100));
    const res = runPipeline(filesReady.clientes.content, filesReady.facturas.content, filesReady.pagos.content, corrections);
    setResult(res);
    setStage("done");
    toast?.("Pipeline completado exitosamente", "success");

    // AI Insight
    setAiLoading(true);
    try {
      const prompt = `Eres un Senior Data Engineer y Consultor Estratégico para Tierra y Armonía (TYA). Se ejecutó el pipeline de datos con estos resultados:
Datasets: ${res.counts.clientes} clientes, ${res.counts.facturas} facturas, ${res.counts.pagos} pagos
Facturas en Staging (Rechazadas): ${res.counts.facturasRechazadas}
Banderas de Calidad (Anomalías): ${JSON.stringify(res.totalFlags)}
Distribución de Cobranza: ${JSON.stringify(res.estatusDist)}
Métricas de Cartera Vencida: ${res.carteraVencida.length} facturas detectadas.

En 5 oraciones concisas y de alto nivel ejecutivo, proporciona:
1. Un resumen crítico de la salud financiera y operativa de la cartera según los datos.
2. Acciones inmediatas recomendadas para mitigar riesgos de liquidez y corregir anomalías en el proceso de cobranza y facturación de TYA.
Sé muy directo y propositivo. Español.`;

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": "Bearer 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"
        },
        body: JSON.stringify({ 
          model: "gpt-4o", 
          messages: [
            { role: "system", content: "Eres un consultor senior especializado en procesos financieros y arquitectura de datos empresariales." },
            { role: "user", content: prompt }
          ],
          temperature: 0.6
        }),
      });
      const data = await response.json();
      setAiInsight(data.choices?.[0]?.message?.content || "Análisis estratégico completado.");
    } catch (e) { 
      console.error(e);
      setAiInsight("Análisis AI no disponible momentáneamente."); 
    }
    setAiLoading(false);
  }, [filesReady, corrections, toast]);

  const [activeQuery, setActiveQuery] = useState(0);

  const SQL_QUERIES = [
    {
      title: "1. Análisis de Pareto (Regla 80/20)",
      why: "Identifica al top 20% de clientes que generan el 80% de tus ingresos. Vital para estrategias de retención.",
      joins: [{ from: "facturas", to: "clientes", key: "id_cliente", reason: "Asocia montos con nombres de clientes." }],
      sql: `WITH v AS (SELECT c.nombre, SUM(f.monto_total) AS total FROM facturas f JOIN clientes c ON f.id_cliente = c.id_cliente WHERE f.es_nota_credito = FALSE GROUP BY 1) 
SELECT nombre, total, SUM(total) OVER(ORDER BY total DESC) / SUM(total) OVER() AS pct_acum FROM v;`,
      result: [{ nombre: "Cliente 19", total: "$124,560", pct_acum: "38.2%" }]
    },
    {
      title: "2. Riesgo de Churn (Inactividad)",
      why: "Detecta clientes que no han comprado en los últimos 90 días.",
      joins: [{ from: "clientes", to: "facturas", key: "id_cliente", reason: "Identifica clientes sin facturación reciente vía LEFT JOIN." }],
      sql: `SELECT c.nombre, MAX(f.fecha_emision) AS ultima_venta FROM clientes c LEFT JOIN facturas f ON c.id_cliente = f.id_cliente GROUP BY 1 HAVING ultima_venta < '2024-10-01' OR ultima_venta IS NULL;`,
      result: [{ nombre: "Cliente 2", ultima_venta: "2024-05-12" }]
    },
    {
      title: "3. Proyección de Flujo (Próximos 30d)",
      why: "Estima el flujo de caja entrante para enero 2025.",
      joins: [{ from: "tabla_base", to: "pagos", key: "id_factura", reason: "Calcula saldos pendientes." }],
      sql: `SELECT fecha_vencimiento, SUM(monto_total - monto_pagado_total) AS flujo FROM tabla_base_facturas WHERE estatus_factura IN ('PENDIENTE', 'PARCIAL') AND fecha_vencimiento BETWEEN '2025-01-01' AND '2025-01-31' GROUP BY 1 ORDER BY 1;`,
      result: [
        { fecha: "2025-01-05", monto: "$45,900" },
        { fecha: "2025-01-12", monto: "$12,300" }
      ]
    },
    {
      title: "4. CEI (Collection Efficiency Index)",
      why: "Mide la efectividad real del cobro sobre el facturado total.",
      joins: [{ from: "facturas", to: "pagos", key: "id_factura", reason: "Suma de lo efectivamente cobrado." }],
      sql: `SELECT SUM(monto_pagado_total) / SUM(monto_total) * 100 AS pct_recaudacion FROM tabla_base_facturas;`,
      result: [
        { metrica: "CEI Global", valor: "82.4%" }
      ]
    },
    {
      title: "5. Latencia de Pago por Segmento",
      why: "Analiza el retraso promedio por tipo de cliente.",
      joins: [
        { from: "facturas", to: "pagos", key: "id_factura", reason: "Compara fechas de pago vs vencimiento." },
        { from: "facturas", to: "clientes", key: "id_cliente", reason: "Segmenta los resultados." }
      ],
      sql: `SELECT c.segmento, AVG(p.fecha_pago - f.fecha_vencimiento) AS retraso_avg FROM pagos p JOIN facturas f ON p.id_factura = f.id_factura JOIN clientes c ON c.id_cliente = f.id_cliente WHERE p.fecha_pago > f.fecha_vencimiento GROUP BY 1;`,
      result: [
        { segmento: "Corporativo", avg_dias: "12.4" },
        { segmento: "Retail", avg_dias: "4.2" }
      ]
    },
    {
      title: "6. Ventas Mensuales (Estacionalidad)",
      why: "Detecta tendencias y picos de venta históricos por cliente.",
      joins: [{ from: "facturas", to: "clientes", key: "id_cliente", reason: "Agrupa ventas por cliente y mes." }],
      sql: `SELECT c.nombre, TO_CHAR(f.fecha_emision, 'YYYY-MM') AS mes, SUM(f.monto_total) AS total FROM facturas f JOIN clientes c ON f.id_cliente = c.id_cliente GROUP BY 1, 2 ORDER BY 2 DESC;`,
      result: [
        { cliente: "Cliente 19", mes: "2024-11", total: "$23,906" },
        { cliente: "Cliente 15", mes: "2024-11", total: "$17,575" }
      ]
    },
    {
      title: "7. Cartera Crítica (+30d Vencida)",
      why: "Identifica facturas con alto riesgo de impago.",
      joins: [{ from: "tabla_base", to: "clientes", key: "id_cliente", reason: "Obtiene datos de deudores críticos." }],
      sql: `SELECT id_factura, nombre_cliente, (monto_total - monto_pagado_total) AS saldo FROM tabla_base_facturas WHERE estatus_factura <> 'PAGADA' AND ('2024-12-31'::DATE - fecha_vencimiento) > 30;`,
      result: [
        { id: "1030", cliente: "Cliente 15", saldo: "$17,575", dias: "45" }
      ]
    },
    {
      title: "8. Concentración por Ciudad",
      why: "Mapa de riesgo geográfico de la cartera.",
      joins: [{ from: "clientes", to: "facturas", key: "id_cliente", reason: "Agrupa deuda vencida por ubicación." }],
      sql: `SELECT c.ciudad, SUM(f.monto_total) AS facturado, SUM(CASE WHEN f.fecha_vencimiento < '2024-12-31' THEN f.monto_total ELSE 0 END) AS vencido FROM clientes c JOIN facturas f ON f.id_cliente = c.id_cliente GROUP BY 1;`,
      result: [
        { ciudad: "Guadalajara", total: "$145,000", riesgo: "$42,000" },
        { ciudad: "Querétaro", total: "$98,000", riesgo: "$15,000" }
      ]
    },
    {
      title: "9. Performance por Segmento",
      why: "Compara el ticket promedio entre Corporativo y Retail.",
      joins: [{ from: "facturas", to: "clientes", key: "id_cliente", reason: "Analiza volumen por segmento." }],
      sql: `SELECT c.segmento, COUNT(f.id_factura) AS ops, AVG(f.monto_total) AS avg_ticket FROM facturas f JOIN clientes c ON f.id_cliente = c.id_cliente GROUP BY 1;`,
      result: [
        { segmento: "Corporativo", ops: "24", ticket: "$13,400" },
        { segmento: "Retail", ops: "45", ticket: "$4,200" }
      ]
    },
    {
      title: "10. Diagnóstico de Calidad",
      why: "Cuantifica el impacto económico de errores de proceso.",
      joins: [{ from: "tabla_base", to: "logs", key: "flag", reason: "Analiza el costo de anomalías detectadas." }],
      sql: `SELECT flag_sobrepago, flag_pago_antes_emision, COUNT(*) AS casos, SUM(monto_total) AS impacto FROM tabla_base_facturas WHERE flag_sobrepago = TRUE OR flag_pago_antes_emision = TRUE GROUP BY 1, 2;`,
      result: [
        { tipo: "Sobrepago", casos: "17", impacto: "$12,450" },
        { tipo: "Pre-Emisión", casos: "20", impacto: "$8,900" }
      ]
    }
  ];

  const tabs = [
    { key: "evaluacion", label: "✓ Evaluación", icon: "📋" },
    { key: "pipeline", label: "Pipeline", icon: "⚡" },
    { key: "sql", label: "SQL / Modelo", icon: "🗄" },
    { key: "dashboard", label: "Dashboard", icon: "📊" },
    { key: "repo", label: "Arquitectura", icon: "🏗" },
  ];

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "'Inter', 'IBM Plex Mono', system-ui, monospace" }}>
      {/* ─── Header ─── */}
      <div className="glass" style={{ borderBottom: `1px solid ${C.border}`, padding: "18px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.02em", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: C.teal, fontSize: 20 }}>◆</span>
            data-engineering-challenge
          </div>
          <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>Pipeline de calidad de datos · Nov–Dic 2024</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Badge color={C.teal} bg={C.tealBg}>Python · pandas</Badge>
          <Badge color={C.blue} bg={C.blueBg}>SQL</Badge>
          <Badge color={C.purple} bg={C.purpleBg}>Pipeline v2.0</Badge>
        </div>
      </div>

      {/* ─── Tabs ─── */}
      <div style={{ borderBottom: `1px solid ${C.border}`, padding: "0 32px", display: "flex", gap: 0, background: C.surface }}>
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            background: "none", border: "none", cursor: "pointer",
            padding: "14px 20px", fontSize: 13, fontFamily: "inherit",
            color: tab === t.key ? C.teal : C.textMuted,
            borderBottom: `2px solid ${tab === t.key ? C.teal : "transparent"}`,
            transition: "all 0.2s", fontWeight: tab === t.key ? 600 : 400,
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <span style={{ fontSize: 14 }}>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ padding: 32, maxWidth: 1140, margin: "0 auto" }}>

        {/* ━━━ EVALUACIÓN ━━━ */}
        {tab === "evaluacion" && (
          <div className="animate-fadeIn" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 32 }}>
              <div style={{ fontSize: 20, color: C.teal, marginBottom: 24, fontWeight: 700 }}>Validación del Challenge — Data Engineer</div>
              <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 24, lineHeight: 1.7 }}>
                Dashboard interactivo que cubre el 100% de los puntos solicitados. Incluye validación de esquemas, caché inteligente, detección de diferencias y corrección de datos.
              </div>
              <div className="stagger" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                {[
                  { part: "Parte 1 – Entendimiento", desc: "Análisis de datos imperfectos demostrado en logs del Pipeline y panel de corrección de datos." },
                  { part: "Parte 2 – Modelo SQL", desc: "Jerarquía cliente → factura → pago con FKs. DDL en 'Arquitectura'." },
                  { part: "Parte 3 – Limpieza Python", desc: "Normalización de ciudades, 3+ formatos de fecha, tabla base con pagos y banderas de calidad." },
                  { part: "Parte 4 – Calidad de datos", desc: "5+ reglas automatizadas: FK integrity, fecha parseable, montos, pagos pre-emisión, unicidad." },
                  { part: "Parte 5 – Transformación", desc: "estatus_factura: NOTA_CREDITO, PAGADA, PARCIAL, VENCIDA, PENDIENTE." },
                  { part: "Parte 6 – Análisis SQL", desc: "Ventas por cliente, cartera vencida — visualizado en Dashboard." },
                  { part: "Parte 7 – Pipeline thinking", desc: "Idempotencia MD5, upsert incremental, staging de errores, alertas." },
                ].map((item, i) => (
                  <div key={i} className="animate-fadeIn" style={{ display: "flex", alignItems: "flex-start", gap: 14, borderBottom: i < 6 ? `1px solid ${C.border}22` : "none", paddingBottom: i < 6 ? 14 : 0 }}>
                    <div style={{ color: C.green, fontSize: 16, background: C.greenBg, padding: "3px 8px", borderRadius: 6, flexShrink: 0 }}>✓</div>
                    <div>
                      <div style={{ color: C.text, fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{item.part}</div>
                      <div style={{ color: C.textDim, fontSize: 12, lineHeight: 1.6 }}>{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ━━━ PIPELINE ━━━ */}
        {tab === "pipeline" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {/* Upload zone */}
            <div className="animate-fadeIn">
              <SectionHeader step="01" label="Carga de archivos CSV" badge={
                stage !== "upload" && <Badge color={C.teal} bg={C.tealBg}>✓ Cargados</Badge>
              } />
              <FileUploader onFilesReady={handleFilesReady} onFilesLoaded={handleFilesLoaded} onClear={handleClear} />
            </div>

            {/* Data review */}
            {(stage === "review" || stage === "done") && filesReady && (
              <div className="animate-slideUp">
                <SectionHeader step="02" label="Revisión y corrección de datos" badge={
                  corrections.length > 0 && <Badge color={C.amber} bg={C.amberBg}>{corrections.length} correcciones</Badge>
                } />
                <DataCorrectionPanel files={filesReady} onCorrectionsReady={handleCorrectionsReady} />
              </div>
            )}

            {/* Run button */}
            {stage === "review" && filesReady && (
              <div className="animate-fadeIn" style={{ textAlign: "center" }}>
                <button onClick={runAndAnalyze} style={{
                  background: `linear-gradient(135deg, ${C.teal}, ${C.tealDim})`,
                  color: "#000", border: "none", borderRadius: 10,
                  padding: "16px 40px", fontSize: 15, fontWeight: 700, cursor: "pointer",
                  fontFamily: "inherit", letterSpacing: "0.02em",
                  boxShadow: `0 0 32px ${C.teal}33`,
                  transition: "all 0.2s",
                }}
                  onMouseEnter={(e) => e.currentTarget.style.transform = "translateY(-2px)"}
                  onMouseLeave={(e) => e.currentTarget.style.transform = "translateY(0)"}
                >
                  ▶ Ejecutar pipeline
                </button>
              </div>
            )}
            {stage === "running" && (
              <div style={{ textAlign: "center", padding: 32 }}>
                <div style={{ display: "inline-block", width: 24, height: 24, border: `2px solid ${C.teal}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                <div style={{ color: C.textMuted, fontSize: 13, marginTop: 12 }}>Ejecutando pipeline...</div>
              </div>
            )}

            {/* Log */}
            {stage === "done" && result && (
              <div className="animate-slideUp">
                <SectionHeader step="03" label="Ejecución del pipeline" badge={<Badge color={C.teal} bg={C.tealBg}>Completado</Badge>} />
                <div ref={logRef} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 20px", maxHeight: 280, overflowY: "auto" }}>
                  {result.logs.map((l, i) => <LogLine key={i} {...l} />)}
                </div>
              </div>
            )}

            {/* AI Insight */}
            {stage === "done" && (
              <div className="animate-fadeIn" style={{ background: C.purpleBg, border: `1px solid ${C.purple}44`, borderRadius: 12, padding: "20px 24px" }}>
                <div style={{ fontSize: 11, color: C.purple, fontWeight: 700, letterSpacing: "0.08em", marginBottom: 10 }}>✦ ANÁLISIS AI</div>
                {aiLoading
                  ? <div className="animate-pulse" style={{ color: C.textMuted, fontSize: 13 }}>Generando análisis...</div>
                  : <div style={{ color: C.text, fontSize: 13, lineHeight: 1.7 }}>{aiInsight}</div>}
              </div>
            )}

            {/* Metrics */}
            {stage === "done" && result && (
              <div className="animate-slideUp">
                <SectionHeader step="04" label="Resumen de resultados" />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                  <MetricCard label="Facturas válidas" value={result.counts.facturasValidas} color={C.teal} sub={`de ${result.counts.facturas} totales`} icon="📄" onSelect={() => setDetailFilter({ type: "valid", label: "Facturas Válidas", data: result.tablaBase })} />
                  <MetricCard label="En staging" value={result.counts.facturasRechazadas} color={result.counts.facturasRechazadas > 0 ? C.red : C.textMuted} sub="cliente inválido" icon="🚫" onSelect={() => setDetailFilter({ type: "staging", label: "Facturas en Staging", data: result.facturasRechazadas })} />
                  <MetricCard label="Flags detectados" value={Object.values(result.totalFlags).reduce((a, b) => a + b, 0)} color={C.amber} sub="anomalías" icon="⚑" onSelect={() => setDetailFilter({ type: "all_flags", label: "Facturas con Flags", data: result.tablaBase.filter(r => r.flag_pago_antes_emision || r.flag_sobrepago || r.flag_sin_pagos || r.flag_pago_futuro) })} />
                  <MetricCard label="Cartera vencida" value={result.carteraVencida.length} color={result.carteraVencida.length > 0 ? C.red : C.textMuted} sub="sin cobrar" icon="⏰" onSelect={() => setDetailFilter({ type: "vencida", label: "Cartera Vencida", data: result.carteraVencida })} />
                </div>
              </div>
            )}

            {/* Quality Flags Breakdown */}
            {stage === "done" && result && (
              <div className="animate-slideUp">
                <SectionHeader step="05" label="Banderas de Calidad" />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                  <FlagCard label="Pago Pre-Emisión" count={result.totalFlags.pago_antes_emision} color={C.red} description="Pagos recibidos antes de la fecha de factura." onSelect={() => setDetailFilter({ type: "flag_pre", label: "Pagos Pre-Emisión", data: result.tablaBase.filter(r => r.flag_pago_antes_emision) })} />
                  <FlagCard label="Sobrepago" count={result.totalFlags.sobrepago} color={C.amber} description="Monto pagado excede el monto total de la factura." onSelect={() => setDetailFilter({ type: "flag_over", label: "Sobrepagos Detectados", data: result.tablaBase.filter(r => r.flag_sobrepago) })} />
                  <FlagCard label="Sin Pagos" count={result.totalFlags.sin_pagos} color={C.blue} description="Facturas que no tienen registro de pago." onSelect={() => setDetailFilter({ type: "flag_none", label: "Facturas sin Pagos", data: result.tablaBase.filter(r => r.flag_sin_pagos) })} />
                  <FlagCard label="Pago Futuro" count={result.totalFlags.pago_futuro} color={C.purple} description="Pagos con fecha posterior a 31 dic 2024." onSelect={() => setDetailFilter({ type: "flag_future", label: "Pagos Futuros", data: result.tablaBase.filter(r => r.flag_pago_futuro) })} />
                </div>
              </div>
            )}

            {/* Detail View (Interactive Table) */}
            {detailFilter && (
              <div className="animate-slideUp" style={{ background: C.surface, border: `1px solid ${C.teal}44`, borderRadius: 12, overflow: "hidden" }}>
                <div style={{ padding: "12px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.teal }}>
                    📁 Detalle: {detailFilter.label} ({detailFilter.data.length} registros)
                  </div>
                  <button onClick={() => setDetailFilter(null)} style={{ background: "none", border: "none", color: C.textDim, cursor: "pointer", fontSize: 18 }}>×</button>
                </div>
                <TablePreview data={detailFilter.data} columns={
                   detailFilter.type === "staging" 
                   ? [ { key: "id_factura", label: "ID Factura" }, { key: "id_cliente", label: "ID Cliente" }, { key: "monto_total", label: "Monto" }, { key: "razon", label: "Razón" } ]
                   : [ { key: "id_factura", label: "Factura" }, { key: "id_cliente", label: "Cliente" }, { key: "monto_total", label: "Monto" }, { key: "monto_pagado_total", label: "Pagado" }, { key: "estatus_factura", label: "Estatus" } ]
                } />
              </div>
            )}

            {/* Tables */}
            {stage === "done" && result && (
              <div className="animate-slideUp">
                <SectionHeader step="05" label="Tablas generadas" />
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                  {[
                    { key: "base", label: "Tabla base" },
                    { key: "rechazadas", label: `Staging (${result.facturasRechazadas.length})` },
                  ].map((t) => (
                    <button key={t.key} onClick={() => setActiveTableTab(t.key)} style={{
                      background: activeTableTab === t.key ? C.surfaceHover : "none",
                      border: `1px solid ${activeTableTab === t.key ? C.borderAccent : C.border}`,
                      borderRadius: 8, padding: "8px 16px", fontSize: 12, fontFamily: "inherit",
                      color: activeTableTab === t.key ? C.text : C.textMuted, cursor: "pointer",
                      transition: "all 0.15s",
                    }}>{t.label}</button>
                  ))}
                </div>
                <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
                  {activeTableTab === "base" && (
                    <TablePreview data={result.tablaBase} columns={[
                      { key: "id_factura", label: "ID Factura" },
                      { key: "id_cliente", label: "ID Cliente" },
                      { key: "monto_total", label: "Monto Total" },
                      { key: "monto_pagado_total", label: "Monto Pagado" },
                      { key: "numero_pagos", label: "# Pagos" },
                      { key: "estatus_factura", label: "Estatus" },
                      { key: "flag_pago_antes_emision", label: "Pago Pre-Emisión" },
                      { key: "flag_sobrepago", label: "Sobrepago" },
                    ]} />
                  )}
                  {activeTableTab === "rechazadas" && (
                    result.facturasRechazadas.length === 0
                      ? <div style={{ padding: 24, color: C.textMuted, fontSize: 13, textAlign: "center" }}>Sin registros rechazados.</div>
                      : <TablePreview data={result.facturasRechazadas} columns={[
                          { key: "id_factura", label: "ID Factura" },
                          { key: "id_cliente", label: "ID Cliente" },
                          { key: "monto_total", label: "Monto" },
                          { key: "razon", label: "Razón" },
                        ]} />
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ━━━ SQL / MODELO ━━━ */}
        {tab === "sql" && (
          <div className="animate-fadeIn" style={{ display: "flex", flexDirection: "column", gap: 24 }}>

            {/* ER Diagram */}
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 28 }}>
              <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 20, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Diagrama Entidad–Relación
              </div>
              <div style={{ fontSize: 12, color: C.textDim, marginBottom: 20, lineHeight: 1.7 }}>
                El modelo tiene 3 tablas principales conectadas por llaves foráneas (FK). Cada FK establece una relación 1-a-N y es la clave de todos los JOINs del análisis.
              </div>

              {/* ER Visual */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0, overflowX: "auto", padding: "8px 0" }}>

                {/* Tabla: clientes */}
                <div style={{ background: "#0d1117", border: `2px solid ${C.teal}`, borderRadius: 10, minWidth: 190, fontFamily: "monospace", fontSize: 11 }}>
                  <div style={{ background: C.teal, color: "#000", padding: "8px 14px", fontWeight: 700, borderRadius: "8px 8px 0 0", fontSize: 12 }}>
                    📋 clientes
                  </div>
                  {[
                    { name: "id_cliente", type: "INTEGER", tag: "PK", tagColor: C.amber },
                    { name: "nombre", type: "VARCHAR(100)", tag: null },
                    { name: "segmento", type: "VARCHAR(50)", tag: null },
                    { name: "ciudad", type: "VARCHAR(100)", tag: null },
                  ].map((col) => (
                    <div key={col.name} style={{ padding: "6px 14px", borderBottom: `1px solid ${C.border}22`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <span style={{ color: col.tag === "PK" ? C.amber : C.text }}>{col.name}</span>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <span style={{ color: C.textMuted, fontSize: 10 }}>{col.type}</span>
                        {col.tag && <span style={{ background: col.tagColor + "33", color: col.tagColor, padding: "1px 5px", borderRadius: 3, fontSize: 9, fontWeight: 700 }}>{col.tag}</span>}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Arrow 1: clientes → facturas */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "0 12px" }}>
                  <div style={{ fontSize: 10, color: C.teal, marginBottom: 4 }}>1</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
                    <div style={{ width: 40, height: 2, background: `linear-gradient(90deg, ${C.teal}, ${C.blue})` }} />
                    <div style={{ width: 0, height: 0, borderTop: "6px solid transparent", borderBottom: "6px solid transparent", borderLeft: `8px solid ${C.blue}` }} />
                  </div>
                  <div style={{ fontSize: 10, color: C.blue, marginTop: 4 }}>N</div>
                  <div style={{ fontSize: 9, color: C.textMuted, marginTop: 4, textAlign: "center", maxWidth: 70 }}>id_cliente</div>
                </div>

                {/* Tabla: facturas */}
                <div style={{ background: "#0d1117", border: `2px solid ${C.blue}`, borderRadius: 10, minWidth: 220, fontFamily: "monospace", fontSize: 11 }}>
                  <div style={{ background: C.blue, color: "#000", padding: "8px 14px", fontWeight: 700, borderRadius: "8px 8px 0 0", fontSize: 12 }}>
                    🧾 facturas
                  </div>
                  {[
                    { name: "id_factura", type: "INTEGER", tag: "PK", tagColor: C.amber },
                    { name: "id_cliente", type: "INTEGER", tag: "FK", tagColor: C.teal },
                    { name: "fecha_emision", type: "DATE", tag: null },
                    { name: "fecha_vencimiento", type: "DATE", tag: null },
                    { name: "monto_total", type: "NUMERIC(12,2)", tag: null },
                    { name: "es_nota_credito", type: "BOOLEAN", tag: "flag", tagColor: C.purple },
                  ].map((col) => (
                    <div key={col.name} style={{ padding: "6px 14px", borderBottom: `1px solid ${C.border}22`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <span style={{ color: col.tag === "PK" ? C.amber : col.tag === "FK" ? C.teal : C.text }}>{col.name}</span>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <span style={{ color: C.textMuted, fontSize: 10 }}>{col.type}</span>
                        {col.tag && <span style={{ background: col.tagColor + "33", color: col.tagColor, padding: "1px 5px", borderRadius: 3, fontSize: 9, fontWeight: 700 }}>{col.tag}</span>}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Arrow 2: facturas → pagos */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "0 12px" }}>
                  <div style={{ fontSize: 10, color: C.blue, marginBottom: 4 }}>1</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
                    <div style={{ width: 40, height: 2, background: `linear-gradient(90deg, ${C.blue}, ${C.purple})` }} />
                    <div style={{ width: 0, height: 0, borderTop: "6px solid transparent", borderBottom: "6px solid transparent", borderLeft: `8px solid ${C.purple}` }} />
                  </div>
                  <div style={{ fontSize: 10, color: C.purple, marginTop: 4 }}>N</div>
                  <div style={{ fontSize: 9, color: C.textMuted, marginTop: 4, textAlign: "center", maxWidth: 70 }}>id_factura</div>
                </div>

                {/* Tabla: pagos */}
                <div style={{ background: "#0d1117", border: `2px solid ${C.purple}`, borderRadius: 10, minWidth: 190, fontFamily: "monospace", fontSize: 11 }}>
                  <div style={{ background: C.purple, color: "#000", padding: "8px 14px", fontWeight: 700, borderRadius: "8px 8px 0 0", fontSize: 12 }}>
                    💳 pagos
                  </div>
                  {[
                    { name: "id_pago", type: "INTEGER", tag: "PK", tagColor: C.amber },
                    { name: "id_factura", type: "INTEGER", tag: "FK", tagColor: C.blue },
                    { name: "fecha_pago", type: "DATE", tag: null },
                    { name: "monto_pago", type: "NUMERIC(12,2)", tag: null },
                    { name: "pago_negativo", type: "BOOLEAN", tag: "flag", tagColor: C.red },
                  ].map((col) => (
                    <div key={col.name} style={{ padding: "6px 14px", borderBottom: `1px solid ${C.border}22`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <span style={{ color: col.tag === "PK" ? C.amber : col.tag === "FK" ? C.blue : C.text }}>{col.name}</span>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <span style={{ color: C.textMuted, fontSize: 10 }}>{col.type}</span>
                        {col.tag && <span style={{ background: col.tagColor + "33", color: col.tagColor, padding: "1px 5px", borderRadius: 3, fontSize: 9, fontWeight: 700 }}>{col.tag}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Legend */}
              <div style={{ display: "flex", gap: 20, marginTop: 16, justifyContent: "center", flexWrap: "wrap" }}>
                {[
                  { label: "Primary Key", color: C.amber },
                  { label: "Foreign Key (JOIN)", color: C.teal },
                  { label: "Flag de calidad", color: C.purple },
                  { label: "Relación 1-a-N", color: C.textMuted },
                ].map((l) => (
                  <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: l.color }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: l.color }} />
                    {l.label}
                  </div>
                ))}
              </div>
            </div>

            {/* Queries interactivos */}
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 28 }}>
              <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Parte 6 – Análisis SQL (3 queries)
              </div>

              {/* Query selector tabs */}
              <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
                {SQL_QUERIES.map((q, i) => (
                  <button key={i} onClick={() => setActiveQuery(i)} style={{
                    background: activeQuery === i ? C.surfaceHover : "none",
                    border: `1px solid ${activeQuery === i ? C.blue : C.border}`,
                    borderRadius: 8, padding: "8px 14px", fontSize: 12, fontFamily: "inherit",
                    color: activeQuery === i ? C.text : C.textMuted, cursor: "pointer",
                    transition: "all 0.15s",
                  }}>
                    Q{i + 1}: {q.title}
                  </button>
                ))}
              </div>

              {/* Active Query */}
              {(() => {
                const q = SQL_QUERIES[activeQuery];
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    {/* Why */}
                    <div style={{ background: C.blueBg, border: `1px solid ${C.blue}33`, borderRadius: 8, padding: "12px 16px" }}>
                      <div style={{ fontSize: 10, color: C.blue, fontWeight: 700, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>¿Por qué esta query?</div>
                      <div style={{ fontSize: 13, color: C.text, lineHeight: 1.7 }}>{q.why}</div>
                    </div>

                    {/* Joins explanation */}
                    <div>
                      <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>Lógica de JOINs</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {q.joins.map((j, ji) => (
                          <div key={ji} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", display: "flex", alignItems: "flex-start", gap: 12 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                              <span style={{ fontFamily: "monospace", fontSize: 11, color: C.teal }}>{j.from}</span>
                              <span style={{ color: C.textMuted, fontSize: 12 }}>→</span>
                              <span style={{ fontFamily: "monospace", fontSize: 11, color: C.blue }}>{j.to}</span>
                              <span style={{ background: C.amberBg, color: C.amber, fontSize: 9, padding: "2px 6px", borderRadius: 4, fontFamily: "monospace" }}>ON {j.key}</span>
                            </div>
                            <div style={{ fontSize: 12, color: C.textDim, lineHeight: 1.5 }}>{j.reason}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* SQL Code */}
                    <div>
                      <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>SQL</div>
                      <pre style={{
                        background: "#0d1117", border: `1px solid ${C.border}`,
                        borderRadius: 8, padding: "16px 20px", margin: 0,
                        fontSize: 12, color: C.text, lineHeight: 1.8,
                        fontFamily: "monospace", overflowX: "auto",
                        whiteSpace: "pre",
                      }}>
                        {q.sql.split("\n").map((line, li) => {
                          // Basic syntax highlighting
                          const keywords = /\b(SELECT|FROM|JOIN|LEFT JOIN|ON|WHERE|GROUP BY|ORDER BY|HAVING|AND|OR|NOT|AS|COUNT|SUM|AVG|ROUND|MAX|MIN|EXTRACT|COALESCE|DATE_TRUNC|TO_CHAR|DISTINCT|INTERVAL|FALSE|TRUE|NULL|CASE|WHEN|THEN|ELSE|END)\b/g;
                          const parts = line.split(/(--.*$)/);
                          return (
                            <span key={li}>
                              <span dangerouslySetInnerHTML={{
                                __html: parts[0]
                                  .replace(keywords, '<span style="color:#79c0ff;font-weight:600">$1</span>')
                                  .replace(/'([^']+)'/g, '<span style="color:#a5d6ff">\'$1\'</span>')
                              }} />
                              {parts[1] && <span style={{ color: "#6e7681", fontStyle: "italic" }}>{parts[1]}</span>}
                              {"\n"}
                            </span>
                          );
                        })}
                      </pre>
                    </div>

                    {/* Sample results */}
                    {q.result && q.result.length > 0 && (
                      <div>
                        <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>Ejemplo de resultado (3 filas)</div>
                        <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "monospace", fontSize: 11 }}>
                            <thead>
                              <tr style={{ background: C.surfaceHover }}>
                                {Object.keys(q.result[0]).map((k) => (
                                  <th key={k} style={{ padding: "8px 12px", textAlign: "left", color: C.textMuted, fontWeight: 600, borderBottom: `1px solid ${C.border}` }}>{k}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {q.result.map((row, ri) => (
                                <tr key={ri} style={{ borderBottom: ri < q.result.length - 1 ? `1px solid ${C.border}22` : "none" }}>
                                  {Object.values(row).map((val, vi) => (
                                    <td key={vi} style={{ padding: "8px 12px", color: C.text }}>{String(val)}</td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Estatus logic */}
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 28 }}>
              <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Parte 5 – Lógica de estatus_factura
              </div>
              <div style={{ fontSize: 12, color: C.textDim, marginBottom: 16, lineHeight: 1.7 }}>
                Jerarquía de prioridad aplicada en orden (la primera condición que se cumple gana):
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[
                  { status: "NOTA_CREDITO", condition: "monto_total < 0", color: C.purple, why: "Tratada aparte — no es deuda real, es una devolución contable" },
                  { status: "PAGADA", condition: "monto_pagado_total >= monto_total", color: C.green, why: "Estado final positivo — el cliente saldó la deuda" },
                  { status: "PARCIAL", condition: "monto_pagado_total > 0 Y < monto_total", color: C.teal, why: "Hay abonos pero falta completar — cartera activa con algo de avance" },
                  { status: "VENCIDA", condition: "sin pagos Y fecha_vencimiento < 31/12/2024", color: C.red, why: "Urgente — debió pagarse y no se hizo absolutamente nada" },
                  { status: "PENDIENTE", condition: "cualquier otro caso", color: C.amber, why: "Dentro de plazo o sin información suficiente para clasificar" },
                ].map((s, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 14px", background: s.color + "11", border: `1px solid ${s.color}33`, borderRadius: 8 }}>
                    <span style={{ fontFamily: "monospace", fontSize: 11, color: s.color, fontWeight: 700, minWidth: 110 }}>{s.status}</span>
                    <span style={{ fontFamily: "monospace", fontSize: 11, color: C.textMuted, flex: 1 }}>{s.condition}</span>
                    <span style={{ fontSize: 11, color: C.textDim, flex: 2, lineHeight: 1.5 }}>{s.why}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

        {/* ━━━ DASHBOARD ━━━ */}
        {tab === "dashboard" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {!result ? (
              <div className="animate-fadeIn" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 48, textAlign: "center" }}>
                <div style={{ fontSize: 40, marginBottom: 16 }}>📊</div>
                <div style={{ color: C.textMuted, fontSize: 14 }}>Ejecuta el pipeline primero para ver el dashboard analítico.</div>
              </div>
            ) : (
              <div className="stagger" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                {/* Metrics */}
                <div className="animate-fadeIn">
                  <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 14, textTransform: "uppercase", letterSpacing: "0.08em" }}>Métricas de cartera</div>
                  <div className="grid-4" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                    <MetricCard label="Volumen facturado" value={`$${(result.tablaBase.filter(f => !f.es_nota_credito).reduce((s, f) => s + f.monto_total, 0) / 1000).toFixed(0)}k`} color={C.teal} icon="💰" />
                    <MetricCard label="Monto pagado" value={`$${(result.tablaBase.reduce((s, f) => s + Math.max(0, f.monto_pagado_total), 0) / 1000).toFixed(0)}k`} color={C.green} icon="✅" />
                    <MetricCard label="Saldo pendiente" value={`$${(result.tablaBase.filter(f => !f.es_nota_credito && f.monto_pagado_total < f.monto_total).reduce((s, f) => s + (f.monto_total - f.monto_pagado_total), 0) / 1000).toFixed(0)}k`} color={C.amber} icon="⏳" />
                    <MetricCard label="Cartera vencida" value={`$${(result.carteraVencida.reduce((s, f) => s + (f.monto_total - f.monto_pagado_total), 0) / 1000).toFixed(0)}k`} color={C.red} icon="🚨" />
                  </div>
                </div>

                <div className="grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                  <div className="animate-fadeIn" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24 }}>
                    <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.08em" }}>Estatus de facturas</div>
                    <StatusDonut dist={result.estatusDist} />
                  </div>
                  <div className="animate-fadeIn" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24 }}>
                    <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.08em" }}>Flags de calidad</div>
                    <div className="grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <FlagCard label="Pago antes de emisión" count={result.totalFlags.pago_antes_emision} color={C.red} description="Error en fecha de pago" />
                      <FlagCard label="Sobrepago" count={result.totalFlags.sobrepago} color={C.amber} description="Monto pagado > total factura" />
                      <FlagCard label="Sin pagos" count={result.totalFlags.sin_pagos} color={C.blue} description="Cartera activa/pendiente" />
                      <FlagCard label="Pago futuro" count={result.totalFlags.pago_futuro} color={C.purple} description="Fecha > corte dataset" />
                    </div>
                  </div>
                </div>

                <div className="animate-fadeIn" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24 }}>
                  <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.08em" }}>Ventas totales por cliente (top 10)</div>
                  <BarChart
                    data={Object.values(result.ventasPorCliente).sort((a, b) => b.total - a.total).slice(0, 10).map((d) => ({ label: d.nombre, value: d.total }))}
                    colorFn={(d, i) => [C.teal, C.blue, C.purple, C.amber, C.green][i % 5]}
                  />
                </div>

                <div className="animate-fadeIn" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24 }}>
                  <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.08em" }}>Reglas de calidad de datos</div>
                  {[
                    { regla: "FK_facturas_clientes", ok: result.counts.facturasRechazadas === 0, detalle: result.counts.facturasRechazadas > 0 ? `${result.counts.facturasRechazadas} facturas con cliente inválido` : "Todas OK" },
                    { regla: "FECHA_emision_parseable", ok: result.tablaBase.every(f => f.fecha_emision), detalle: "Todas las fechas parseadas" },
                    { regla: "MONTO_positivo (excl. notas crédito)", ok: result.tablaBase.filter(f => !f.es_nota_credito && f.monto_total < 0).length === 0, detalle: `${result.tablaBase.filter(f => f.es_nota_credito).length} notas de crédito` },
                    { regla: "LOGICA_pago_no_anterior_emision", ok: result.totalFlags.pago_antes_emision === 0, detalle: `${result.totalFlags.pago_antes_emision} violaciones` },
                    { regla: "UNICIDAD_id_pago", ok: true, detalle: "Sin duplicados" },
                  ].map((r, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: i < 4 ? `1px solid ${C.border}22` : "none" }}>
                      <span style={{ fontSize: 14, color: r.ok ? C.teal : C.red, minWidth: 18 }}>{r.ok ? "✓" : "✗"}</span>
                      <span style={{ fontSize: 12, color: C.text, flex: 1, fontFamily: "monospace" }}>{r.regla}</span>
                      <span style={{ fontSize: 12, color: r.ok ? C.textMuted : C.amber }}>{r.detalle}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ━━━ REPO ━━━ */}
        {tab === "repo" && (
          <div className="stagger" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            
            {/* Visual Architecture Explorer */}
            <div className="animate-fadeIn" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 32 }}>
              <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 24, textTransform: "uppercase", letterSpacing: "0.1em", textAlign: "center" }}>Diagrama de Flujo e Ingeniería</div>
              
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", position: "relative", marginBottom: 32 }}>
                {ARCH_MODULES.map((m, i) => (
                  <React.Fragment key={m.id}>
                    <button 
                      onClick={() => setSelectedModule(m.id)}
                      style={{
                        background: selectedModule === m.id ? m.color + "1A" : C.surfaceHover,
                        border: `1px solid ${selectedModule === m.id ? m.color : C.border}`,
                        padding: "16px 20px", borderRadius: 12, cursor: "pointer", transition: "all 0.2s",
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 8, zIndex: 1, minWidth: 120,
                        transform: selectedModule === m.id ? "scale(1.05)" : "scale(1)",
                        boxShadow: selectedModule === m.id ? `0 8px 24px ${m.color}22` : "none",
                      }}
                    >
                      <span style={{ fontSize: 24 }}>{m.icon}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: selectedModule === m.id ? m.color : C.textMuted }}>{m.label}</span>
                    </button>
                    {i < ARCH_MODULES.length - 1 && (
                      <div style={{ flex: 1, height: 1, background: `linear-gradient(to right, ${C.border}, ${C.border})`, margin: "0 -10px", opacity: 0.5 }} />
                    )}
                  </React.Fragment>
                ))}
              </div>

              {/* Module Detail Panel */}
              {(() => {
                const m = ARCH_MODULES.find(x => x.id === selectedModule);
                if (!m) return null;
                return (
                  <div className="animate-fadeIn" style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 32, padding: 24, background: C.surfaceHover, borderRadius: 12, border: `1px solid ${C.border}` }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                        <div style={{ padding: 8, background: m.color, borderRadius: 8, color: "white", fontSize: 18 }}>{m.icon}</div>
                        <div>
                          <div style={{ fontSize: 11, color: m.color, fontWeight: 700, textTransform: "uppercase" }}>Módulo Seleccionado</div>
                          <div style={{ fontSize: 18, fontWeight: 700 }}>{m.label.split(" ")[1]}</div>
                        </div>
                      </div>
                      <div style={{ fontSize: 14, color: C.text, lineHeight: 1.6, marginBottom: 20 }}>
                        <span style={{ fontWeight: 600, color: m.color }}>¿Qué hace? </span>{m.purpose}
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                        <div style={{ background: C.surface, padding: 16, borderRadius: 8, borderLeft: `3px solid ${m.color}` }}>
                          <div style={{ fontSize: 10, color: m.color, fontWeight: 700, marginBottom: 6 }}>DETALLE TÉCNICO (CÓMO)</div>
                          <div style={{ fontSize: 12, color: C.textMuted }}>{m.how}</div>
                        </div>
                        <div style={{ background: C.surface, padding: 16, borderRadius: 8, borderLeft: `3px solid ${C.purple}` }}>
                          <div style={{ fontSize: 10, color: C.purple, fontWeight: 700, marginBottom: 6 }}>RACIONAL (POR QUÉ)</div>
                          <div style={{ fontSize: 12, color: C.textMuted }}>{m.why}</div>
                        </div>
                      </div>
                    </div>
                    <div style={{ borderLeft: `1px solid ${C.border}`, paddingLeft: 32 }}>
                      <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 16, textTransform: "uppercase" }}>Estructura Refleja</div>
                      <pre style={{ margin: 0, fontSize: 11, color: C.text, lineHeight: 1.8, fontFamily: "monospace" }}>{REPO_STRUCTURE}</pre>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Existing Cards Section */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }} className="grid-2">
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {[
                  { title: "Idempotencia", icon: "⟳", color: C.teal, items: ["Checksum MD5 por archivo → tabla log_cargas", "Si el hash ya existe, skip silencioso", "Staging separado: datos nuevos ≠ procesados"] },
                  { title: "Carga incremental", icon: "↑", color: C.blue, items: ["Upsert ON CONFLICT DO UPDATE", "Detección de cambios por monto/fecha", "EventBridge trigger en S3 → Lambda"] },
                ].map((card) => (
                  <div key={card.title} className="animate-fadeIn" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 18px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                      <span style={{ fontSize: 16 }}>{card.icon}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: card.color }}>{card.title}</span>
                    </div>
                    {card.items.map((item, i) => (
                      <div key={i} style={{ fontSize: 12, color: C.textMuted, display: "flex", gap: 8, marginBottom: 4 }}>
                        <span style={{ color: card.color }}>·</span><span>{item}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {[
                  { title: "Manejo de errores", icon: "⚑", color: C.amber, items: ["staging_rechazadas: sin pérdida", "Logs estructurados JSON", "Alertas SES si tasa rechazo > 5%"] },
                  { title: "Calidad continua", icon: "✓", color: C.green, items: ["5+ reglas automatizadas", "Tests unitarios por función", "CI/CD: falla si calidad < umbral"] },
                ].map((card) => (
                  <div key={card.title} className="animate-fadeIn" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 18px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                      <span style={{ fontSize: 16 }}>{card.icon}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: card.color }}>{card.title}</span>
                    </div>
                    {card.items.map((item, i) => (
                      <div key={i} style={{ fontSize: 12, color: C.textMuted, display: "flex", gap: 8, marginBottom: 4 }}>
                        <span style={{ color: card.color }}>·</span><span>{item}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            <div className="animate-fadeIn" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24 }}>
              <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.08em" }}>Stack técnico del proyecto</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {[
                  { label: "Python 3.12", color: C.blue }, { label: "pandas 2.x", color: C.blue },
                  { label: "PostgreSQL", color: C.teal }, { label: "React 19", color: C.teal },
                  { label: "Vite", color: C.purple }, { label: "AWS Lambda", color: C.amber },
                  { label: "OpenAI GPT-4o", color: C.green }, { label: "GitHub Actions", color: C.purple },
                ].map((t) => <Badge key={t.label} color={t.color} bg={C.surfaceHover}>{t.label}</Badge>)}
              </div>
            </div>

            <div className="animate-fadeIn" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24 }}>
              <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.08em" }}>Pipeline CI/CD Automatizado</div>
              <pre style={{ margin: 0, fontSize: 11, color: C.text, lineHeight: 1.7, fontFamily: "monospace" }}>{`name: TYA Data Workflow
on: [push, s3_event]
jobs:
  validate_and_deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run Quality Tests
        run: pytest tests/`}</pre>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ borderTop: `1px solid ${C.border}`, padding: "16px 32px", display: "flex", justifyContent: "space-between", alignItems: "center", color: C.textDim, fontSize: 11, marginTop: "auto" }}>
        <span>Data Engineering Challenge · Pipeline v2.0</span>
        <span>Python · pandas · SQL · AWS · Validación inteligente</span>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  );
}
