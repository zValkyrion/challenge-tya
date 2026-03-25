#!/usr/bin/env bash
# ============================================================
# Deploy Manual para AWS Amplify
# Challenge TYA Tierra y Armonía
#
# Uso: ./deploy-manual.sh <APP_ID> [BRANCH_NAME]
# Ejemplo: ./deploy-manual.sh d1234567890 main
# ============================================================

set -euo pipefail

APP_ID="${1:?Error: Se requiere el APP_ID como primer argumento}"
BRANCH="${2:-main}"
REGION="${AWS_DEFAULT_REGION:-us-east-1}"

echo "============================================================"
echo "  Challenge TYA Tierra y Armonía - Deploy Manual"
echo "============================================================"
echo ""
echo "  App ID:  $APP_ID"
echo "  Branch:  $BRANCH"
echo "  Region:  $REGION"
echo ""

# ── Paso 1: Build ──
echo "── Paso 1: Build de producción ──"
cd "$(dirname "$0")/../frontend"
npm ci --prefer-offline 2>/dev/null || npm install
npm run build
echo "  ✓ Build completado"

# ── Paso 2: Crear ZIP ──
echo ""
echo "── Paso 2: Creando paquete de deploy ──"
cd dist
ZIP_PATH="$(dirname "$0")/deploy.zip"
zip -r "$ZIP_PATH" . -q
echo "  ✓ deploy.zip creado ($(du -h "$ZIP_PATH" | cut -f1))"
cd ..

# ── Paso 3: Crear branch si no existe ──
echo ""
echo "── Paso 3: Verificando branch ──"
if ! aws amplify get-branch --app-id "$APP_ID" --branch-name "$BRANCH" --region "$REGION" 2>/dev/null; then
    echo "  Creando branch '$BRANCH'..."
    aws amplify create-branch \
        --app-id "$APP_ID" \
        --branch-name "$BRANCH" \
        --stage PRODUCTION \
        --region "$REGION"
    echo "  ✓ Branch creado"
else
    echo "  ✓ Branch ya existe"
fi

# ── Paso 4: Crear deployment ──
echo ""
echo "── Paso 4: Iniciando deployment ──"
DEPLOY_RESULT=$(aws amplify create-deployment \
    --app-id "$APP_ID" \
    --branch-name "$BRANCH" \
    --region "$REGION" \
    --output json)

UPLOAD_URL=$(echo "$DEPLOY_RESULT" | python3 -c "import sys, json; print(json.load(sys.stdin)['zipUploadUrl'])")
JOB_ID=$(echo "$DEPLOY_RESULT" | python3 -c "import sys, json; print(json.load(sys.stdin)['jobId'])")

echo "  Job ID: $JOB_ID"

# ── Paso 5: Subir ZIP ──
echo ""
echo "── Paso 5: Subiendo paquete ──"
curl -s -T "$ZIP_PATH" "$UPLOAD_URL"
echo "  ✓ Paquete subido"

# ── Paso 6: Iniciar deploy ──
echo ""
echo "── Paso 6: Iniciando deploy ──"
aws amplify start-deployment \
    --app-id "$APP_ID" \
    --branch-name "$BRANCH" \
    --job-id "$JOB_ID" \
    --region "$REGION" > /dev/null

echo "  ✓ Deploy iniciado"

# ── Paso 7: Esperar ──
echo ""
echo "── Esperando a que el deploy termine... ──"
while true; do
    STATUS=$(aws amplify get-job \
        --app-id "$APP_ID" \
        --branch-name "$BRANCH" \
        --job-id "$JOB_ID" \
        --region "$REGION" \
        --query "job.summary.status" \
        --output text 2>/dev/null || echo "PENDING")

    case "$STATUS" in
        "SUCCEED")
            echo "  ✓ ¡Deploy completado exitosamente!"
            break
            ;;
        "FAILED"|"CANCELLED")
            echo "  ✗ Deploy falló con estatus: $STATUS"
            exit 1
            ;;
        *)
            echo "  ... $STATUS"
            sleep 5
            ;;
    esac
done

# ── Resultado ──
echo ""
echo "============================================================"
DOMAIN=$(aws amplify get-app \
    --app-id "$APP_ID" \
    --region "$REGION" \
    --query "app.defaultDomain" \
    --output text)
echo "  ✓ App desplegada: https://${BRANCH}.${DOMAIN}"
echo "  ✓ Consola: https://${REGION}.console.aws.amazon.com/amplify/home#/d/${APP_ID}"
echo "============================================================"

# Limpiar
rm -f "$ZIP_PATH"
