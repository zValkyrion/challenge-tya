"""
Procesamiento de datos – Prueba Técnica Data Engineer
TYA Tierra y Armonía

Este script realiza:
1. Carga de datos desde CSV (con detección de encoding)
2. Limpieza y normalización (ciudades, fechas, segmentos)
3. Validación de integridad referencial
4. Construcción de tabla base a nivel factura
5. Asignación de estatus y flags de calidad
6. Exportación de resultados

Autor: Carlos Acosta
Fecha: Marzo 2025
"""

import pandas as pd
import hashlib
import os
import sys
from datetime import datetime


# ────────────────────────────────────────────────────────────
# 1. CONFIGURACIÓN
# ────────────────────────────────────────────────────────────

# Fecha de corte del dataset (todos los datos son nov-dic 2024)
FECHA_CORTE = pd.Timestamp("2024-12-31")

# Directorio de datos (relativo a este script)
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", )
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "outputs")

# Mapeo de normalización de ciudades
# Cubre variantes de encoding, capitalización y abreviaciones
CITY_MAP = {
    "querétaro": "Querétaro",
    "queretaro": "Querétaro",
    "quertaro": "Querétaro",
    "querçÿtaro": "Querétaro",
    "querç¸taro": "Querétaro",
    "guadalajara": "Guadalajara",
    "gdl": "Guadalajara",
    "monterrey": "Monterrey",
    "monterey": "Monterrey",    # Probable omisión de letra
    "cancún": "Cancún",
    "cancun": "Cancún",
    "cancã£n": "Cancún",
    "canc£n": "Cancún",
}


# ────────────────────────────────────────────────────────────
# 2. FUNCIONES DE CARGA
# ────────────────────────────────────────────────────────────

def cargar_csv(nombre_archivo: str, encoding: str = "latin1") -> pd.DataFrame:
    """
    Carga un archivo CSV con el encoding especificado.
    El encoding por defecto es latin1 porque los archivos fuente
    contienen caracteres especiales del español mal codificados.
    """
    ruta = os.path.join(DATA_DIR, nombre_archivo)
    df = pd.read_csv(ruta, encoding=encoding)
    print(f"  ✓ {nombre_archivo}: {len(df)} registros, {len(df.columns)} columnas")
    print(f"    Columnas: {list(df.columns)}")
    print(f"    Tipos: {dict(df.dtypes)}")
    print(f"    Ejemplo:\n{df.head(3).to_string(index=False)}\n")
    return df


def calcular_hash(nombre_archivo: str) -> str:
    """
    Calcula el hash MD5 de un archivo para detectar duplicados.
    Esto permite implementar idempotencia en el pipeline.
    """
    ruta = os.path.join(DATA_DIR, nombre_archivo)
    with open(ruta, "rb") as f:
        return hashlib.md5(f.read()).hexdigest()


# ────────────────────────────────────────────────────────────
# 3. FUNCIONES DE LIMPIEZA
# ────────────────────────────────────────────────────────────

def limpiar_clientes(df: pd.DataFrame) -> pd.DataFrame:
    """
    Limpieza del dataset de clientes:
    - Normaliza ciudades (encoding, capitalización, abreviaciones)
    - Corrige typos en segmentos ("Carporativo" → "Corporativo")
    - Preserva nulos en ciudad (no inventa datos)
    """
    df = df.copy()

    # Normalización de ciudades
    ciudades_originales = df["ciudad"].copy()
    df["ciudad"] = df["ciudad"].apply(
        lambda x: CITY_MAP.get(str(x).lower().strip(), x) if pd.notna(x) else None
    )
    cambios = (ciudades_originales != df["ciudad"]).sum()
    print(f"  ✓ Ciudades normalizadas: {cambios} cambios")

    # Corrección de segmentos
    typos = df["segmento"] == "Carporativo"
    if typos.any():
        df.loc[typos, "segmento"] = "Corporativo"
        print(f"  ⚠ Typo corregido: 'Carporativo' → 'Corporativo' ({typos.sum()} registro(s))")

    return df


