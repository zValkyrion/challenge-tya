# Prueba Técnica – Data Engineer (Junior / Mid)

## Autor
Carlos Acosta · Marzo 2025

---

## Parte 1 – Entendimiento del Problema

### ¿Qué representan estos datos?

Se proporcionan 3 datasets que modelan un flujo de facturación básico:

| Dataset | Registros | Descripción |
|---------|-----------|-------------|
| `clientes.csv` | 21 | Catálogo maestro de clientes con identidad, segmento comercial y ubicación |
| `facturas.csv` | 50 | Documentos comerciales emitidos a clientes, con montos y fechas de vencimiento |
| `pagos.csv` | 42 | Registro de pagos recibidos contra facturas |

**Relaciones:**
```
clientes (1) ──< facturas (1) ──< pagos
```
- Un cliente puede tener 0 o más facturas (1:N)
- Una factura puede tener 0 o más pagos (1:N)

### ¿Qué problemas detecté?

#### Calidad de datos
| # | Dataset | Campo | Problema | Severidad |
|---|---------|-------|----------|-----------|
| 1 | clientes | ciudad | Encoding corrupto: "QuerÇ¸taro", "Canc£n" | Media |
| 2 | clientes | ciudad | Capitalización inconsistente: "GUADALAJARA", "Gdl" | Media |
| 3 | clientes | ciudad | "Monterey" → probablemente "Monterrey" | Baja |
| 4 | clientes | ciudad | 1 valor nulo (Cliente 21) | Media |
| 5 | clientes | segmento | "Carporativo" → typo de "Corporativo" | Baja |
| 6 | facturas | fecha_emision | 2 formatos mezclados: DD/MM/YYYY y YYYYMMDD | Alta |
| 7 | facturas | fecha_vencimiento | Año 0224, año 2042, año 2052 | Alta |
| 8 | facturas | monto_total | 3 facturas con montos negativos | Alta |
| 9 | pagos | fecha_pago | 3 formatos + malformado "10-12-024" | Alta |
| 10 | pagos | monto_pago | 4 pagos con montos negativos | Alta |

#### Integridad referencial
| # | Problema | Afecta |
|---|----------|--------|
| 1 | `id_cliente` 22, 23, 24 en facturas **no existen** en clientes | Facturas 1016, 1022, 1033 |
| 2 | 3 clientes sin facturas (8, 17, 21) | Normal operacionalmente |
| 3 | 10 facturas sin ningún pago | Análisis de cartera |

#### Lógica de negocio
| # | Problema |
|---|----------|
| 1 | Pagos con fecha anterior a la fecha de emisión de su factura |
| 2 | Pagos en fechas futuras respecto al dataset (dic 2025) |

### ¿Qué cosas no estaban claras?
1. Si los montos negativos son notas de crédito o errores de captura
2. Si la fecha `10-12-024` es `10/12/2024` o algún otro formato
3. Moneda de los montos (asumí MXN)
4. Fecha de corte del dataset para determinar "vencida"

### Supuestos adoptados
1. **Montos negativos en facturas** → notas de crédito. Se conservan con flag `es_nota_credito`
2. **Montos negativos en pagos** → devoluciones/ajustes. Se conservan con flag `pago_negativo`
3. **`10-12-024`** → error tipográfico de `10/12/2024`. Se corrige documentadamente
4. **`30/12/0224`** → error tipográfico de `30/12/2024` (año 224 d.C. es imposible)
5. **"Carporativo"** → se corrige a "Corporativo"
6. **Clientes 22, 23, 24** → facturas asociadas se marcan como `cliente_invalido=True` y se aíslan en staging
7. **Moneda** → pesos mexicanos, sin decimales por simplicidad del sistema fuente
8. **Fecha de corte** → `2024-12-31` (datos de nov-dic 2024)

---

## Parte 3 – Limpieza y preparación (explicación)

