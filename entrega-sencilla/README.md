# Entrega Sencilla – Data Engineering Pipeline (ETL & Quality)

Esta carpeta contiene el núcleo del procesamiento de datos solicitado en el challenge. Se diseñó para ser robusto, autónomo y fácil de ejecutar.

---

## 🚀 Cómo Correr el Proyecto (Paso a Paso)

### Opción A: Entrega Sencilla (Solo Python + SQL)

#### 1. Requisitos
- **Python 3.10+** instalado.
- Librería **pandas** (`pip install pandas`).

#### 2. Preparar los datos
Coloca tus archivos `clientes.csv`, `facturas.csv` y `pagos.csv` en la **raíz del proyecto** (la carpeta `challenge/`).

#### 3. Ejecutar el pipeline
```bash
cd entrega-sencilla
python python/procesamiento.py
```

Si tus CSVs están en otra ubicación, puedes pasar la ruta como argumento:
```bash
python python/procesamiento.py "C:/Ruta/donde/estan/los/csvs"
```

#### 4. Resultados generados
Tras la ejecución, se crean en la carpeta `outputs/`:
- **`tabla_base_facturas.csv`**: Datos limpios, normalizados y con banderas de calidad.
- **`staging_rechazadas.csv`**: Facturas que no pasaron la validación de integridad referencial.

#### 5. Consultas SQL
Los archivos en `sql/` están listos para ejecutar sobre cualquier motor PostgreSQL:
- **`modelo.sql`**: DDL completo (tablas, índices, vista `tabla_base_facturas`).
- **`analisis.sql`**: 10 consultas de inteligencia de negocio (ver sección abajo).

---

### Opción B: Dashboard Interactivo (Frontend)

#### 1. Requisitos
- **Node.js 18+** instalado.

#### 2. Instalación y ejecución
```bash
cd frontend
npm install
npm run dev
```

#### 3. Configurar IA (Opcional)
Para habilitar el análisis con inteligencia artificial (GPT-4o):
1. Crea un archivo `frontend/.env` con tu clave:
   ```
   VITE_OPENAI_API_KEY=tu_api_key_aqui
   ```
2. Reinicia el servidor de desarrollo.

#### 4. Uso del Dashboard
1. **Sube los 3 CSVs** (clientes, facturas, pagos) en la pestaña "Pipeline".
2. **Revisa las correcciones** automáticas detectadas (ciudades, fechas, segmentos).
3. **Ejecuta el pipeline** con un clic.
4. **Explora** las 5 pestañas: Evaluación, Pipeline, SQL/Modelo, Dashboard y Arquitectura.

---

## 🛠️ Lo que Hace el Proyecto (Storytelling Técnico)

### 1. Normalización "Doble Check" (Ciudades)
Los datos de entrada tienen errores de codificación (`querçÿtaro`) y abreviaciones (`gdl`).
- **Capa 1 — Mapa Estático:** Diccionario de casos conocidos para máxima velocidad.
- **Capa 2 — Algoritmo Dinámico:** Normalización Unicode + coincidencia fuzzy por keywords para casos nuevos.
- **Resultado:** Un `JOIN` o `GROUP BY` por ciudad nunca fallará por inconsistencia.

### 2. Sanitización de Fechas
El pipeline detecta y corrige automáticamente:
- Fechas en formato `YYYYMMDD` (ej: `20241115`).
- Fechas malformadas `DD-MM-YYY` (ej: `10-12-024` → `10/12/2024`).
- Años claramente erróneos (ej: `0224` → `2024`), nunca sugiriendo años futuros inválidos.

### 3. Flags de Calidad de Datos
En vez de eliminar datos con errores, el pipeline **los marca** para auditoría:
| Flag | Significado | Acción |
|------|------------|--------|
| `flag_pago_antes_emision` | Pago registrado antes de la fecha de emisión | Revisión manual |
| `flag_sobrepago` | Monto pagado > monto de la factura | Verificar devolución |
| `flag_sin_pagos` | Factura sin ningún pago asociado | Cartera activa |
| `flag_pago_futuro` | Fecha de pago posterior al corte del dataset | Verificar captura |

