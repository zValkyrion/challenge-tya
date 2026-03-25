import { useState, useMemo } from "react";
import { C, SCHEMAS, parseCSV } from "./utils.js";
import { Badge, useToast } from "./components.jsx";

// ─── Issue Detection ─────────────────────────────────────
function detectIssues(files) {
  const issues = [];

  if (files.clientes) {
    const { rows } = parseCSV(files.clientes.content);
    rows.forEach((r) => {
      const city = (r.ciudad || "").toLowerCase().trim();
      const cityVariants = ["quertaro", "querçÿtaro", "querçtaro", "cancã£n", "canc£n", "gdl", "monterey"];
      if (cityVariants.some((v) => city.includes(v) || city === v)) {
        issues.push({
          id: `cli-city-${r.id_cliente}`, dataset: "clientes", pkField: "id_cliente", pkValue: r.id_cliente,
          field: "ciudad", currentValue: r.ciudad, severity: "media",
          type: "encoding", description: `Ciudad con encoding corrupto o variante`,
          suggestion: city.includes("quer") ? "Querétaro" : city.includes("canc") ? "Cancún" : city === "gdl" ? "Guadalajara" : city === "monterey" ? "Monterrey" : null,
        });
      }
      if (r.ciudad && r.ciudad === r.ciudad.toUpperCase() && r.ciudad.length > 2) {
        issues.push({
          id: `cli-case-${r.id_cliente}`, dataset: "clientes", pkField: "id_cliente", pkValue: r.id_cliente,
          field: "ciudad", currentValue: r.ciudad, severity: "baja",
          type: "capitalización", description: `Ciudad en mayúsculas`,
          suggestion: r.ciudad.charAt(0) + r.ciudad.slice(1).toLowerCase(),
        });
      }
      if (!r.ciudad || r.ciudad.trim() === "") {
        issues.push({
          id: `cli-null-${r.id_cliente}`, dataset: "clientes", pkField: "id_cliente", pkValue: r.id_cliente,
          field: "ciudad", currentValue: "(vacío)", severity: "media",
          type: "nulo", description: `Ciudad sin valor`,
          suggestion: null,
        });
      }
      if (r.segmento === "Carporativo") {
        issues.push({
          id: `cli-seg-${r.id_cliente}`, dataset: "clientes", pkField: "id_cliente", pkValue: r.id_cliente,
          field: "segmento", currentValue: r.segmento, severity: "baja",
          type: "typo", description: `Error tipográfico en segmento`,
          suggestion: "Corporativo",
        });
      }
    });
  }

  if (files.facturas) {
    const { rows } = parseCSV(files.facturas.content);
    rows.forEach((r) => {
      const monto = parseFloat(r.monto_total);
      if (monto < 0) {
        issues.push({
          id: `fac-neg-${r.id_factura}`, dataset: "facturas", pkField: "id_factura", pkValue: r.id_factura,
          field: "monto_total", currentValue: r.monto_total, severity: "alta",
          type: "monto negativo", description: `Monto negativo (posible nota de crédito)`,
          suggestion: null, // We keep negatives, just flag
        });
      }
      if (r.fecha_vencimiento && /\/0\d{3}$/.test(r.fecha_vencimiento)) {
        issues.push({
          id: `fac-date-${r.id_factura}`, dataset: "facturas", pkField: "id_factura", pkValue: r.id_factura,
          field: "fecha_vencimiento", currentValue: r.fecha_vencimiento, severity: "alta",
          type: "fecha inválida", description: `Año claramente incorrecto`,
          suggestion: r.fecha_vencimiento.replace(/\/0(\d{3})$/, "/2$1"),
        });
      }
    });
  }

  if (files.pagos) {
    const { rows } = parseCSV(files.pagos.content);
    rows.forEach((r) => {
      const monto = parseFloat(r.monto_pago);
      if (monto < 0) {
        issues.push({
          id: `pag-neg-${r.id_pago}`, dataset: "pagos", pkField: "id_pago", pkValue: r.id_pago,
          field: "monto_pago", currentValue: r.monto_pago, severity: "alta",
          type: "monto negativo", description: `Pago negativo (posible devolución)`,
          suggestion: null,
        });
      }
      if (r.fecha_pago && /^\d{2}-\d{2}-\d{3}$/.test(r.fecha_pago.trim())) {
        issues.push({
          id: `pag-date-${r.id_pago}`, dataset: "pagos", pkField: "id_pago", pkValue: r.id_pago,
          field: "fecha_pago", currentValue: r.fecha_pago, severity: "alta",
          type: "fecha malformada", description: `Formato de fecha incorrecta`,
          suggestion: r.fecha_pago.trim().replace(/-/g, "/").replace(/\/(\d{3})$/, "/2$1"),
        });
      }
    });
  }

  return issues;
}

