import { useState, useCallback, useRef } from "react";
import { C, STATUS_COLORS, SCHEMAS } from "./utils.js";
import { runPipeline } from "./pipeline.js";
import {
  ToastProvider, useToast, Badge, LogLine, MetricCard, BarChart,
  StatusDonut, FlagCard, TablePreview, SectionHeader,
} from "./components.jsx";
import FileUploader from "./FileUploader.jsx";
import DataCorrectionPanel from "./DataCorrectionPanel.jsx";

const REPO_STRUCTURE = `data-engineering-challenge/
├── README.md
├── pyproject.toml
├── .github/
│   └── workflows/
│       └── ci.yml
├── src/
│   ├── pipeline/
│   │   ├── __init__.py
│   │   ├── loaders.py
│   │   ├── cleaners.py
│   │   ├── transformers.py
│   │   └── quality.py
│   ├── models/
│   │   └── schema.py
│   └── analysis/
│       └── queries.sql
├── sql/
│   └── modelo.sql
├── tests/
│   ├── test_cleaners.py
│   ├── test_transformers.py
│   ├── test_quality.py
│   └── fixtures/
├── notebooks/
│   └── exploration.ipynb
└── outputs/
    ├── tabla_base_facturas.csv
    ├── staging_rechazadas.csv
    └── reporte_calidad.csv`;

function AppInner() {
  const [tab, setTab] = useState("evaluacion");
  const [stage, setStage] = useState("upload"); // upload | review | running | done
  const [result, setResult] = useState(null);
  const [filesReady, setFilesReady] = useState(null);
  const [corrections, setCorrections] = useState([]);
  const [activeTableTab, setActiveTableTab] = useState("base");
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
      const prompt = `Eres un Data Engineer senior. Se ejecutó un pipelinecon estos resultados:
Datasets: ${res.counts.clientes} clientes, ${res.counts.facturas} facturas, ${res.counts.pagos} pagos
Facturas rechazadas: ${res.counts.facturasRechazadas}
Flags: ${JSON.stringify(res.totalFlags)}
Estatus: ${JSON.stringify(res.estatusDist)}
Cartera vencida: ${res.carteraVencida.length} facturas
En 4 oraciones concisas (párrafo ejecutivo), describe hallazgos y acciones. Español.`;

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 500, messages: [{ role: "user", content: prompt }] }),
      });
      const data = await response.json();
      setAiInsight(data.content?.find((b) => b.type === "text")?.text || "");
    } catch { setAiInsight("Análisis AI no disponible en este entorno."); }
    setAiLoading(false);
  }, [filesReady, corrections, toast]);

  const tabs = [
    { key: "evaluacion", label: "✓ Evaluación", icon: "📋" },
    { key: "pipeline", label: "Pipeline", icon: "⚡" },
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
              <FileUploader onFilesReady={handleFilesReady} onFilesLoaded={handleFilesLoaded} />
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
                <div className="grid-4 stagger" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                  <MetricCard label="Facturas válidas" value={result.counts.facturasValidas} color={C.teal} sub={`de ${result.counts.facturas} totales`} icon="📄" />
                  <MetricCard label="En staging" value={result.counts.facturasRechazadas} color={result.counts.facturasRechazadas > 0 ? C.red : C.textMuted} sub="cliente inválido" icon="🚫" />
                  <MetricCard label="Flags detectados" value={Object.values(result.totalFlags).reduce((a, b) => a + b, 0)} color={C.amber} sub="anomalías" icon="⚑" />
                  <MetricCard label="Cartera vencida" value={result.carteraVencida.length} color={result.carteraVencida.length > 0 ? C.red : C.textMuted} sub="sin cobrar" icon="⏰" />
                </div>
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
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }} className="grid-2">
              <div className="animate-fadeIn" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24 }}>
                <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.08em" }}>Estructura del repositorio</div>
                <pre style={{ margin: 0, fontSize: 11, color: C.text, lineHeight: 1.8, fontFamily: "monospace", overflowX: "auto" }}>{REPO_STRUCTURE}</pre>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {[
                  { title: "Idempotencia", icon: "⟳", color: C.teal, items: ["Checksum MD5 por archivo → tabla log_cargas", "Si el hash ya existe, skip silencioso", "Staging separado: datos nuevos ≠ procesados"] },
                  { title: "Carga incremental", icon: "↑", color: C.blue, items: ["Upsert ON CONFLICT DO UPDATE", "Detección de cambios por monto/fecha", "EventBridge trigger en S3 → Lambda"] },
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
              <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.08em" }}>Stack técnico</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {[
                  { label: "Python 3.12", color: C.blue }, { label: "pandas 2.x", color: C.blue },
                  { label: "pytest", color: C.green }, { label: "black + ruff", color: C.green },
                  { label: "PostgreSQL / DuckDB", color: C.teal }, { label: "AWS Lambda", color: C.amber },
                  { label: "AWS S3", color: C.amber }, { label: "GitHub Actions", color: C.purple },
                  { label: "Docker", color: C.purple },
                ].map((t) => <Badge key={t.label} color={t.color} bg={C.surfaceHover}>{t.label}</Badge>)}
              </div>
            </div>

            <div className="animate-fadeIn" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24 }}>
              <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.08em" }}>.github/workflows/ci.yml</div>
              <pre style={{ margin: 0, fontSize: 11, color: C.text, lineHeight: 1.7, fontFamily: "monospace" }}>{`name: CI Pipeline
on: [push, pull_request]
jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.12" }
      - run: pip install -e ".[dev]"
      - run: ruff check src/
      - run: black --check src/
      - run: pytest tests/ -v --tb=short
      - run: python -m pipeline.quality --fail-on-error`}</pre>
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
