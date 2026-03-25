import { useState, useEffect, useCallback } from "react";
import { C, SCHEMAS, parseCSV, hashString, detectCSVType, CacheManager, computeDiff } from "./utils.js";
import { Badge, useToast } from "./components.jsx";
import { DEFAULT_CLIENTES, DEFAULT_FACTURAS, DEFAULT_PAGOS } from "./defaultData.js";

// ─── Diff Summary Modal ──────────────────────────────────
function DiffModal({ diff, schemaType, onAccept, onCancel }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ padding: 28 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 8 }}>
          Cambios detectados en {SCHEMAS[schemaType].label}
        </div>
        <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 20 }}>
          Se encontraron diferencias entre el archivo cacheado y el nuevo archivo subido.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 20 }}>
          {[
            { label: "Filas nuevas", val: diff.added.length, color: C.green },
            { label: "Filas modificadas", val: diff.modified.length, color: C.amber },
            { label: "Filas eliminadas", val: diff.removed.length, color: C.red },
          ].map((m) => (
            <div key={m.label} style={{ background: C.surfaceHover, borderRadius: 8, padding: 14, textAlign: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: m.val > 0 ? m.color : C.textDim }}>{m.val}</div>
              <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>{m.label}</div>
            </div>
          ))}
        </div>

        {diff.colsAdded.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: C.green }}>+ Columnas nuevas: </span>
            <span style={{ fontSize: 12, color: C.text }}>{diff.colsAdded.join(", ")}</span>
          </div>
        )}
        {diff.colsRemoved.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: C.red }}>− Columnas eliminadas: </span>
            <span style={{ fontSize: 12, color: C.text }}>{diff.colsRemoved.join(", ")}</span>
          </div>
        )}

        {diff.modified.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 8 }}>Detalle de modificaciones:</div>
            <div style={{ maxHeight: 180, overflowY: "auto", background: C.surface, borderRadius: 8, border: `1px solid ${C.border}` }}>
              {diff.modified.slice(0, 10).map((m, i) => (
                <div key={i} style={{ padding: "8px 12px", borderBottom: `1px solid ${C.border}22`, fontSize: 11 }}>
                  <span style={{ color: C.amber }}>ID {m.id}</span>
                  {Object.entries(m.changes).map(([col, ch]) => (
                    <div key={col} style={{ marginLeft: 16, marginTop: 2 }}>
                      <span style={{ color: C.textMuted }}>{col}: </span>
                      <span style={{ color: C.red, textDecoration: "line-through" }}>{ch.old || "∅"}</span>
                      <span style={{ color: C.textMuted }}> → </span>
                      <span style={{ color: C.green }}>{ch.new || "∅"}</span>
                    </div>
                  ))}
                </div>
              ))}
              {diff.modified.length > 10 && (
                <div style={{ padding: 8, color: C.textDim, fontSize: 11, textAlign: "center" }}>
                  + {diff.modified.length - 10} modificaciones más
                </div>
              )}
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={{
            background: C.surfaceHover, color: C.textMuted, border: `1px solid ${C.border}`,
            borderRadius: 8, padding: "10px 20px", fontSize: 13, cursor: "pointer", fontFamily: "inherit",
          }}>Cancelar</button>
          <button onClick={onAccept} style={{
            background: C.teal, color: "#000", border: "none",
            borderRadius: 8, padding: "10px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
          }}>Aceptar cambios</button>
        </div>
      </div>
    </div>
  );
}