// ─── Issue Row ───────────────────────────────────────────
function IssueRow({ issue, onCorrect, onAcknowledge, status }) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(issue.suggestion || issue.currentValue);

  const severityColors = { alta: C.red, media: C.amber, baja: C.blue };
  const color = severityColors[issue.severity] || C.textMuted;

  const isResolved = status === "corrected" || status === "acknowledged";

  return (
    <div style={{
      display: "grid", gridTemplateColumns: "60px 70px 1fr 140px 140px 200px",
      padding: "10px 14px", borderBottom: `1px solid ${C.border}22`,
      background: isResolved ? C.surfaceHover : "transparent",
      opacity: isResolved ? 0.6 : 1,
      transition: "all 0.2s", fontSize: 12, alignItems: "center",
    }}>
      <div>
        <Badge color={color} bg={color + "15"}>{issue.severity}</Badge>
      </div>
      <div style={{ color: C.textMuted }}>{issue.dataset}</div>
      <div>
        <div style={{ color: C.text }}>{issue.description}</div>
        <div style={{ color: C.textDim, fontSize: 11, marginTop: 2 }}>
          {issue.pkField}={issue.pkValue} → {issue.field}: <span style={{ color: C.amber }}>"{issue.currentValue}"</span>
        </div>
      </div>
      <div>
        {issue.suggestion && (
          <span style={{ color: C.green, fontSize: 11 }}>Sugerencia: "{issue.suggestion}"</span>
        )}
      </div>
      <div>
        {editing ? (
          <input value={editValue} onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { onCorrect(issue, editValue); setEditing(false); } }}
            style={{
              background: C.surfaceHover, border: `1px solid ${C.teal}44`, borderRadius: 4,
              padding: "4px 8px", color: C.text, fontSize: 11, width: "100%",
              fontFamily: "inherit", outline: "none",
            }}
            autoFocus
          />
        ) : null}
      </div>
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        {!isResolved && (
          <>
            {issue.suggestion && (
              <button onClick={() => onCorrect(issue, issue.suggestion)} style={{
                background: C.tealBg, color: C.teal, border: `1px solid ${C.teal}33`,
                borderRadius: 6, padding: "4px 10px", fontSize: 11, cursor: "pointer", fontFamily: "inherit",
              }}>Aplicar</button>
            )}
            <button onClick={() => setEditing(!editing)} style={{
              background: C.surfaceHover, color: C.textMuted, border: `1px solid ${C.border}`,
              borderRadius: 6, padding: "4px 10px", fontSize: 11, cursor: "pointer", fontFamily: "inherit",
            }}>{editing ? "✓" : "Editar"}</button>
            <button onClick={() => onAcknowledge(issue)} style={{
              background: "none", color: C.textDim, border: `1px solid ${C.border}`,
              borderRadius: 6, padding: "4px 10px", fontSize: 11, cursor: "pointer", fontFamily: "inherit",
            }}>Omitir</button>
          </>
        )}
        {status === "corrected" && <Badge color={C.teal} bg={C.tealBg}>Corregido</Badge>}
        {status === "acknowledged" && <Badge color={C.textMuted} bg={C.surfaceHover}>Omitido</Badge>}
      </div>
    </div>
  );
}