### 4. Tabla Base Unificada
Se construye una vista analítica (`tabla_base_facturas`) que combina:
- Facturas + pagos agregados (monto total pagado, número de pagos, fecha último pago).
- Estatus calculado con prioridad jerárquica: `NOTA_CREDITO > PAGADA > PARCIAL > VENCIDA > PENDIENTE`.
- Integridad referencial validada (facturas sin cliente válido → staging).

### 5. Análisis SQL de Negocio (10 Consultas Senior)
El archivo `analisis.sql` contiene un catálogo profesional de inteligencia de negocio:

| # | Consulta | Propósito |
|---|----------|-----------|
| 1 | Análisis de Pareto (80/20) | Top 20% de clientes que generan 80% de ingresos |
| 2 | Riesgo de Churn | Clientes inactivos hace +90 días |
| 3 | Proyección de Flujo de Caja | Ingresos esperados en los próximos 30 días |
| 4 | CEI (Collection Efficiency Index) | Eficiencia global del proceso de cobro |
| 5 | Latencia de Pago por Segmento | Retraso promedio por tipo de cliente |
| 6 | Estacionalidad de Ventas | Tendencias mensuales por cliente |
| 7 | Cartera Crítica (+30d) | Facturas con alto riesgo de impago |
| 8 | Concentración por Ciudad | Mapa de riesgo geográfico |
| 9 | Performance por Segmento | Ticket promedio Corporativo vs Retail |
| 10 | Diagnóstico de Calidad | Impacto económico de errores de proceso |

### 6. Dashboard Interactivo
El frontend replica la lógica exacta del pipeline Python en JavaScript y añade:
- **Drill-down interactivo:** Clic en cualquier métrica o flag para ver el detalle.
- **Explorador de Arquitectura:** Diagrama de flujo que explica qué/cómo/por qué de cada módulo.
- **Análisis AI:** Integración con GPT-4o para generar recomendaciones estratégicas ejecutivas.
- **Visualizaciones:** Donut de estatus, barras de ventas por cliente, reglas de calidad.

---

## 🏗️ Estructura del Repositorio

```text
challenge/
├── entrega-sencilla/
│   ├── python/
│   │   └── procesamiento.py     # Script ETL + Calidad (Punto de entrada)
│   ├── sql/
│   │   ├── modelo.sql           # DDL, Tablas, Índices y Vista Analítica
│   │   └── analisis.sql         # 10 Consultas de Inteligencia de Negocio
│   ├── outputs/                 # Resultados generados por el pipeline
│   └── README.md                # Esta guía
├── frontend/
│   ├── src/
│   │   ├── App.jsx              # UI Principal (Dashboard + AI + SQL)
│   │   ├── pipeline.js          # Lógica de procesamiento (espejo de Python)
│   │   ├── utils.js             # Tokens de diseño, parsers y caché
│   │   ├── components.jsx       # Componentes visuales reutilizables
│   │   ├── FileUploader.jsx     # Carga inteligente de CSVs
│   │   └── DataCorrectionPanel.jsx  # Panel de correcciones manuales
│   └── .env.example             # Plantilla para la API Key de OpenAI
├── clientes.csv                 # Datos de entrada
├── facturas.csv                 # Datos de entrada
└── pagos.csv                    # Datos de entrada
```

---

## ✅ Coherencia Frontend ↔ Backend

La lógica entre `procesamiento.py` (Python) y `pipeline.js` (JavaScript) es **idéntica**:

| Concepto | Python (`procesamiento.py`) | JavaScript (`pipeline.js`) |
|----------|---------------------------|---------------------------|
| Normalización de ciudades | `CITY_MAP` + `normalizar_texto()` + `identificar_ciudad()` | `CITY_MAP` + `normalizeText()` + `identifyCity()` |
| Parseo de fechas | `parsear_fecha()` (3 formatos) | `parseDate()` (3 formatos) |
| Validación referencial | `limpiar_facturas()` → staging | `facturasRechazadas[]` → staging |
| Flags de calidad | 4 flags idénticos | 4 flags idénticos |
| Estatus de factura | Prioridad jerárquica (5 niveles) | Prioridad jerárquica (5 niveles) |
| Corrección de años | `< 1000 → 2024` | `< 1000 → 2024` |
| Corrección de segmentos | `Carporativo → Corporativo` | `Carporativo → Corporativo` |

---

*Proyecto entregado con enfoque en escalabilidad, calidad de datos y experiencia de usuario.*
