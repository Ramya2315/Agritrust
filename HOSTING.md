# AgriTrustra Hosting Guide

This app is a React frontend served by an Express backend. The backend also connects to MongoDB, runs Python AI inference, sends OTP email, and optionally issues blockchain certificates.

## 1. Prepare Production Environment

Use a Node.js host that supports:

- Node.js 20 or newer
- Python 3.10 or newer
- MongoDB connection string, preferably MongoDB Atlas
- Persistent project files for `ml/artifacts`

Recommended beginner-friendly hosts: Render, Railway, or a VPS. For the least friction with the Python model files, Render or a VPS is easier than static-only hosting.

## 2. Required Environment Variables

Set these in your hosting provider dashboard:

```env
NODE_ENV=production
PORT=3000
APP_URL=https://your-domain.com
JWT_SECRET=replace-with-a-long-random-secret
MONGODB_URI=mongodb+srv://user:password@cluster/dbname
DISABLE_MONGODB=false
SEED_DEMO_DATA=false

AI_MODEL_DIR=ml/artifacts/plant-health-model
TOMATO_PRICE_MODEL_DIR=ml/artifacts/tomato-price-model
PYTHON_BIN=python
AI_CONFIDENCE_THRESHOLD=0.65

OTP_DELIVERY_PROVIDER=email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-gmail-app-password
EMAIL_FROM=AgriTrustra <your-email@gmail.com>
```

Optional blockchain variables:

```env
BLOCKCHAIN_RPC_URL=https://your-rpc-url
BLOCKCHAIN_PRIVATE_KEY=your-wallet-private-key
CERTIFICATE_CONTRACT_ADDRESS=0x...
BLOCKCHAIN_EXPLORER_TX_URL=https://sepolia.etherscan.io/tx
```

## 3. Include Model Artifacts

The trained AI folders are ignored by Git, so upload or restore these on the server:

```text
ml/artifacts/plant-health-model/model.keras
ml/artifacts/plant-health-model/labels.json
ml/artifacts/plant-health-model/metrics.json
ml/artifacts/plant-health-model/history.csv
ml/artifacts/tomato-price-model/model.joblib
ml/artifacts/tomato-price-model/metadata.json
ml/artifacts/tomato-price-model/test_predictions.csv
```

If you need to regenerate them:

```bash
npm run ml:install
npm run ml:train
npm run ml:train:tomato-price
```

## 4. Build Locally

```bash
npm install
npm run lint
npm run build:prod
```

The production files are created in `dist/`.

## 5. Render Deployment

Create a new Render Web Service from your repository.

Use:

```bash
npm install && npm run ml:install && npm run build:prod
```

Start command:

```bash
npm start
```

Add all environment variables from section 2. After deploy, open:

```text
https://your-domain.com/api/health
```

Expected response should include:

```json
{
  "ok": true,
  "database": "connected",
  "aiModel": "ready"
}
```

## 6. Railway Deployment

Create a Railway project and connect the repository.

Build command:

```bash
npm install && npm run ml:install && npm run build:prod
```

Start command:

```bash
npm start
```

Add MongoDB Atlas and SMTP variables in Railway Variables.

## 7. VPS Deployment

On Ubuntu:

```bash
sudo apt update
sudo apt install -y nodejs npm python3 python3-pip
git clone YOUR_REPO_URL
cd agritrustra
npm install
npm run ml:install
npm run build:prod
npm start
```

For background running, use PM2:

```bash
npm install -g pm2
pm2 start dist/server.js --name agritrustra
pm2 save
```

Put Nginx in front of it and proxy your domain to the app port.

## 8. Final Production Checklist

- `JWT_SECRET` is unique and not the default.
- `.env.local` is not committed.
- `APP_URL` is your real HTTPS domain.
- MongoDB Atlas network access allows your host.
- SMTP uses an app password, not your normal email password.
- `SEED_DEMO_DATA=false`.
- `/api/health` reports `database: connected`.
- `/api/ai/status` reports trained artifacts available.