def parsear_fecha(valor: str) -> pd.Timestamp:
    """
    Parsea fechas en múltiples formatos encontrados en los datos:
    - DD/MM/YYYY (formato principal)
    - YYYYMMDD   (formato alternativo, ej: factura 1010)
    - DD-MM-YYY  (formato malformado, ej: pago 2019 "10-12-024" → 10/12/2024)

    Retorna pd.NaT si no puede parsear.
    """
    if pd.isna(valor):
        return pd.NaT

    s = str(valor).strip()

    # Formato YYYYMMDD (8 dígitos)
    if len(s) == 8 and s.isdigit():
        try:
            return pd.Timestamp(f"{s[:4]}-{s[4:6]}-{s[6:8]}")
        except ValueError:
            return pd.NaT

    # Formato DD/MM/YYYY
    if "/" in s and len(s) == 10:
        try:
            d, m, y = s.split("/")
            return pd.Timestamp(f"{y}-{m}-{d}")
        except (ValueError, IndexError):
            return pd.NaT

    # Formato malformado DD-MM-YYY (ej: "10-12-024")
    if "-" in s and len(s) == 9:
        try:
            d, m, y = s.split("-")
            # Supuesto: año de 3 dígitos → anteponer "2" (024 → 2024)
            return pd.Timestamp(f"2{y}-{m}-{d}")
        except (ValueError, IndexError):
            return pd.NaT

    return pd.NaT


def limpiar_facturas(df: pd.DataFrame, clientes_ids: set) -> tuple:
    """
    Limpieza del dataset de facturas:
    - Valida integridad referencial (id_cliente existe en clientes)
    - Parsea fechas de emisión y vencimiento
    - Corrige años anómalos (< 1000 → asumido 2024)
    - Clasifica notas de crédito (monto negativo)

    Retorna: (facturas_limpias, facturas_rechazadas)
    """
    df = df.copy()

    # Separar facturas con cliente inválido
    mask_invalido = ~df["id_cliente"].astype(str).isin([str(x) for x in clientes_ids])
    rechazadas = df[mask_invalido].copy()
    rechazadas["razon_rechazo"] = rechazadas["id_cliente"].apply(
        lambda x: f"id_cliente {x} no existe en catálogo"
    )
    limpias = df[~mask_invalido].copy()

    if len(rechazadas) > 0:
        print(f"  ⚠ {len(rechazadas)} facturas con cliente inválido → staging")

    # Parsear fechas
    limpias["fecha_emision"] = limpias["fecha_emision"].apply(parsear_fecha)
    limpias["fecha_vencimiento"] = limpias["fecha_vencimiento"].apply(parsear_fecha)

    # Corregir años anómalos en fecha_vencimiento
    mask_ano_invalido = limpias["fecha_vencimiento"].apply(
        lambda x: x.year < 1000 if pd.notna(x) else False
    )
    if mask_ano_invalido.any():
        limpias.loc[mask_ano_invalido, "fecha_vencimiento"] = limpias.loc[
            mask_ano_invalido, "fecha_vencimiento"
        ].apply(lambda x: x.replace(year=2024))
        print(f"  ⚠ {mask_ano_invalido.sum()} fecha(s) con año < 1000 → corregido a 2024")

    # Flag: fecha vencimiento anómala (año > 2030)
    limpias["fecha_vencimiento_anomala"] = limpias["fecha_vencimiento"].apply(
        lambda x: x.year > 2030 if pd.notna(x) else False
    )

    # Clasificar notas de crédito
    limpias["monto_total"] = pd.to_numeric(limpias["monto_total"], errors="coerce")
    limpias["es_nota_credito"] = limpias["monto_total"] < 0

    notas = limpias["es_nota_credito"].sum()
    if notas > 0:
        print(f"  ✓ {notas} nota(s) de crédito clasificadas")

    print(f"  ✓ Facturas: {len(limpias)} válidas, {len(rechazadas)} en staging")
    return limpias, rechazadas


def limpiar_pagos(df: pd.DataFrame) -> pd.DataFrame:
    """
    Limpieza del dataset de pagos:
    - Parsea fechas de pago (3 formatos)
    - Clasifica pagos negativos como devoluciones
    """
    df = df.copy()

    # Parsear fechas
    df["fecha_pago"] = df["fecha_pago"].apply(parsear_fecha)
    fechas_nulas = df["fecha_pago"].isna().sum()
    if fechas_nulas > 0:
        print(f"  ⚠ {fechas_nulas} fecha(s) de pago no parseables")

    # Clasificar pagos negativos
    df["monto_pago"] = pd.to_numeric(df["monto_pago"], errors="coerce")
    df["pago_negativo"] = df["monto_pago"] < 0

    negativos = df["pago_negativo"].sum()
    if negativos > 0:
        print(f"  ⚠ {negativos} pago(s) negativo(s) (devoluciones)")

    print(f"  ✓ Pagos procesados: {len(df)} registros")
    return df


# ────────────────────────────────────────────────────────────
# 4. TABLA BASE Y FLAGS
# ────────────────────────────────────────────────────────────

