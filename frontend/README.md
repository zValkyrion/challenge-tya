# Frontend — Dashboard Interactivo de Calidad de Datos

> SPA en React 19 + Vite 8 que replica la lógica exacta del pipeline Python en el navegador, con visualizaciones interactivas y análisis AI.

---

## 🚀 Instalación y ejecución

```bash
cd frontend
npm install
npm run dev
```

Abrir `http://localhost:5173` en el navegador.

### Configurar IA (Opcional)

Para habilitar el análisis estratégico con GPT-4o:

```bash
# Crear archivo .env en frontend/
echo "VITE_OPENAI_API_KEY=tu_api_key_aqui" > .env
```

Reiniciar el servidor de desarrollo tras crear el `.env`.

---

## 🖥️ Pestañas del Dashboard

| # | Pestaña | Contenido |
|---|---------|-----------|
| 1 | **✓ Evaluación** | Checklist visual de cobertura del challenge (7 partes) |
| 2 | **⚡ Pipeline** | Carga de CSVs → revisión → corrección manual → ejecución → resultados |
| 3 | **🗄 SQL / Modelo** | Diagrama ER interactivo + 10 queries con joins explicados + lógica de estatus |
| 4 | **📊 Dashboard** | Métricas de cartera, donut de estatus, barras de ventas, reglas de calidad |
| 5 | **🏗 Arquitectura** | Explorador visual de los 5 módulos del pipeline con qué/cómo/por qué |

---

## ⚙️ Arquitectura del código

```text
src/
├── App.jsx                 # Componente raíz con 5 pestañas + lógica AI
├── pipeline.js             # Motor ETL (espejo exacto de procesamiento.py)
├── utils.js                # Design tokens, parsers CSV/fecha, caché, diffs
├── components.jsx          # Componentes visuales reutilizables
│                             (Badge, MetricCard, BarChart, StatusDonut, FlagCard, etc.)
├── FileUploader.jsx        # Carga inteligente: validación de esquema, caché localStorage,
│                             detección de diferencias entre versiones
├── DataCorrectionPanel.jsx # Panel de correcciones manuales pre-pipeline
├── index.css               # Estilos globales, animaciones, glassmorphism
└── main.jsx                # Punto de entrada React
```

### Flujo de datos

```
CSVs (usuario) → FileUploader (validación + caché)
    → DataCorrectionPanel (correcciones manuales)
    → runPipeline() [pipeline.js]
        → Limpieza (ciudades, fechas, segmentos)
        → Validación referencial
        → Tabla base + flags + estatus
    → App.jsx (visualización en Dashboard)
    → OpenAI API (análisis estratégico opcional)
```

---

## 🎨 Stack y dependencias

| Dependencia | Uso |
|-------------|-----|
| **React 19** | UI reactiva y componentes |
| **Vite 8** | Build tool y dev server con HMR |
| **Lucide React** | Iconografía SVG |
| **OpenAI API** | Análisis AI estratégico (opcional) |

### Design system

- **Tema oscuro** con paleta curada (teal, amber, purple, blue, red)
- **Glassmorphism** y gradientes sutiles
- **Micro-animaciones**: fadeIn, slideUp, pulse, spin
- **Tipografía**: Inter / IBM Plex Mono

Las constantes de color y tokens están centralizados en `utils.js` → objeto `C`.

---

## 📦 Scripts disponibles

| Comando | Acción |
|---------|--------|
| `npm run dev` | Servidor de desarrollo (localhost:5173) |
| `npm run build` | Build de producción → `dist/` |
| `npm run preview` | Preview del build de producción |
| `npm run lint` | Análisis estático con ESLint |

---

## 🔑 Variables de entorno

| Variable | Requerida | Descripción |
|----------|-----------|-------------|
| `VITE_OPENAI_API_KEY` | No | API Key de OpenAI para análisis AI |
| `VITE_APP_NAME` | No | Nombre de la app (default: Challenge TYA) |
| `VITE_APP_VERSION` | No | Versión (default: 2.0.0) |
| `VITE_ENVIRONMENT` | No | Entorno: PRODUCTION / STAGING |

---

## ✅ Coherencia con el backend Python

El motor de procesamiento en `pipeline.js` es un **espejo exacto** de `procesamiento.py`:

- Misma normalización de ciudades (mapa estático + algoritmo dinámico)
- Mismo parseo de fechas (3 formatos)
- Misma validación referencial y staging
- Mismos 4 flags de calidad
- Misma jerarquía de estatus (5 niveles)

Esto garantiza que los resultados del dashboard coincidan al 100% con la salida del script Python.

---

*Autor: Carlos Acosta · Marzo 2025*