### Qué se corrigió
- **Ciudades**: normalización de 7+ variantes a 5 ciudades canónicas (Querétaro, Guadalajara, Monterrey, Cancún, CDMX)
- **Segmentos**: typo "Carporativo" → "Corporativo"
- **Fechas**: parseo de 3 formatos distintos (DD/MM/YYYY, YYYYMMDD, DD-MM-YYY)
- **Años anómalos**: año < 1000 → 2024 (caso 0224)

### Qué se dejó igual
- Montos negativos (clasificados, no eliminados)
- Fechas futuras (flaggeadas, no corregidas — podrían ser datos válidos)

### Qué se marcó como inconsistente
- Facturas con `id_cliente` inexistente → staging de rechazadas
- Pagos anteriores a emisión → flag `pago_antes_emision`
- Sobrepagos → flag `sobrepago`
- Pagos en fechas futuras → flag `pago_futuro`

---

## Parte 4 – Reglas de calidad de datos

| # | Regla | Qué valida | Por qué importa | Acción si falla |
|---|-------|-----------|-----------------|-----------------|
| 1 | `FK_facturas_clientes` | Todo id_cliente en facturas existe en clientes | Garantiza integridad referencial | Aislar factura en staging, no eliminar |
| 2 | `FECHA_parseable` | Todas las fechas pueden convertirse a datetime | Fechas inválidas rompen cálculos de vencimiento | Parseo heurístico, log de warning, marcar con flag |
| 3 | `MONTO_positivo` | monto_total y monto_pago son >= 0 (excluyendo notas de crédito) | Montos negativos inesperados indican errores de captura | Clasificar como nota de crédito/devolución, no eliminar |
| 4 | `LOGICA_pago_no_anterior_emision` | fecha_pago >= fecha_emision de su factura | Un pago antes de que exista la factura es lógicamente imposible | Flag para revisión manual, no bloquear pipeline |
| 5 | `UNICIDAD_id` | IDs primarios son únicos | Duplicados corrompen agregaciones y joins | Rechazar registro duplicado, mantener el primero, alertar |

---

## Parte 5 – Lógica de estatus de factura

Se asigna `estatus_factura` con la siguiente prioridad:

```
1. NOTA_CREDITO  → si monto_total < 0
2. PAGADA        → si monto_pagado >= monto_total (y no es nota de crédito)
3. PARCIAL       → si pagado > 0 pero < monto_total
4. VENCIDA       → si sin pagos y fecha_vencimiento < fecha_corte (2024-12-31)
5. PENDIENTE     → cualquier otro caso
```

Esta jerarquía prioriza la clasificación más específica primero. Las notas de crédito se aíslan porque no representan deuda real.

---

## Parte 7 – Pensamiento de pipeline

### Si este proceso se ejecutara todos los días:

**1. ¿Cómo evitaría duplicados?**
- Generar un hash MD5 del contenido de cada archivo al recibirlo
- Almacenar en tabla `log_cargas(hash, archivo, timestamp, registros)`
- Si el hash ya existe → skip silencioso con log informativo
- Para registros individuales: `INSERT ... ON CONFLICT (id_pago) DO UPDATE`

**2. ¿Qué haría si llega el mismo archivo otra vez?**
- Comparar hash con el último procesado
- Si es idéntico → no reprocesar, log "archivo duplicado detectado"
- Si es diferente → computar diff fila por fila, procesar solo cambios
- Mantener versionamiento de archivos en S3 con prefijo de fecha

**3. ¿Qué haría si llega un pago nuevo para una factura ya procesada?**
- Upsert con `ON CONFLICT`: actualizar monto_pagado_total y numero_pagos
- Recalcular `estatus_factura` automáticamente
- Log del cambio de estado (ej: PARCIAL → PAGADA)
- Si el pago genera un sobrepago → alerta al equipo de cobranza

### Arquitectura propuesta (simple):
```
S3 (raw) → Lambda (carga) → Staging → Lambda (limpieza) → DW (PostgreSQL)
                ↓                                              ↓
           log_cargas                                    reporte_calidad
```

Con EventBridge para triggers automáticos y SES para alertas si la tasa de rechazo supera el 5%.
