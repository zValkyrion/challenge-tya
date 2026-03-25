# Entrega Sencilla — Pipeline ETL & Calidad de Datos

> Núcleo de procesamiento del challenge: script Python autónomo + modelo SQL completo.
> Diseñado para ejecutarse sin dependencias externas más allá de `pandas`.

---

## 🚀 Ejecución

### Requisitos
- **Python 3.10+**
- **pandas** (`pip install pandas`)

### Ejecutar

```bash
cd entrega-sencilla
python python/procesamiento.py
```

Si los CSVs están en otra ruta:
```bash
python python/procesamiento.py "C:/ruta/a/los/csvs"
```

### Resultados

Se generan en `outputs/`:

| Archivo | Contenido |
|---------|-----------|
| `tabla_base_facturas.csv` | Datos limpios, normalizados, con flags de calidad y estatus |
| `staging_rechazadas.csv` | Facturas que no pasaron validación de integridad referencial |

---

## ⚙️ Qué hace el pipeline (paso a paso)

### 1. Carga de datos
- Lee `clientes.csv`, `facturas.csv`, `pagos.csv` con encoding `latin1`
- Calcula hashes MD5 para idempotencia (evitar reprocesamiento)

### 2. Normalización "Doble Check" de ciudades
Los datos llegan con errores de encoding (`querçÿtaro`) y abreviaciones (`gdl`):

| Capa | Estrategia | Propósito |
|------|-----------|-----------|
| **Mapa estático** | Diccionario de casos conocidos | Máxima velocidad y precisión |
| **Algoritmo dinámico** | Unicode NFD + limpieza regex + fuzzy matching | Casos nuevos/desconocidos |

### 3. Sanitización de fechas
Detecta y corrige automáticamente 3 formatos:

| Formato | Ejemplo | Acción |
|---------|---------|--------|
| `DD/MM/YYYY` | `15/11/2024` | Parseo estándar |
| `YYYYMMDD` | `20241115` | Separación posicional |
| `DD-MM-YYY` | `10-12-024` | Antepone "2" → `2024` |

Años anómalos (`0224`) se corrigen a `2024`, nunca sugiriendo años futuros inválidos.

### 4. Validación referencial
- Facturas con `id_cliente` inexistente → aisladas en `staging_rechazadas.csv`
- **Nunca se eliminan datos**, solo se marcan y separan para auditoría

### 5. Flags de calidad

| Flag | Significado | Acción |
|------|------------|--------|
| `flag_pago_antes_emision` | Pago registrado antes de la fecha de emisión | Revisión manual |
| `flag_sobrepago` | Monto pagado > monto de la factura | Verificar devolución |
| `flag_sin_pagos` | Factura sin ningún pago asociado | Cartera activa |
| `flag_pago_futuro` | Fecha de pago posterior al corte (31/12/2024) | Verificar captura |

### 6. Estatus de factura (prioridad jerárquica)

```
NOTA_CREDITO > PAGADA > PARCIAL > VENCIDA > PENDIENTE
```

| Estatus | Condición |
|---------|-----------|
| `NOTA_CREDITO` | `monto_total < 0` |
| `PAGADA` | `monto_pagado >= monto_total` |
| `PARCIAL` | `monto_pagado > 0` y `< monto_total` |
| `VENCIDA` | Sin pagos y `fecha_vencimiento < 31/12/2024` |
| `PENDIENTE` | Cualquier otro caso |

### 7. Reglas de calidad automatizadas

El pipeline evalúa 5 reglas y reporta PASS/FAIL con detalle:

1. **FK_facturas_clientes** — Integridad referencial
2. **FECHA_emision_parseable** — Todas las fechas parseables
3. **MONTO_positivo** — Montos positivos (excl. notas de crédito)
4. **LOGICA_pago_pre_emision** — Fecha pago ≥ fecha emisión
5. **UNICIDAD_ids** — Sin duplicados en IDs primarios

---

## 🗄️ Modelo SQL

### Tablas (`modelo.sql`)

| Tabla | Descripción | Claves |
|-------|-------------|--------|
| `clientes` | Catálogo maestro | PK: `id_cliente` |
| `facturas` | Documentos comerciales | PK: `id_factura`, FK: `id_cliente` |
| `pagos` | Registros de pago | PK: `id_pago`, FK: `id_factura` |
| `staging_facturas_rechazadas` | Facturas con FK inválida | Sin constraint FK (intencional) |
| `log_cargas` | Control de idempotencia | UNIQUE: `(archivo, hash_md5)` |

Incluye **índices** en columnas de filtro frecuente y una **vista** `tabla_base_facturas` que replica la lógica del pipeline Python directamente en SQL.

### Consultas de negocio (`analisis.sql`)

| # | Consulta | Propósito |
|---|----------|-----------|
| 1 | Análisis de Pareto (80/20) | Top 20% de clientes que generan 80% de ingresos |
| 2 | Riesgo de Churn | Clientes inactivos hace +90 días |
| 3 | Proyección de Flujo de Caja | Ingresos esperados en próximos 30 días |
| 4 | CEI (Collection Efficiency Index) | Eficiencia global del cobro |
| 5 | Latencia de Pago por Segmento | Retraso promedio Retail vs Corporativo |
| 6 | Estacionalidad de Ventas | Tendencias mensuales por cliente |
| 7 | Cartera Crítica (+30d) | Facturas con alto riesgo de impago |
| 8 | Concentración por Ciudad | Mapa de riesgo geográfico |
| 9 | Performance por Segmento | Ticket promedio por tipo de cliente |
| 10 | Diagnóstico de Calidad | Impacto económico de errores de proceso |

---

## 📁 Estructura

```text
entrega-sencilla/
├── python/
│   └── procesamiento.py        # Script ETL (punto de entrada)
├── sql/
│   ├── modelo.sql              # DDL, tablas, índices, vista analítica
│   └── analisis.sql            # 10 consultas de inteligencia de negocio
├── outputs/                    # Generados por el pipeline
│   ├── tabla_base_facturas.csv
│   └── staging_rechazadas.csv
└── README.md                   # Esta guía
```

---

## ✅ Coherencia con el Frontend

La lógica entre `procesamiento.py` y `frontend/src/pipeline.js` es **idéntica**:

| Concepto | Python | JavaScript |
|----------|--------|------------|
| Ciudades | `CITY_MAP` + `normalizar_texto()` + `identificar_ciudad()` | `CITY_MAP` + `normalizeText()` + `identifyCity()` |
| Fechas | `parsear_fecha()` (3 formatos) | `parseDate()` (3 formatos) |
| Referencial | `limpiar_facturas()` → staging | `facturasRechazadas[]` → staging |
| Flags | 4 flags idénticos | 4 flags idénticos |
| Estatus | Prioridad jerárquica (5 niveles) | Prioridad jerárquica (5 niveles) |

---

*Autor: Carlos Acosta · Marzo 2025*