// ─── Validation Result Display ───────────────────────────
function ValidationResult({ result, fileName }) {
  if (!result) return null;
  const { type, valid, missing, extra } = result;
  const schema = type ? SCHEMAS[type] : null;

  return (
    <div className="animate-fadeIn" style={{
      background: valid ? C.tealBg : C.redBg,
      border: `1px solid ${valid ? C.teal + "33" : C.red + "33"}`,
      borderRadius: 8, padding: "10px 14px", marginTop: 10, fontSize: 11,
    }}>
      {valid ? (
        <div>
          <div style={{ color: C.teal, fontWeight: 600, marginBottom: 4 }}>
            ✓ Archivo válido — detectado como <strong>{schema?.label}</strong>
          </div>
          <div style={{ color: C.textMuted }}>
            {schema?.columns.length} columnas esperadas: {schema?.columns.join(", ")}
          </div>
          {extra.length > 0 && (
            <div style={{ color: C.amber, marginTop: 4 }}>
              ⚠ Columnas extra (ignoradas): {extra.join(", ")}
            </div>
          )}
        </div>
      ) : (
        <div>
          <div style={{ color: C.red, fontWeight: 600, marginBottom: 4 }}>
            ✗ Archivo inválido{type ? ` — más similar a ${SCHEMAS[type]?.label}` : ""}
          </div>
          {missing.length > 0 && (
            <div style={{ color: C.amber, marginTop: 2 }}>Columnas faltantes: {missing.join(", ")}</div>
          )}
          {extra.length > 0 && (
            <div style={{ color: C.textMuted, marginTop: 2 }}>Columnas no reconocidas: {extra.join(", ")}</div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── FileUploader ────────────────────────────────────────
export default function FileUploader({ onFilesReady, onFilesLoaded, onClear }) {
  const [files, setFiles] = useState({ clientes: null, facturas: null, pagos: null });
  const [validations, setValidations] = useState({});
  const [dragging, setDragging] = useState(null);
  const [cachedKeys, setCachedKeys] = useState({});
  const [diffModal, setDiffModal] = useState(null);
  const [pendingUpload, setPendingUpload] = useState(null);
  const [defaultLoading, setDefaultLoading] = useState(false);
  const toast = useToast();

  // Load cached files on mount
  useEffect(() => {
    const cached = CacheManager.loadAll();
    const loadedFiles = {};
    const loadedCached = {};
    for (const key of ["clientes", "facturas", "pagos"]) {
      if (cached[key]) {
        loadedFiles[key] = { name: `${key}.csv (caché)`, content: cached[key].content, fromCache: true };
        loadedCached[key] = { hash: cached[key].hash, timestamp: cached[key].timestamp };
      }
    }
    if (Object.keys(loadedFiles).length > 0) {
      setFiles((prev) => ({ ...prev, ...loadedFiles }));
      setCachedKeys(loadedCached);
      if (loadedFiles.clientes && loadedFiles.facturas && loadedFiles.pagos) {
        toast?.("Datos restaurados desde caché", "info");
        setTimeout(() => onFilesLoaded?.(loadedFiles), 100);
      }
    }
  }, []);

  // Notify parent when all files are ready
  useEffect(() => {
    if (files.clientes && files.facturas && files.pagos) {
      const allValid = Object.values(validations).every((v) => v === undefined || v?.valid);
      if (allValid) onFilesReady?.(files);
    }
  }, [files, validations]);

  const processFile = useCallback((file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.readAsText(file, "latin1");
    });
  }, []);

  const handleFile = useCallback(async (targetKey, file) => {
    // Validate extension
    if (!file.name.endsWith(".csv")) {
      toast?.(`"${file.name}" no es un archivo CSV`, "error");
      return;
    }

    const content = await processFile(file);

    // Validate empty
    if (!content.trim() || content.trim().split("\n").length < 2) {
      toast?.(`"${file.name}" está vacío o no tiene datos`, "error");
      return;
    }

    // Parse and detect schema
    const parsed = parseCSV(content);
    const detection = detectCSVType(parsed.headers);

    if (!detection.valid) {
      setValidations((prev) => ({ ...prev, [targetKey]: detection }));
      toast?.(`"${file.name}" no tiene las columnas esperadas`, "error");
      return;
    }

    // Auto-assign to correct slot
    const actualKey = detection.type;
    if (actualKey !== targetKey) {
      toast?.(`"${file.name}" detectado como ${SCHEMAS[actualKey].label} — reasignado automáticamente`, "warning");
    }

    setValidations((prev) => ({ ...prev, [actualKey]: detection }));

    // Check for duplicates and diffs
    const newHash = hashString(content);
    const cached = CacheManager.load(actualKey);

    if (cached && cached.hash === newHash) {
      toast?.(`"${file.name}" es idéntico al archivo en caché — sin cambios`, "info");
      setFiles((prev) => {
        const updated = { ...prev, [actualKey]: { name: file.name, content, fromCache: false } };
        return updated;
      });
      return;
    }

    if (cached && cached.hash !== newHash) {
      // Show diff modal
      const diff = computeDiff(cached.content, content, SCHEMAS[actualKey]);
      if (diff.hasChanges) {
        setDiffModal({ diff, type: actualKey });
        setPendingUpload({ key: actualKey, name: file.name, content, hash: newHash });
        return;
      }
    }

    // Save and set
    CacheManager.save(actualKey, content, newHash);
    setCachedKeys((prev) => ({ ...prev, [actualKey]: { hash: newHash, timestamp: Date.now() } }));
    setFiles((prev) => ({ ...prev, [actualKey]: { name: file.name, content, fromCache: false } }));
    toast?.(`${SCHEMAS[actualKey].label} cargado correctamente`, "success");
  }, [processFile, toast]);

  const acceptDiff = useCallback(() => {
    if (!pendingUpload) return;
    const { key, name, content, hash } = pendingUpload;
    CacheManager.save(key, content, hash);
    setCachedKeys((prev) => ({ ...prev, [key]: { hash, timestamp: Date.now() } }));
    setFiles((prev) => ({ ...prev, [key]: { name, content, fromCache: false } }));
    setDiffModal(null);
    setPendingUpload(null);
    toast?.(`${SCHEMAS[key].label} actualizado con cambios`, "success");
  }, [pendingUpload, toast]);

  const clearCache = useCallback(() => {
    CacheManager.clear();
    setFiles({ clientes: null, facturas: null, pagos: null });
    setValidations({});
    setCachedKeys({});
    onClear?.(); // Notificar al padre para resetear estados globales
    toast?.("Caché limpiado", "info");
  }, [onClear, toast]);

  const loadDefaultFiles = useCallback(async () => {
    setDefaultLoading(true);
    await new Promise((r) => setTimeout(r, 400)); // Brief visual delay
    const defaults = {
      clientes: { name: "clientes.csv (predeterminado)", content: DEFAULT_CLIENTES, fromCache: false },
      facturas: { name: "facturas.csv (predeterminado)", content: DEFAULT_FACTURAS, fromCache: false },
      pagos: { name: "pagos.csv (predeterminado)", content: DEFAULT_PAGOS, fromCache: false },
    };
    setFiles(defaults);
    setValidations({});
    toast?.("Archivos predeterminados cargados exitosamente", "success");
    setDefaultLoading(false);
    setTimeout(() => onFilesLoaded?.(defaults), 100);
  }, [toast, onFilesLoaded]);

  const zones = [
    { key: "clientes", ...SCHEMAS.clientes },
    { key: "facturas", ...SCHEMAS.facturas },
    { key: "pagos", ...SCHEMAS.pagos },
  ];

  const allLoaded = files.clientes && files.facturas && files.pagos;

  return (
    <>
      {/* Default files button */}
      {!allLoaded && (
        <div className="animate-fadeIn" style={{
          marginBottom: 20, textAlign: "center",
          background: `linear-gradient(135deg, ${C.tealBg}, ${C.blueBg})`,
          border: `1px dashed ${C.teal}55`,
          borderRadius: 14, padding: "20px 24px",
        }}>
          <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 10 }}>
            ¿No tienes los archivos a la mano?
          </div>
          <button
            onClick={loadDefaultFiles}
            disabled={defaultLoading}
            style={{
              background: `linear-gradient(135deg, ${C.teal}, ${C.blue})`,
              color: "#000", border: "none", borderRadius: 10,
              padding: "12px 28px", fontSize: 14, fontWeight: 700,
              cursor: defaultLoading ? "wait" : "pointer",
              fontFamily: "inherit", letterSpacing: "0.02em",
              boxShadow: `0 4px 20px ${C.teal}33`,
              transition: "all 0.25s",
              opacity: defaultLoading ? 0.7 : 1,
              transform: "translateY(0)",
            }}
            onMouseEnter={(e) => { if (!defaultLoading) e.currentTarget.style.transform = "translateY(-2px)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
          >
            {defaultLoading ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <span style={{ display: "inline-block", width: 14, height: 14, border: "2px solid #000", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                Cargando...
              </span>
            ) : (
              "📁 Carga de archivos predeterminados"
            )}
          </button>
          <div style={{ fontSize: 11, color: C.textDim, marginTop: 8 }}>
            Carga automáticamente clientes.csv, facturas.csv y pagos.csv
          </div>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }} className="grid-3 stagger">
        {zones.map(({ key, label, icon, color, columns }) => {
          const loaded = files[key];
          const validation = validations[key];
          const isCached = loaded?.fromCache;
          const cachedInfo = cachedKeys[key];
          return (
            <div key={key} className="animate-fadeIn">
              <label
                onDragOver={(e) => { e.preventDefault(); setDragging(key); }}
                onDragLeave={() => setDragging(null)}
                onDrop={(e) => { e.preventDefault(); setDragging(null); handleFile(key, e.dataTransfer.files[0]); }}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  gap: 10, padding: "28px 16px", borderRadius: 14, cursor: "pointer",
                  border: `1.5px dashed ${loaded ? (isCached ? color + "88" : C.teal) : dragging === key ? C.amber : C.border}`,
                  background: loaded ? (isCached ? C.surfaceHover : C.tealBg) : dragging === key ? C.amberBg : C.surface,
                  transition: "all 0.25s ease", textAlign: "center",
                  animation: loaded && !isCached ? undefined : (dragging === key ? "borderPulse 1s infinite" : undefined),
                }}
              >
                <input type="file" accept=".csv" style={{ display: "none" }}
                  onChange={(e) => e.target.files[0] && handleFile(key, e.target.files[0])} />
                <span style={{ fontSize: 28, filter: loaded ? "none" : "grayscale(0.5)" }}>{loaded ? "✓" : icon}</span>
                <span style={{ fontSize: 13, color: loaded ? C.teal : C.textMuted, fontWeight: 600 }}>
                  {loaded ? loaded.name : label}
                </span>
                <span style={{ fontSize: 11, color: C.textDim }}>
                  {loaded && isCached ? "Desde caché" : loaded ? "Archivo cargado" : "Arrastrar o click"}
                </span>
                {isCached && cachedInfo && (
                  <Badge color={color} bg={color + "15"} pulse>
                    Caché · {new Date(cachedInfo.timestamp).toLocaleDateString("es-MX")}
                  </Badge>
                )}
                <div style={{ fontSize: 10, color: C.textDim, marginTop: 2 }}>
                  {columns.join(" · ")}
                </div>
              </label>
              {validation && !validation.valid && <ValidationResult result={validation} fileName={loaded?.name} />}
            </div>
          );
        })}
      </div>

      {/* Cache controls */}
      {Object.keys(cachedKeys).length > 0 && (
        <div className="animate-fadeIn" style={{ marginTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 11, color: C.textMuted, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: C.blue }}>💾</span>
            {Object.keys(cachedKeys).length} archivo(s) en caché
          </div>
          <button onClick={clearCache} style={{
            background: "none", border: `1px solid ${C.border}`, borderRadius: 6,
            padding: "4px 12px", fontSize: 11, color: C.textMuted, cursor: "pointer",
            fontFamily: "inherit", transition: "all 0.15s",
          }}>Limpiar caché</button>
        </div>
      )}

      {/* Diff modal */}
      {diffModal && (
        <DiffModal diff={diffModal.diff} schemaType={diffModal.type}
          onAccept={acceptDiff} onCancel={() => { setDiffModal(null); setPendingUpload(null); }} />
      )}
    </>
  );
}
