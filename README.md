# Challenge TYA — Data Engineering Pipeline

> **Prueba Técnica · Data Engineer · Tierra y Armonía**
> Pipeline de calidad de datos con ETL en Python, modelo relacional SQL y dashboard interactivo React.

---

## 🎯 Objetivo

Diseñar e implementar un pipeline de datos end-to-end que:

1. **Ingiere** tres datasets CSV (clientes, facturas, pagos) con errores reales de encoding, formatos y typos.
2. **Limpia y normaliza** ciudades (doble capa: mapa estático + fuzzy dinámico), fechas (3 formatos) y segmentos.
3. **Valida** integridad referencial y aísla datos inválidos en staging (nunca elimina).
4. **Construye** una tabla base analítica a nivel factura con pagos agregados, flags de calidad y estatus jerárquico.
5. **Analiza** la cartera con 10 consultas SQL de inteligencia de negocio (Pareto, Churn, CEI, etc.).
6. **Visualiza** todo en un dashboard interactivo con drill-down, visualizaciones y análisis AI (GPT-4o).

---

## 🏗️ Arquitectura

```text
challenge-tya/
├── entrega-sencilla/           ← Entrega tradicional (Python + SQL)
│   ├── python/
│   │   └── procesamiento.py    # Script ETL completo (516 líneas)
│   ├── sql/
│   │   ├── modelo.sql          # DDL: 5 tablas + vista analítica
│   │   └── analisis.sql        # 10 consultas de negocio
│   └── README.md
├── frontend/                   ← Dashboard interactivo React
│   ├── src/
│   │   ├── App.jsx             # UI principal (5 pestañas)
│   │   ├── pipeline.js         # Lógica ETL (espejo de Python)
│   │   ├── utils.js            # Tokens de diseño, parsers, caché
│   │   ├── components.jsx      # Componentes visuales reutilizables
│   │   ├── FileUploader.jsx    # Carga inteligente de CSVs
│   │   └── DataCorrectionPanel.jsx  # Correcciones manuales
│   └── README.md
├── cloud/                      ← Configuración de despliegue AWS
│   ├── amplify-cloudformation.yaml
│   ├── amplify-cloudformation-fixed.yaml
│   ├── deploy-manual.sh
│   └── README.md
├── amplify.yml                 # Build spec para AWS Amplify
├── clientes.csv                # Dataset de entrada
├── facturas.csv                # Dataset de entrada
└── pagos.csv                   # Dataset de entrada
```

---

## 🚀 Quick Start

### Opción A: Pipeline Python (entrega sencilla)

```bash
pip install pandas
cd entrega-sencilla
python python/procesamiento.py
```

Genera `outputs/tabla_base_facturas.csv` y `outputs/staging_rechazadas.csv`.

### Opción B: Dashboard interactivo

```bash
cd frontend
npm install
npm run dev
```

Abre `http://localhost:5173`, sube los 3 CSVs y ejecuta el pipeline visualmente.

### Opción C: Deploy en AWS

Consulta [`cloud/README.md`](cloud/README.md) para instrucciones de despliegue con AWS Amplify.

---

## 🛠️ Stack Tecnológico

| Capa | Tecnología | Versión |
|------|-----------|---------|
| ETL / Backend | Python + pandas | 3.10+ |
| Modelo de datos | PostgreSQL (DDL) | Compatible |
| Frontend | React + Vite | 19.x / 8.x |
| Iconografía | Lucide React | 1.6+ |
| AI Analysis | OpenAI GPT-4o | API v1 |
| Cloud | AWS Amplify + CloudFormation | — |

---

## 📊 Cobertura del Challenge

| # | Parte | Estado | Ubicación |
|---|-------|--------|-----------|
| 1 | Entendimiento de datos | ✅ | Logs del pipeline + panel de corrección |
| 2 | Modelo SQL | ✅ | `sql/modelo.sql` — DDL con FKs e índices |
| 3 | Limpieza Python | ✅ | `python/procesamiento.py` — ciudades, fechas, segmentos |
| 4 | Calidad de datos | ✅ | 5 reglas automatizadas con flags |
| 5 | Transformación | ✅ | Estatus jerárquico (5 niveles) |
| 6 | Análisis SQL | ✅ | `sql/analisis.sql` — 10 consultas senior |
| 7 | Pipeline thinking | ✅ | Idempotencia MD5, staging, alertas |

---

## ✅ Coherencia Frontend ↔ Backend

La lógica de procesamiento es **idéntica** entre Python y JavaScript:

- Normalización de ciudades (`CITY_MAP` + algoritmo dinámico)
- Parseo de fechas (3 formatos: `DD/MM/YYYY`, `YYYYMMDD`, `DD-MM-YYY`)
- Validación referencial y staging de rechazados
- 4 flags de calidad de datos
- Estatus jerárquico con 5 niveles de prioridad

---

## 👤 Autor

**Carlos Acosta** · Marzo 2025
