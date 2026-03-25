# Entrega Sencilla – Data Engineering Pipeline (ETL & Quality)

Esta carpeta contiene el núcleo del procesamiento de datos solicitado en el challenge. Se diseñó para ser robusto, autónomo y fácil de ejecutar.

## 🚀 Cómo Correr el Proyecto (Paso a Paso)

### 1. Requisitos
- **Python 3.10+** instalado.
- Librería **pandas** (`pip install pandas`).

### 2. Ejecución del Pipeline
El script `procesamiento.py` automatiza la limpieza, validación de calidad y generación de tablas.

**Opción A: Rutas por defecto (recomendado)**
Coloca tus archivos `clientes.csv`, `facturas.csv` y `pagos.csv` en la misma carpeta donde descargaste el repositorio. Luego ejecuta:
```bash
python python/procesamiento.py
```

**Opción B: Rutas personalizadas**
Si tus archivos están en otra ubicación, puedes especificarlas mediante argumentos:
```bash
python python/procesamiento.py --clientes "C:/Ruta/clientes.csv" --facturas "C:/Ruta/facturas.csv" --pagos "C:/Ruta/pagos.csv"
```

### 3. Resultados Generados
Tras la ejecución, se crearán los siguientes archivos en la carpeta `outputs/`:
- `tabla_base_facturas.csv`: Datos limpios, normalizados y con banderas de calidad.
- `staging_rechazadas.csv`: Registros que no pasaron la validación de integridad (ej: factura de un cliente inexistente).

---

## 🛠️ Lo que hicimos y por qué (Storytelling Técnico)

### 1. Normalización "Doble Check" (Ciudades)
Detectamos que los datos de entrada tenían errores de codificación (caracteres extraños como `querçÿtaro`) y variaciones conceptuales (`gdl` vs `Guadalajara`). 
- **Por qué:** Un `JOIN` o un `GROUP BY` por ciudad fallaría si no hay consistencia.
- **Cómo:** Implementamos un motor dual. Primero busca en un **Mapa Estático** (casos conocidos) y, si no hay coincidencia, aplica un **Algoritmo Dinámico** basado en Unicode y coincidencia de palabras clave.

### 2. Calidad de Datos (Flags)
A diferencia de solo borrar datos malos, el pipeline marca problemas específicos:
- **Pago antes de emisión:** Anomalía financiera crítica.
- **Sobrepago:** Cuando el cliente pagó más del total (error de captura o devolución).
- **Año inválido:** Corrección automática de años como `0024` a `2024`.

### 3. Análisis SQL Avanzado (Parte 6)
Agregamos consultas en `sql/analisis.sql` para extraer valor de negocio real:
- **Aging Report:** Facturas vencidas hace +30 días.
- **Concentración por Ciudad:** ¿Dónde está nuestro riesgo de cobranza?
- **Performance por Segmento:** ¿Pagan mejor los clientes corporativos que los de retail?

---

## 🏗️ Estructura del Repositorio
```text
entrega-sencilla/
├── python/
│   └── procesamiento.py     # Script ETL + Calidad (Punto de entrada)
├── sql/
│   ├── modelo.sql           # DDL y Definición de Tablas
│   └── analisis.sql         # Consultas de análisis (Punto 6)
├── outputs/                 # Carpeta donde se guardan los resultados
└── README.md                # Esta guía
```