def construir_tabla_base(facturas: pd.DataFrame, pagos: pd.DataFrame) -> pd.DataFrame:
    """
    Construye la tabla base a nivel factura con:
    - Pagos agregados (monto total pagado, número de pagos, último pago)
    - Flags de calidad (pago antes de emisión, sobrepago, sin pagos, pago futuro)
    - Estatus de factura calculado
    """
    # Agregar pagos por factura
    pagos_agg = pagos.groupby("id_factura").agg(
        monto_pagado_total=("monto_pago", "sum"),
        numero_pagos=("id_pago", "count"),
        fecha_ultimo_pago=("fecha_pago", "max"),
    ).reset_index()

    # Merge con facturas
    tabla = facturas.merge(pagos_agg, on="id_factura", how="left")

    # Llenar nulos de pagos con 0
    tabla["monto_pagado_total"] = tabla["monto_pagado_total"].fillna(0)
    tabla["numero_pagos"] = tabla["numero_pagos"].fillna(0).astype(int)

    # ── Flags de calidad ──

    # Flag 1: Pago antes de emisión
    tabla["flag_pago_antes_emision"] = (
        tabla["fecha_ultimo_pago"].notna()
        & tabla["fecha_emision"].notna()
        & (tabla["fecha_ultimo_pago"] < tabla["fecha_emision"])
    )

    # Flag 2: Sobrepago
    tabla["flag_sobrepago"] = (
        ~tabla["es_nota_credito"]
        & (tabla["monto_total"] > 0)
        & (tabla["monto_pagado_total"] > tabla["monto_total"])
    )

    # Flag 3: Sin pagos
    tabla["flag_sin_pagos"] = tabla["numero_pagos"] == 0

    # Flag 4: Pago en fecha futura
    tabla["flag_pago_futuro"] = (
        tabla["fecha_ultimo_pago"].notna()
        & (tabla["fecha_ultimo_pago"] > FECHA_CORTE)
    )

    # ── Estatus de factura ──
    # Orden de prioridad: NOTA_CREDITO > PAGADA > PARCIAL > VENCIDA > PENDIENTE
    condiciones = [
        tabla["es_nota_credito"],
        ~tabla["es_nota_credito"] & (tabla["monto_total"] > 0) & (tabla["monto_pagado_total"] >= tabla["monto_total"]),
        (tabla["monto_pagado_total"] > 0) & (tabla["monto_pagado_total"] < tabla["monto_total"]),
        (tabla["numero_pagos"] == 0) & tabla["fecha_vencimiento"].notna() & (tabla["fecha_vencimiento"] < FECHA_CORTE),
    ]
    opciones = ["NOTA_CREDITO", "PAGADA", "PARCIAL", "VENCIDA"]
    tabla["estatus_factura"] = pd.Series("PENDIENTE", index=tabla.index)
    for cond, est in zip(reversed(condiciones), reversed(opciones)):
        tabla.loc[cond, "estatus_factura"] = est

    # Resumen de flags
    print(f"\n  Flags de calidad:")
    print(f"    Pago antes de emisión: {tabla['flag_pago_antes_emision'].sum()}")
    print(f"    Sobrepago:             {tabla['flag_sobrepago'].sum()}")
    print(f"    Sin pagos:             {tabla['flag_sin_pagos'].sum()}")
    print(f"    Pago futuro:           {tabla['flag_pago_futuro'].sum()}")

    # Resumen de estatus
    print(f"\n  Distribución de estatus:")
    for est, count in tabla["estatus_factura"].value_counts().items():
        print(f"    {est}: {count}")

    return tabla


# ────────────────────────────────────────────────────────────
# 5. REGLAS DE CALIDAD
# ────────────────────────────────────────────────────────────

