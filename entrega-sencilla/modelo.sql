-- ============================================================
-- Modelo de Datos: Sistema de Facturación
-- Prueba Técnica Data Engineer · TYA Tierra y Armonía
-- ============================================================

-- Tabla: clientes
-- Catálogo maestro de clientes.
-- Un cliente puede tener cero o más facturas.
CREATE TABLE clientes (
    id_cliente      INTEGER     PRIMARY KEY,
    nombre          VARCHAR(100) NOT NULL,
    segmento        VARCHAR(50)  NOT NULL CHECK (segmento IN ('Retail', 'Distribuidor', 'Corporativo')),
    ciudad          VARCHAR(100),

    -- Auditoría
    created_at      TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP   DEFAULT CURRENT_TIMESTAMP
);

-- Índice para consultas por segmento y ciudad
CREATE INDEX idx_clientes_segmento ON clientes(segmento);
CREATE INDEX idx_clientes_ciudad   ON clientes(ciudad);


-- Tabla: facturas
-- Documentos comerciales emitidos a clientes.
-- Cada factura pertenece a exactamente un cliente.
-- Una factura puede tener cero o más pagos.
CREATE TABLE facturas (
    id_factura          INTEGER     PRIMARY KEY,
    id_cliente          INTEGER     NOT NULL REFERENCES clientes(id_cliente),
    fecha_emision       DATE        NOT NULL,
    fecha_vencimiento   DATE,
    monto_total         NUMERIC(12,2) NOT NULL,

    -- Flags de calidad
    es_nota_credito             BOOLEAN DEFAULT FALSE,
    fecha_vencimiento_anomala   BOOLEAN DEFAULT FALSE,

    -- Auditoría
    created_at      TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP   DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_facturas_cliente       ON facturas(id_cliente);
CREATE INDEX idx_facturas_emision       ON facturas(fecha_emision);
CREATE INDEX idx_facturas_vencimiento   ON facturas(fecha_vencimiento);


-- Tabla: pagos
-- Registro de pagos recibidos contra facturas.
-- Cada pago pertenece a exactamente una factura.
CREATE TABLE pagos (
    id_pago         INTEGER     PRIMARY KEY,
    id_factura      INTEGER     NOT NULL REFERENCES facturas(id_factura),
    fecha_pago      DATE        NOT NULL,
    monto_pago      NUMERIC(12,2) NOT NULL,

    -- Flags de calidad
    pago_negativo   BOOLEAN DEFAULT FALSE,

    -- Auditoría
    created_at      TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP   DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_pagos_factura  ON pagos(id_factura);
CREATE INDEX idx_pagos_fecha    ON pagos(fecha_pago);


-- Tabla: staging_facturas_rechazadas
-- Facturas que no pasaron validación de integridad referencial.
-- Se conservan para auditoría, nunca se eliminan.
CREATE TABLE staging_facturas_rechazadas (
    id_factura          INTEGER     PRIMARY KEY,
    id_cliente          INTEGER,            -- FK intencionalmente SIN constraint
    fecha_emision       VARCHAR(50),        -- Se guarda el valor original sin parsear
    fecha_vencimiento   VARCHAR(50),
    monto_total         NUMERIC(12,2),
    razon_rechazo       TEXT NOT NULL,

    created_at      TIMESTAMP   DEFAULT CURRENT_TIMESTAMP
);


-- Tabla: log_cargas
-- Registro de archivos procesados para idempotencia.
CREATE TABLE log_cargas (
    id              SERIAL      PRIMARY KEY,
    archivo         VARCHAR(100) NOT NULL,
    hash_md5        VARCHAR(32)  NOT NULL,
    registros       INTEGER      NOT NULL,
    timestamp_carga TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    resultado       VARCHAR(20)  DEFAULT 'OK',

    -- Evitar reprocesamiento de archivos idénticos
    UNIQUE(archivo, hash_md5)
);


-- Vista: tabla_base_facturas
-- Vista analítica a nivel factura con pagos agregados y estatus calculado.
-- Es la base para todos los reportes y análisis.
CREATE OR REPLACE VIEW tabla_base_facturas AS
SELECT
    f.id_factura,
    f.id_cliente,
    c.nombre            AS nombre_cliente,
    c.segmento,
    c.ciudad,
    f.fecha_emision,
    f.fecha_vencimiento,
    f.monto_total,
    f.es_nota_credito,

    -- Agregación de pagos
    COALESCE(SUM(p.monto_pago), 0)          AS monto_pagado_total,
    COUNT(p.id_pago)                         AS numero_pagos,
    MAX(p.fecha_pago)                        AS fecha_ultimo_pago,

    -- Flags de calidad
    CASE WHEN MAX(p.fecha_pago) < f.fecha_emision THEN TRUE ELSE FALSE END
        AS flag_pago_antes_emision,
    CASE WHEN NOT f.es_nota_credito AND f.monto_total > 0
              AND COALESCE(SUM(p.monto_pago), 0) > f.monto_total THEN TRUE ELSE FALSE END
        AS flag_sobrepago,
    CASE WHEN COUNT(p.id_pago) = 0 THEN TRUE ELSE FALSE END
        AS flag_sin_pagos,

    -- Estatus calculado (prioridad jerárquica)
    CASE
        WHEN f.es_nota_credito THEN 'NOTA_CREDITO'
        WHEN NOT f.es_nota_credito AND f.monto_total > 0
             AND COALESCE(SUM(p.monto_pago), 0) >= f.monto_total THEN 'PAGADA'
        WHEN COALESCE(SUM(p.monto_pago), 0) > 0
             AND COALESCE(SUM(p.monto_pago), 0) < f.monto_total THEN 'PARCIAL'
        WHEN COUNT(p.id_pago) = 0
             AND f.fecha_vencimiento IS NOT NULL
             AND f.fecha_vencimiento < '2024-12-31' THEN 'VENCIDA'
        ELSE 'PENDIENTE'
    END AS estatus_factura

FROM facturas f
JOIN clientes c ON c.id_cliente = f.id_cliente
LEFT JOIN pagos p ON p.id_factura = f.id_factura
GROUP BY f.id_factura, f.id_cliente, c.nombre, c.segmento, c.ciudad,
         f.fecha_emision, f.fecha_vencimiento, f.monto_total, f.es_nota_credito;
