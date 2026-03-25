-- ============================================================
-- Análisis SQL – Prueba Técnica Data Engineer
-- TYA Tierra y Armonía
--
-- Prerequisito: ejecutar modelo.sql para crear las tablas
--               y cargar los datos limpios del procesamiento.py
--
-- Se usa la vista tabla_base_facturas para mayor claridad.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- QUERY 1: Ventas totales por cliente por mes
-- ────────────────────────────────────────────────────────────
-- Agrupa las ventas (excluyendo notas de crédito) por cliente
-- y mes de emisión. Esto permite identificar la concentración
-- de ventas y patrones estacionales.

SELECT
    c.id_cliente,
    c.nombre                                    AS nombre_cliente,
    c.segmento,
    DATE_TRUNC('month', f.fecha_emision)        AS mes,
    TO_CHAR(f.fecha_emision, 'YYYY-MM')         AS mes_label,
    COUNT(f.id_factura)                         AS num_facturas,
    SUM(f.monto_total)                          AS ventas_totales,
    ROUND(AVG(f.monto_total), 2)                AS ticket_promedio
FROM facturas f
JOIN clientes c ON c.id_cliente = f.id_cliente
WHERE f.es_nota_credito = FALSE
GROUP BY c.id_cliente, c.nombre, c.segmento,
         DATE_TRUNC('month', f.fecha_emision),
         TO_CHAR(f.fecha_emision, 'YYYY-MM')
ORDER BY c.id_cliente, mes;


-- ────────────────────────────────────────────────────────────
-- QUERY 2: Promedio de días entre emisión y pago
-- ────────────────────────────────────────────────────────────
-- Calcula los días promedio que tarda un cliente en pagar.
-- Usa el último pago registrado contra la fecha de emisión.
-- Solo considera facturas que tienen al menos un pago
-- y excluye notas de crédito y anomalías temporales.

SELECT
    c.id_cliente,
    c.nombre                                    AS nombre_cliente,
    c.segmento,
    COUNT(DISTINCT f.id_factura)                AS facturas_pagadas,
    ROUND(
        AVG(
            EXTRACT(DAY FROM (MAX(p.fecha_pago) - f.fecha_emision))
        ), 1
    )                                           AS promedio_dias_pago,
    MIN(
        EXTRACT(DAY FROM (p.fecha_pago - f.fecha_emision))
    )                                           AS min_dias,
    MAX(
        EXTRACT(DAY FROM (p.fecha_pago - f.fecha_emision))
    )                                           AS max_dias
FROM facturas f
JOIN clientes c ON c.id_cliente = f.id_cliente
JOIN pagos p ON p.id_factura = f.id_factura
WHERE f.es_nota_credito = FALSE
  AND p.fecha_pago >= f.fecha_emision           -- Excluir anomalías
  AND p.fecha_pago <= '2024-12-31'              -- Excluir pagos futuros
GROUP BY c.id_cliente, c.nombre, c.segmento
ORDER BY promedio_dias_pago DESC;


-- ────────────────────────────────────────────────────────────
-- QUERY 3: Facturas vencidas por más de 30 días
-- ────────────────────────────────────────────────────────────
-- Identifica la cartera vencida crítica: facturas cuya fecha
-- de vencimiento fue hace más de 30 días al cierre del dataset
-- y que aún no han sido pagadas en su totalidad.
-- Se excluyen notas de crédito y fechas anómalas.

SELECT
    f.id_factura,
    f.id_cliente,
    c.nombre                                    AS nombre_cliente,
    c.segmento,
    c.ciudad,
    f.fecha_emision,
    f.fecha_vencimiento,
    f.monto_total,
    COALESCE(SUM(p.monto_pago), 0)              AS monto_pagado,
    f.monto_total - COALESCE(SUM(p.monto_pago), 0)
                                                AS saldo_pendiente,
    ('2024-12-31'::DATE - f.fecha_vencimiento)  AS dias_vencida,
    CASE
        WHEN COALESCE(SUM(p.monto_pago), 0) = 0 THEN 'SIN PAGOS'
        WHEN COALESCE(SUM(p.monto_pago), 0) < f.monto_total THEN 'PARCIAL'
        ELSE 'PAGADA'
    END                                         AS estado_pago
FROM facturas f
JOIN clientes c ON c.id_cliente = f.id_cliente
LEFT JOIN pagos p ON p.id_factura = f.id_factura
WHERE f.es_nota_credito = FALSE
  AND f.fecha_vencimiento IS NOT NULL
  AND f.fecha_vencimiento_anomala = FALSE       -- Excluir años > 2030
  AND f.fecha_vencimiento < ('2024-12-31'::DATE - INTERVAL '30 days')
GROUP BY f.id_factura, f.id_cliente, c.nombre, c.segmento, c.ciudad,
         f.fecha_emision, f.fecha_vencimiento, f.monto_total
HAVING COALESCE(SUM(p.monto_pago), 0) < f.monto_total
ORDER BY dias_vencida DESC, saldo_pendiente DESC;


-- ────────────────────────────────────────────────────────────
-- QUERIES COMPLEMENTARIAS
-- ────────────────────────────────────────────────────────────

-- Query 4: Resumen ejecutivo de cartera por segmento
SELECT
    c.segmento,
    COUNT(DISTINCT c.id_cliente)                AS num_clientes,
    COUNT(f.id_factura)                         AS num_facturas,
    SUM(CASE WHEN NOT f.es_nota_credito THEN f.monto_total ELSE 0 END)
                                                AS ventas_totales,
    SUM(COALESCE(p_agg.monto_pagado, 0))        AS total_pagado,
    SUM(CASE WHEN NOT f.es_nota_credito THEN f.monto_total ELSE 0 END)
      - SUM(COALESCE(p_agg.monto_pagado, 0))    AS saldo_total
FROM clientes c
LEFT JOIN facturas f ON f.id_cliente = c.id_cliente
LEFT JOIN (
    SELECT id_factura, SUM(monto_pago) AS monto_pagado
    FROM pagos
    GROUP BY id_factura
) p_agg ON p_agg.id_factura = f.id_factura
GROUP BY c.segmento
ORDER BY ventas_totales DESC;


-- Query 5: Facturas con anomalías (para revisión manual)
SELECT
    tb.id_factura,
    tb.id_cliente,
    tb.nombre_cliente,
    tb.estatus_factura,
    tb.monto_total,
    tb.monto_pagado_total,
    tb.flag_pago_antes_emision,
    tb.flag_sobrepago,
    tb.flag_sin_pagos,
    CASE
        WHEN tb.flag_pago_antes_emision THEN 'Pago pre-emisión'
        WHEN tb.flag_sobrepago THEN 'Sobrepago detectado'
        WHEN tb.flag_sin_pagos AND tb.estatus_factura = 'VENCIDA' THEN 'Vencida sin pagos'
        ELSE 'Otro'
    END AS tipo_anomalia
FROM tabla_base_facturas tb
WHERE tb.flag_pago_antes_emision = TRUE
   OR tb.flag_sobrepago = TRUE
   OR (tb.flag_sin_pagos = TRUE AND tb.estatus_factura = 'VENCIDA')
ORDER BY
    tb.flag_pago_antes_emision DESC,
    tb.flag_sobrepago DESC,
    tb.monto_total DESC;
