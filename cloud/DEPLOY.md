# Despliegue en AWS Amplify — Challenge TYA Tierra y Armonía

## Prerrequisitos

1. **AWS CLI** configurado con credenciales válidas
2. **Node.js 18+** instalado localmente
3. Una cuenta de AWS con permisos para CloudFormation y Amplify

---

## Opción A: Deploy con GitHub (CI/CD automático)

### 1. Subir proyecto a GitHub

```bash
cd challenge
git init
git add .
git commit -m "Challenge TYA - Data Engineering Pipeline"
git remote add origin https://github.com/TU-USUARIO/challenge-tya-tierra-armonia.git
git push -u origin main
```

### 2. Generar un GitHub Personal Access Token

1. Ir a [GitHub → Settings → Developer settings → Personal access tokens](https://github.com/settings/tokens)
2. Generar token con permisos: `repo` (acceso completo al repositorio)
3. Copiar el token

### 3. Desplegar con CloudFormation

```bash
aws cloudformation create-stack \
  --stack-name challenge-tya-tierra-armonia \
  --template-body file://cloud/amplify-cloudformation.yaml \
  --parameters \
    ParameterKey=AppName,ParameterValue=challenge-tya-tierra-armonia \
    ParameterKey=Repository,ParameterValue=https://github.com/TU-USUARIO/challenge-tya-tierra-armonia \
    ParameterKey=Branch,ParameterValue=main \
    ParameterKey=OAuthToken,ParameterValue=TU-TOKEN-AQUI \
    ParameterKey=EnvironmentType,ParameterValue=PRODUCTION \
  --capabilities CAPABILITY_IAM \
  --region us-east-1
```

### 4. Verificar despliegue

```bash
# Ver estado del stack
aws cloudformation describe-stacks \
  --stack-name challenge-tya-tierra-armonia \
  --query "Stacks[0].Outputs" \
  --output table

# La URL estará en el output "DefaultDomain"
```

---

## Opción B: Deploy manual (sin GitHub)

### 1. Crear la app en Amplify (sin repository)

```bash
aws cloudformation create-stack \
  --stack-name challenge-tya-tierra-armonia \
  --template-body file://cloud/amplify-cloudformation.yaml \
  --parameters \
    ParameterKey=AppName,ParameterValue=challenge-tya-tierra-armonia \
    ParameterKey=EnvironmentType,ParameterValue=PRODUCTION \
  --capabilities CAPABILITY_IAM \
  --region us-east-1
```

### 2. Obtener el App ID

```bash
aws cloudformation describe-stacks \
  --stack-name challenge-tya-tierra-armonia \
  --query "Stacks[0].Outputs[?OutputKey=='AppId'].OutputValue" \
  --output text
```

### 3. Build y deploy manual

```bash
# Build
cd frontend
npm ci
npm run build

# Crear branch (si no existe)
aws amplify create-branch \
  --app-id TU-APP-ID \
  --branch-name main

# Deploy
aws amplify create-deployment \
  --app-id TU-APP-ID \
  --branch-name main

# Subir archivos (usar el zipUploadUrl del comando anterior)
cd dist
zip -r ../../deploy.zip .
curl -T ../../deploy.zip "UPLOAD-URL-DEL-PASO-ANTERIOR"

# Iniciar deploy
aws amplify start-deployment \
  --app-id TU-APP-ID \
  --branch-name main \
  --job-id JOB-ID-DEL-PASO-ANTERIOR
```

### 4. O usar el script automatizado

```bash
# Ejecutar el script de deploy manual
cd cloud
./deploy-manual.sh TU-APP-ID
```

---

## Opción C: Deploy desde la consola web

1. Ir a [AWS Amplify Console](https://console.aws.amazon.com/amplify/)
2. Click "New app" → "Host web app"
3. Seleccionar "Deploy without Git provider"
4. Arrastrar el archivo `deploy.zip` generado con:
   ```bash
   cd frontend && npm run build && cd dist && zip -r ../../deploy.zip . && cd ../..
   ```
5. Nombrar la app: **challenge-tya-tierra-armonia**
6. Click "Save and deploy"

---

## Estructura del proyecto desplegado

```
challenge/
├── amplify.yml                           ← Build spec para Amplify
├── cloud/
│   ├── amplify-cloudformation.yaml       ← CloudFormation template
│   ├── deploy-manual.sh                  ← Script de deploy manual
│   └── DEPLOY.md                         ← Este archivo
├── frontend/
│   ├── src/
│   │   ├── App.jsx                       ← Componente principal
│   │   ├── components.jsx                ← UI components
│   │   ├── FileUploader.jsx              ← Uploader con validación
│   │   ├── DataCorrectionPanel.jsx       ← Panel de corrección
│   │   ├── pipeline.js                   ← Lógica del pipeline
│   │   ├── utils.js                      ← Utilidades y schemas
│   │   └── index.css                     ← Estilos globales
│   ├── package.json
│   └── vite.config.js
└── entrega-sencilla/                     ← Versión tradicional
    ├── README.md
    ├── modelo.sql
    ├── python/procesamiento.py
    └── sql/analisis.sql
```

---

## Variables de entorno disponibles

| Variable | Descripción | Valor por defecto |
|----------|-------------|-------------------|
| `VITE_APP_NAME` | Nombre de la app | Challenge TYA Tierra y Armonía |
| `VITE_APP_VERSION` | Versión | 2.0.0 |
| `VITE_ENVIRONMENT` | Entorno | PRODUCTION |

---

## Limpiar recursos

```bash
aws cloudformation delete-stack \
  --stack-name challenge-tya-tierra-armonia \
  --region us-east-1
```
