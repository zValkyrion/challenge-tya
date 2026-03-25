// ─── Design tokens & color palette ────────────────────────
export const C = {
  bg: "#0B0C0F",
  surface: "#14161C",
  surfaceHover: "#1C1E26",
  surfaceActive: "#22242E",
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

export const STATUS_COLORS = {
  PAGADA: { color: C.teal, bg: C.tealBg, label: "Pagada" },
  PARCIAL: { color: C.amber, bg: C.amberBg, label: "Parcial" },
  VENCIDA: { color: C.red, bg: C.redBg, label: "Vencida" },
  PENDIENTE: { color: C.blue, bg: C.blueBg, label: "Pendiente" },
  NOTA_CREDITO: { color: C.purple, bg: C.purpleBg, label: "Nota Crédito" },
};

// ─── CSV Schema definitions ──────────────────────────────
export const SCHEMAS = {
  clientes: {
    columns: ["id_cliente", "nombre", "segmento", "ciudad"],
    primaryKey: "id_cliente",
    icon: "👤",
    label: "clientes.csv",
    color: C.blue,
  },
  facturas: {
    columns: ["id_factura", "id_cliente", "fecha_emision", "fecha_vencimiento", "monto_total"],
    primaryKey: "id_factura",
    icon: "🧾",
    label: "facturas.csv",
    color: C.amber,
  },
  pagos: {
    columns: ["id_pago", "id_factura", "fecha_pago", "monto_pago"],
    primaryKey: "id_pago",
    icon: "💳",
    label: "pagos.csv",
    color: C.teal,
  },
};

// ─── CSV Parser ──────────────────────────────────────────
export function parseCSV(text) {
  const lines = text.trim().split("\n");
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  return {
    headers,
    rows: lines.slice(1).map((line) => {
      const vals = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
      return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? ""]));
    }),
  };
}

// ─── Date Parser (multiple formats) ─────────────────────
export function parseDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (/^\d{8}$/.test(s))
    return new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`);
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [d, m, y] = s.split("/");
    let fy = y;
    if (y.startsWith("02") && parseInt(y) < 1000) fy = "20" + y.slice(2);
    return new Date(`${fy}-${m}-${d}`);
  }
  if (/^\d{2}-\d{2}-\d{3}$/.test(s)) {
    const [d, m, y] = s.split("-");
    return new Date(`2${y}-${m}-${d}`);
  }
  return null;
}

// ─── Simple hash for duplicate detection ────────────────
export function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

// ─── Schema Validation ──────────────────────────────────
export function detectCSVType(headers) {
  for (const [type, schema] of Object.entries(SCHEMAS)) {
    const schemaSet = new Set(schema.columns);
    const headerSet = new Set(headers);
    if (schema.columns.every((c) => headerSet.has(c))) {
      const extra = headers.filter((h) => !schemaSet.has(h));
      return { type, extra, missing: [], valid: true };
    }
  }
  // Partial match
  let bestMatch = null;
  let bestScore = 0;
  for (const [type, schema] of Object.entries(SCHEMAS)) {
    const matching = schema.columns.filter((c) => headers.includes(c));
    const score = matching.length / schema.columns.length;
    if (score > bestScore) {
      bestScore = score;
      bestMatch = {
        type, valid: false,
        missing: schema.columns.filter((c) => !headers.includes(c)),
        extra: headers.filter((h) => !schema.columns.includes(h)),
      };
    }
  }
  return bestMatch || { type: null, valid: false, missing: [], extra: headers };
}

// ─── Cache Manager ──────────────────────────────────────
const CACHE_KEY = "data_pipeline_cache_v2";

export const CacheManager = {
  save(key, content, hash) {
    const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
    cache[key] = { content, hash, timestamp: Date.now() };
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch (e) { /* quota */ }
  },
  load(key) {
    const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
    return cache[key] || null;
  },
  loadAll() {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
  },
  has(key) {
    const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
    return !!cache[key];
  },
  clear() {
    localStorage.removeItem(CACHE_KEY);
  },
  getTimestamp(key) {
    const entry = this.load(key);
    return entry ? new Date(entry.timestamp).toLocaleString("es-MX") : null;
  },
};

// ─── Diff Detection ────────────────────────────────────
export function computeDiff(oldContent, newContent, schema) {
  const oldParsed = parseCSV(oldContent);
  const newParsed = parseCSV(newContent);
  const pk = schema.primaryKey;

  const oldMap = new Map(oldParsed.rows.map((r) => [r[pk], r]));
  const newMap = new Map(newParsed.rows.map((r) => [r[pk], r]));

  const added = [];
  const removed = [];
  const modified = [];

  for (const [id, row] of newMap) {
    if (!oldMap.has(id)) { added.push(row); }
    else {
      const oldRow = oldMap.get(id);
      const changes = {};
      for (const col of schema.columns) {
        if (String(row[col] || "") !== String(oldRow[col] || "")) {
          changes[col] = { old: oldRow[col], new: row[col] };
        }
      }
      if (Object.keys(changes).length > 0) modified.push({ id, changes });
    }
  }
  for (const [id] of oldMap) {
    if (!newMap.has(id)) removed.push(oldMap.get(id));
  }

  const colsAdded = newParsed.headers.filter((h) => !oldParsed.headers.includes(h));
  const colsRemoved = oldParsed.headers.filter((h) => !newParsed.headers.includes(h));

  return {
    added, removed, modified, colsAdded, colsRemoved,
    oldRowCount: oldParsed.rows.length,
    newRowCount: newParsed.rows.length,
    hasChanges: added.length > 0 || removed.length > 0 || modified.length > 0 || colsAdded.length > 0 || colsRemoved.length > 0,
  };
}