// ─── DataCorrectionPanel ─────────────────────────────────
export default function DataCorrectionPanel({ files, onCorrectionsReady }) {
  const [corrections, setCorrections] = useState([]);
  const [issueStatuses, setIssueStatuses] = useState({});
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [filterDataset, setFilterDataset] = useState("all");
  const toast = useToast();

  const issues = useMemo(() => detectIssues(files), [files]);

  const filtered = issues.filter((i) => {
    if (filterSeverity !== "all" && i.severity !== filterSeverity) return false;
    if (filterDataset !== "all" && i.dataset !== filterDataset) return false;
    return true;
  });

  const handleCorrect = (issue, newValue) => {
    const corr = {
      dataset: issue.dataset, pkField: issue.pkField, pkValue: issue.pkValue,
      field: issue.field, oldValue: issue.currentValue, newValue,
    };
    setCorrections((prev) => [...prev.filter((c) => c.pkValue !== issue.pkValue || c.field !== issue.field), corr]);
    setIssueStatuses((prev) => ({ ...prev, [issue.id]: "corrected" }));
    toast?.(`Corrección registrada: ${issue.field} → "${newValue}"`, "success");
  };

  const handleAcknowledge = (issue) => {
    setIssueStatuses((prev) => ({ ...prev, [issue.id]: "acknowledged" }));
  };

  const applyAllSuggestions = () => {
    const applicable = issues.filter((i) => i.suggestion && !issueStatuses[i.id]);
    applicable.forEach((i) => handleCorrect(i, i.suggestion));
    toast?.(`${applicable.length} correcciones aplicadas automáticamente`, "success");
  };

  const resolved = Object.values(issueStatuses).length;
  const total = issues.length;

  const severityCounts = { alta: 0, media: 0, baja: 0 };
  issues.forEach((i) => { if (!issueStatuses[i.id]) severityCounts[i.severity]++; });

  return (
    <div className="animate-slideUp" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "20px 24px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 4 }}>
            🔍 Revisión de datos
          </div>
          <div style={{ fontSize: 12, color: C.textMuted }}>
            {total} problemas detectados · {resolved} resueltos · {total - resolved} pendientes
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={applyAllSuggestions} style={{
            background: C.tealBg, color: C.teal, border: `1px solid ${C.teal}33`,
            borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit",
          }}>✓ Aplicar todas las sugerencias</button>
          <button onClick={() => onCorrectionsReady(corrections)} style={{
            background: C.teal, color: "#000", border: "none",
            borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 700,
            cursor: "pointer", fontFamily: "inherit",
          }}>Continuar →</button>
        </div>
      </div>

      {/* Severity summary */}
      <div style={{ padding: "12px 24px", borderBottom: `1px solid ${C.border}`, display: "flex", gap: 12 }}>
        {[
          { label: "Alta", count: severityCounts.alta, color: C.red },
          { label: "Media", count: severityCounts.media, color: C.amber },
          { label: "Baja", count: severityCounts.baja, color: C.blue },
        ].map((s) => (
          <div key={s.label} style={{
            padding: "6px 14px", borderRadius: 8, fontSize: 12,
            background: s.count > 0 ? s.color + "15" : C.surfaceHover,
            color: s.count > 0 ? s.color : C.textDim,
            border: `1px solid ${s.count > 0 ? s.color + "33" : C.border}`,
            cursor: "pointer",
          }} onClick={() => setFilterSeverity(filterSeverity === s.label.toLowerCase() ? "all" : s.label.toLowerCase())}>
            {s.label}: {s.count}
          </div>
        ))}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {["clientes", "facturas", "pagos"].map((d) => (
            <button key={d} onClick={() => setFilterDataset(filterDataset === d ? "all" : d)} style={{
              background: filterDataset === d ? C.surfaceActive : "none",
              border: `1px solid ${filterDataset === d ? C.borderAccent : C.border}`,
              borderRadius: 6, padding: "4px 12px", fontSize: 11,
              color: filterDataset === d ? C.text : C.textMuted, cursor: "pointer", fontFamily: "inherit",
            }}>{d}</button>
          ))}
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: 3, background: C.surfaceHover }}>
        <div style={{
          height: "100%", width: `${total > 0 ? (resolved / total) * 100 : 0}%`,
          background: `linear-gradient(90deg, ${C.teal}, ${C.green})`,
          transition: "width 0.5s ease", borderRadius: "0 2px 2px 0",
        }} />
      </div>

      {/* Issues list */}
      <div style={{ maxHeight: 400, overflowY: "auto" }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: C.textMuted }}>
            {total === 0 ? "Sin problemas detectados 🎉" : "No hay problemas con los filtros actuales"}
          </div>
        ) : (
          filtered.map((issue) => (
            <IssueRow key={issue.id} issue={issue} status={issueStatuses[issue.id]}
              onCorrect={handleCorrect} onAcknowledge={handleAcknowledge} />
          ))
        )}
      </div>

      {/* Corrections log */}
      {corrections.length > 0 && (
        <div style={{ padding: "12px 24px", borderTop: `1px solid ${C.border}`, background: C.tealBg + "44" }}>
          <div style={{ fontSize: 11, color: C.teal, fontWeight: 600, marginBottom: 6 }}>
            {corrections.length} corrección(es) registradas
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {corrections.map((c, i) => (
              <Badge key={i} color={C.teal} bg={C.tealBg}>
                {c.dataset}[{c.pkValue}].{c.field}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
