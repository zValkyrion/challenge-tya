import { useState, useEffect, useCallback, createContext, useContext } from "react";
import { C, STATUS_COLORS } from "./utils.js";

// ─── Toast System ────────────────────────────────────────
const ToastCtx = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const addToast = useCallback((message, type = "info", duration = 3500) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), duration);
  }, []);
  return (
    <ToastCtx.Provider value={addToast}>
      {children}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>{t.message}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() { return useContext(ToastCtx); }

// ─── Badge ───────────────────────────────────────────────
export function Badge({ color, bg, children, pulse }) {
  return (
    <span style={{
      background: bg, color, borderRadius: 6, padding: "3px 10px",
      fontSize: 11, fontWeight: 600, letterSpacing: "0.04em",
      fontFamily: "'Inter', monospace", border: `1px solid ${color}22`,
      display: "inline-flex", alignItems: "center", gap: 6,
      animation: pulse ? "pulse 2s ease-in-out infinite" : undefined,
    }}>{children}</span>
  );
}

// ─── Log Line ────────────────────────────────────────────
export function LogLine({ type, msg, detail }) {
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

// ─── MetricCard ──────────────────────────────────────────
export function MetricCard({ label, value, color = C.text, sub, icon, onSelect }) {
  return (
    <div className="animate-fadeIn" style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 12, padding: "18px 22px",
      transition: "border-color 0.2s, transform 0.15s",
      cursor: "pointer",
    }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = color + "44"; e.currentTarget.style.transform = "translateY(-2px)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.transform = "translateY(0)"; }}
      onClick={onSelect}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 11, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
        {icon && <span style={{ fontSize: 16, opacity: 0.5 }}>{icon}</span>}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color, fontVariantNumeric: "tabular-nums", marginTop: 6 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: C.textMuted, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ─── BarChart ────────────────────────────────────────────
export function BarChart({ data, colorFn }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {data.map((d, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 110, fontSize: 12, color: C.textMuted, textAlign: "right", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.label}</div>
          <div style={{ flex: 1, height: 24, background: C.surfaceHover, borderRadius: 6, overflow: "hidden" }}>
            <div style={{
              width: `${(d.value / max) * 100}%`, height: "100%",
              background: `linear-gradient(90deg, ${colorFn ? colorFn(d, i) : C.teal}, ${colorFn ? colorFn(d, i) : C.teal}88)`,
              borderRadius: 6, transition: "width 0.8s cubic-bezier(0.16, 1, 0.3, 1)",
            }} />
          </div>
          <div style={{ fontSize: 12, color: C.text, minWidth: 55, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
            {typeof d.value === "number" && d.value > 1000 ? `$${(d.value / 1000).toFixed(0)}k` : d.value}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── StatusDonut ─────────────────────────────────────────
export function StatusDonut({ dist }) {
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
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
      <svg width={160} height={160}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.border} strokeWidth={stroke} />
        {segments.map((seg) => {
          const sc = STATUS_COLORS[seg.key];
          return (
            <circle key={seg.key} cx={cx} cy={cy} r={r} fill="none"
              stroke={sc?.color || C.textMuted} strokeWidth={stroke}
              strokeDasharray={seg.dasharray} strokeDashoffset={seg.dashoffset}
              style={{ transformOrigin: `${cx}px ${cy}px`, transform: "rotate(-90deg)", transition: "stroke-dasharray 0.8s ease" }}
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
              <div style={{ width: 10, height: 10, borderRadius: 3, background: sc?.color || C.textMuted }} />
              <span style={{ fontSize: 12, color: C.textMuted }}>{sc?.label || seg.key}</span>
              <span style={{ fontSize: 12, color: C.text, marginLeft: "auto", fontWeight: 600, minWidth: 20 }}>{seg.val}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── FlagCard ────────────────────────────────────────────
export function FlagCard({ label, count, color, description, onSelect }) {
  return (
    <div className="animate-fadeIn" style={{
      background: C.surface, border: `1px solid ${count > 0 ? color + "44" : C.border}`,
      borderRadius: 10, padding: "14px 16px",
      transition: "border-color 0.2s, background 0.15s",
      cursor: "pointer",
    }}
    onMouseEnter={(e) => { e.currentTarget.style.background = C.surfaceHover; }}
    onMouseLeave={(e) => { e.currentTarget.style.background = C.surface; }}
    onClick={onSelect}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 6, lineHeight: 1.4 }}>{label}</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: count > 0 ? color : C.textDim, minWidth: 32, textAlign: "right" }}>{count}</div>
      </div>
      <div style={{ fontSize: 11, color: C.textDim, lineHeight: 1.5 }}>{description}</div>
    </div>
  );
}

// ─── TablePreview ────────────────────────────────────────
export function TablePreview({ data, columns, maxRows = 8 }) {
  const [showAll, setShowAll] = useState(false);
  const rows = showAll ? data : data.slice(0, maxRows);
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: "monospace" }}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} style={{
                padding: "10px 12px", textAlign: "left", color: C.textMuted,
                borderBottom: `1px solid ${C.border}`, fontWeight: 600, whiteSpace: "nowrap",
                background: C.surfaceHover, position: "sticky", top: 0,
              }}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderBottom: `1px solid ${C.border}22`, transition: "background 0.15s" }}
              onMouseEnter={(e) => e.currentTarget.style.background = C.surfaceHover}
              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
            >
              {columns.map((c) => {
                let val = row[c.key];
                let cellColor = C.text;
                if (c.key === "estatus_factura" && val) {
                  const sc = STATUS_COLORS[val];
                  return <td key={c.key} style={{ padding: "8px 12px" }}><Badge color={sc?.color || C.text} bg={sc?.bg || C.surface}>{sc?.label || val}</Badge></td>;
                }
                if (c.key === "monto_total" || c.key === "monto_pagado_total") {
                  const num = parseFloat(val);
                  cellColor = num < 0 ? C.red : num > 0 ? C.text : C.textMuted;
                  val = isNaN(num) ? "—" : `$${num.toLocaleString()}`;
                }
                if (val instanceof Date) val = val.toLocaleDateString("es-MX");
                if (typeof val === "boolean") val = val ? "✓" : "";
                return <td key={c.key} style={{ padding: "8px 12px", color: cellColor }}>{val ?? "—"}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {data.length > maxRows && (
        <button onClick={() => setShowAll(!showAll)} style={{
          display: "block", width: "100%", padding: "10px", background: "none",
          border: "none", color: C.teal, fontSize: 12, cursor: "pointer",
          fontFamily: "inherit", borderTop: `1px solid ${C.border}22`,
        }}>
          {showAll ? "▲ Mostrar menos" : `▼ Mostrar ${data.length - maxRows} filas más`}
        </button>
      )}
    </div>
  );
}

// ─── Section Header ──────────────────────────────────────
export function SectionHeader({ step, label, badge }) {
  return (
    <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{
        color: C.teal, background: C.tealBg, padding: "2px 8px", borderRadius: 6,
        fontSize: 11, fontWeight: 700, fontFamily: "monospace",
      }}>{step}</span>
      <span style={{ fontWeight: 500 }}>{label}</span>
      {badge}
    </div>
  );
}
