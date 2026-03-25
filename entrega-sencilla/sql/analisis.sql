-- ────────────────────────────────────────────────────────────
-- CHALLENGE DATA ENGINEERING - TIERRA Y ARMONÍA (TYA)
-- CATÁLOGO DEFINITIVO DE CONSULTAS DE NEGOCIO (V.3.0)
-- ────────────────────────────────────────────────────────────

-- 1. ANÁLISIS DE PARETO (REGLA 80/20)
-- Propósito: Identificar al top 20% de clientes que generan el 80% de los ingresos.
WITH ventas_acum AS (
    SELECT
        c.nombre,
        SUM(f.monto_total) AS ventas_totales,
        SUM(SUM(f.monto_total)) OVER(ORDER BY SUM(f.monto_total) DESC) AS suma_acumulada,
        SUM(SUM(f.monto_total)) OVER() AS gran_total
    FROM facturas f
    JOIN clientes c ON c.id_cliente = f.id_cliente
    WHERE f.es_nota_credito = FALSE
    GROUP BY c.nombre
)
SELECT
    nombre,
    ventas_totales,
    ROUND((suma_acumulada / gran_total) * 100, 2) AS pct_acumulado,
    CASE WHEN (suma_acumulada / gran_total) <= 0.80 THEN 'TOP 20% (CORE)' ELSE 'RESTO' END AS categoria
FROM ventas_acum
ORDER BY ventas_totales DESC;


-- 2. RIESGO DE CHURN (CLIENTES INACTIVOS)
-- Propósito: Detectar clientes que no han tenido ventas en los últimos 90 días (corte dic 2024).
SELECT
    c.id_cliente,
    c.nombre,
    c.segmento,
    MAX(f.fecha_emision) AS ultima_factura,
    ('2024-12-31'::DATE - MAX(f.fecha_emision)) AS dias_desde_ultima_venta
FROM clientes c
LEFT JOIN facturas f ON f.id_cliente = c.id_cliente
GROUP BY c.id_cliente, c.nombre, c.segmento
HAVING MAX(f.fecha_emision) < '2024-10-01' OR MAX(f.fecha_emision) IS NULL
ORDER BY dias_desde_ultima_venta DESC;


-- 3. PROYECCIÓN DE FLUJO DE CAJA (PRÓXIMOS 30 DÍAS)
-- Propósito: Estimar ingresos futuros basados en facturas pendientes de cobro en enero 2025.
SELECT
    TO_CHAR(fecha_vencimiento, 'YYYY-MM-DD') AS fecha_vencimiento_estimada,
    COUNT(*) AS num_facturas,
    SUM(monto_total - monto_pagado_total) AS flujo_proyectado
FROM tabla_base_facturas
WHERE estatus_factura IN ('PENDIENTE', 'PARCIAL')
  AND fecha_vencimiento BETWEEN '2025-01-01' AND '2025-01-31'
GROUP BY fecha_vencimiento
ORDER BY fecha_vencimiento;


-- 4. CEI (COLLECTION EFFICIENCY INDEX) GLOBAL
-- Propósito: Medir qué tan efectivo es el proceso de cobro sobre el total facturado.
SELECT 
    SUM(monto_pagado_total) AS total_cobrado,
    SUM(monto_total) AS total_facturado,
    ROUND((SUM(monto_pagado_total) / SUM(monto_total)) * 100, 2) AS pct_eficiencia_cei
FROM tabla_base_facturas
WHERE es_nota_credito = FALSE;


-- 5. LATENCIA DE PAGO POR SEGMENTO
-- Propósito: Identificar qué tipo de clientes (Retail vs Corporativo) tiene mayor retraso promedio.
SELECT
    c.segmento,
    ROUND(AVG(EXTRACT(DAY FROM (p.fecha_pago - f.fecha_vencimiento))), 1) AS avg_retraso_dias
FROM pagos p
JOIN facturas f ON f.id_factura = f.id_factura
JOIN clientes c ON c.id_cliente = f.id_cliente
WHERE p.fecha_pago > f.fecha_vencimiento
GROUP BY c.segmento;


-- 6. VENTAS POR CLIENTE Y MES (ESTACIONALIDAD)
-- Propósito: Ver tendencias de venta mensuales por cliente para detectar picos comerciales.
SELECT
    c.nombre,
    TO_CHAR(f.fecha_emision, 'YYYY-MM') AS mes,
    COUNT(f.id_factura) AS total_facturas,
    SUM(f.monto_total) AS ventas_totales
FROM facturas f
JOIN clientes c ON c.id_cliente = f.id_cliente
GROUP BY c.nombre, mes
ORDER BY mes DESC, ventas_totales DESC;


-- 7. CARTERA CRÍTICA (+30 DÍAS VENCIDA)
-- Propósito: Listar facturas con riesgo alto de impago (vencidas hace más de un mes).
SELECT
    id_factura,
    nombre_cliente,
    monto_total,
    (monto_total - monto_pagado_total) AS saldo_pendiente,
    ('2024-12-31'::DATE - fecha_vencimiento) AS dias_vencimiento
FROM tabla_base_facturas
WHERE estatus_factura <> 'PAGADA'
  AND ('2024-12-31'::DATE - fecha_vencimiento) > 30
ORDER BY dias_vencimiento DESC;


-- 8. CONCENTRACIÓN DE COBRANZA POR CIUDAD
-- Propósito: Mapa de riesgo geográfico de la cartera de TYA.
SELECT
    c.ciudad,
    COUNT(DISTINCT c.id_cliente) AS num_clientes,
    SUM(f.monto_total) AS monto_total_facturado,
    SUM(CASE WHEN f.fecha_vencimiento < '2024-12-31' THEN (f.monto_total - COALESCE(p.monto_pago, 0)) ELSE 0 END) AS deuda_vencida
FROM clientes c
JOIN facturas f ON f.id_cliente = c.id_cliente
LEFT JOIN pagos p ON p.id_factura = f.id_factura
GROUP BY c.ciudad
ORDER BY deuda_vencida DESC;


-- 9. PERFORMANCE COMERCIAL POR SEGMENTO
-- Propósito: Analizar el ticket promedio y volumen por segmento de cliente.
SELECT
    c.segmento,
    COUNT(DISTINCT c.id_cliente) AS total_clientes,
    COUNT(f.id_factura) AS total_operaciones,
    ROUND(AVG(f.monto_total), 2) AS ticket_promedio,
    SUM(f.monto_total) AS volumen_total
FROM clientes c
JOIN facturas f ON f.id_cliente = c.id_cliente
GROUP BY c.segmento;


-- 10. DIAGNÓSTICO DE CALIDAD DE DATOS (FLAGS VS MONTOS)
-- Propósito: Cuantificar el impacto económico de los errores de proceso (como sobrepagos).
SELECT
    flag_sobrepago,
    flag_pago_antes_emision,
    COUNT(*) AS total_casos,
    SUM(monto_total) AS impacto_economico
FROM tabla_base_facturas
WHERE flag_sobrepago = TRUE OR flag_pago_antes_emision = TRUE
GROUP BY flag_sobrepago, flag_pago_antes_emision;
