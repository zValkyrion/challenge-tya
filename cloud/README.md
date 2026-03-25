# Cloud — Despliegue en AWS Amplify

> Configuración de infraestructura para desplegar el dashboard interactivo del Challenge TYA en AWS Amplify.

---

## 📋 Prerrequisitos

- **AWS CLI** configurado con credenciales válidas (`aws configure`)
- **Node.js 18+** instalado localmente
- Cuenta AWS con permisos para CloudFormation y Amplify

---

## 🏗️ Contenido de esta carpeta

| Archivo | Descripción |
|---------|-------------|
| `amplify-cloudformation.yaml` | Template CloudFormation base para Amplify |
| `amplify-cloudformation-fixed.yaml` | Template corregido con condiciones para deploy Git/manual |
| `deploy-manual.sh` | Script bash para deploy automatizado sin Git |
| `README.md` | Esta guía |

Además, en la raíz del proyecto existe `amplify.yml` que define el build spec con las fases `preBuild` → `build` → `postBuild`.

---

## 🚀 Opciones de Despliegue

### Opción A: Deploy con GitHub (CI/CD automático)

**1. Subir a GitHub:**
```bash
git init && git add . && git commit -m "Challenge TYA"
git remote add origin https://github.com/TU-USUARIO/challenge-tya.git
git push -u origin main
```

**2. Generar GitHub Personal Access Token:**
- Ir a [GitHub → Settings → Tokens](https://github.com/settings/tokens)
- Generar con permisos `repo` (acceso completo)

**3. Desplegar con CloudFormation:**
```bash
aws cloudformation create-stack \
  --stack-name challenge-tya-tierra-armonia \
  --template-body file://cloud/amplify-cloudformation-fixed.yaml \
  --parameters \
    ParameterKey=AppName,ParameterValue=challenge-tya-tierra-armonia \
    ParameterKey=Repository,ParameterValue=https://github.com/TU-USUARIO/challenge-tya \
    ParameterKey=Branch,ParameterValue=main \
    ParameterKey=OAuthToken,ParameterValue=TU-TOKEN-AQUI \
    ParameterKey=EnvironmentType,ParameterValue=PRODUCTION \
  --capabilities CAPABILITY_IAM \
  --region us-east-1
```

**4. Verificar:**
```bash
aws cloudformation describe-stacks \
  --stack-name challenge-tya-tierra-armonia \
  --query "Stacks[0].Outputs" --output table
```

---

### Opción B: Deploy manual (sin GitHub)

**1. Crear app en Amplify:**
```bash
aws cloudformation create-stack \
  --stack-name challenge-tya-tierra-armonia \
  --template-body file://cloud/amplify-cloudformation-fixed.yaml \
  --parameters \
    ParameterKey=AppName,ParameterValue=challenge-tya-tierra-armonia \
    ParameterKey=EnvironmentType,ParameterValue=PRODUCTION \
  --capabilities CAPABILITY_IAM \
  --region us-east-1
```

**2. Obtener App ID y ejecutar script:**
```bash
APP_ID=$(aws cloudformation describe-stacks \
  --stack-name challenge-tya-tierra-armonia \
  --query "Stacks[0].Outputs[?OutputKey=='AppId'].OutputValue" \
  --output text)

cd cloud
./deploy-manual.sh $APP_ID
```

El script automatiza: build → zip → upload → deploy → polling de estado.

---

### Opción C: Deploy desde la consola web

1. Ir a [AWS Amplify Console](https://console.aws.amazon.com/amplify/)
2. Click **"New app"** → **"Host web app"**
3. Seleccionar **"Deploy without Git provider"**
4. Generar el paquete:
   ```bash
   cd frontend && npm ci && npm run build && cd dist && zip -r ../../deploy.zip . && cd ../..
   ```
5. Arrastrar `deploy.zip` y nombrar la app **challenge-tya-tierra-armonia**
6. Click **"Save and deploy"**

---

## ⚙️ Variables de entorno

| Variable | Descripción | Default |
|----------|-------------|---------|
| `VITE_APP_NAME` | Nombre de la app | Challenge TYA Tierra y Armonía |
| `VITE_APP_VERSION` | Versión | 2.0.0 |
| `VITE_ENVIRONMENT` | Entorno | PRODUCTION |
| `VITE_OPENAI_API_KEY` | API Key de OpenAI (opcional) | — |

---

## 🔒 Seguridad

El template CloudFormation configura automáticamente headers de seguridad:
- `Strict-Transport-Security` (HSTS)
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`

---

## 🧹 Limpiar recursos

```bash
aws cloudformation delete-stack \
  --stack-name challenge-tya-tierra-armonia \
  --region us-east-1
```