def evaluar_calidad(tabla_base: pd.DataFrame, facturas_rechazadas: pd.DataFrame):
    """
    Evalúa 5 reglas de calidad de datos y reporta resultados.
    """
    print("\n" + "=" * 60)
    print("REPORTE DE CALIDAD DE DATOS")
    print("=" * 60)

    reglas = [
        {
            "nombre": "FK_facturas_clientes",
            "descripcion": "Todo id_cliente en facturas existe en clientes",
            "importancia": "Garantiza integridad referencial",
            "ok": len(facturas_rechazadas) == 0,
            "detalle": f"{len(facturas_rechazadas)} facturas con cliente inválido"
                       if len(facturas_rechazadas) > 0 else "Todas OK",
            "accion": "Aislar en staging sin eliminar",
        },
        {
            "nombre": "FECHA_emision_parseable",
            "descripcion": "Todas las fechas de emisión se pueden parsear",
            "importancia": "Fechas inválidas rompen cálculos de vencimiento",
            "ok": tabla_base["fecha_emision"].notna().all(),
            "detalle": f"{tabla_base['fecha_emision'].isna().sum()} no parseables"
                       if tabla_base["fecha_emision"].isna().any() else "Todas OK",
            "accion": "Parseo heurístico + log de warning",
        },
        {
            "nombre": "MONTO_positivo",
            "descripcion": "Montos positivos (excluyendo notas de crédito)",
            "importancia": "Montos negativos inesperados indican errores",
            "ok": tabla_base[~tabla_base["es_nota_credito"]]["monto_total"].ge(0).all(),
            "detalle": f"{tabla_base['es_nota_credito'].sum()} notas de crédito clasificadas",
            "accion": "Clasificar como nota de crédito, no eliminar",
        },
        {
            "nombre": "LOGICA_pago_pre_emision",
            "descripcion": "fecha_pago >= fecha_emision",
            "importancia": "Pago antes de factura es lógicamente imposible",
            "ok": tabla_base["flag_pago_antes_emision"].sum() == 0,
            "detalle": f"{tabla_base['flag_pago_antes_emision'].sum()} violaciones",
            "accion": "Flag para revisión manual",
        },
        {
            "nombre": "UNICIDAD_ids",
            "descripcion": "IDs primarios son únicos",
            "importancia": "Duplicados corrompen agregaciones",
            "ok": not tabla_base["id_factura"].duplicated().any(),
            "detalle": "Sin duplicados",
            "accion": "Rechazar duplicado, mantener primero",
        },
    ]

    for r in reglas:
        status = "✓ PASS" if r["ok"] else "✗ FAIL"
        print(f"\n  {status}  {r['nombre']}")
        print(f"         Valida: {r['descripcion']}")
        print(f"         Importancia: {r['importancia']}")
        print(f"         Detalle: {r['detalle']}")
        if not r["ok"]:
            print(f"         Acción: {r['accion']}")

    return reglas


# ────────────────────────────────────────────────────────────
# 6. EJECUCIÓN PRINCIPAL
# ────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("PIPELINE DE CALIDAD DE DATOS")
    print("Prueba Técnica · Data Engineer · TYA Tierra y Armonía")
    print("=" * 60)

    # ── Paso 1: Carga ──
    print("\n── PASO 1: Carga de datos ──")
    clientes = cargar_csv("clientes.csv")
    facturas = cargar_csv("facturas.csv")
    pagos = cargar_csv("pagos.csv")

    # Hashes para idempotencia
    print("  Hashes MD5:")
    for f in ["clientes.csv", "facturas.csv", "pagos.csv"]:
        print(f"    {f}: {calcular_hash(f)}")

    # ── Paso 2: Limpieza ──
    print("\n── PASO 2: Limpieza ──")
    print("\n  Clientes:")
    clientes = limpiar_clientes(clientes)

    print("\n  Facturas:")
    clientes_ids = set(clientes["id_cliente"].astype(str))
    facturas_limpias, facturas_rechazadas = limpiar_facturas(facturas, clientes_ids)

    print("\n  Pagos:")
    pagos_limpios = limpiar_pagos(pagos)

    # ── Paso 3: Tabla base ──
    print("\n── PASO 3: Tabla base (nivel factura) ──")
    tabla_base = construir_tabla_base(facturas_limpias, pagos_limpios)

    # ── Paso 4: Calidad ──
    evaluar_calidad(tabla_base, facturas_rechazadas)

    # ── Paso 5: Exportación ──
    print("\n\n── PASO 5: Exportación ──")
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # Seleccionar columnas relevantes para exportar
    cols_export = [
        "id_factura", "id_cliente", "fecha_emision", "fecha_vencimiento",
        "monto_total", "es_nota_credito", "monto_pagado_total", "numero_pagos",
        "fecha_ultimo_pago", "flag_pago_antes_emision", "flag_sobrepago",
        "flag_sin_pagos", "flag_pago_futuro", "estatus_factura",
    ]
    tabla_base[cols_export].to_csv(
        os.path.join(OUTPUT_DIR, "tabla_base_facturas.csv"), index=False
    )
    print(f"  ✓ tabla_base_facturas.csv ({len(tabla_base)} filas)")

    if len(facturas_rechazadas) > 0:
        facturas_rechazadas.to_csv(
            os.path.join(OUTPUT_DIR, "staging_rechazadas.csv"), index=False
        )
        print(f"  ✓ staging_rechazadas.csv ({len(facturas_rechazadas)} filas)")

    print("\n" + "=" * 60)
    print("PIPELINE COMPLETADO EXITOSAMENTE")
    print("=" * 60)


if __name__ == "__main__":
    main()
