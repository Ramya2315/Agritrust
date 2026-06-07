<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/89e53898-528c-41a6-b839-d762e52734ca

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

   If port `3000` is already in use on Windows PowerShell:
   `$env:PORT=3001; npm run dev`

   If Vite reports `WebSocket server error: Port 24678 is already in use`:
   `$env:DISABLE_HMR='true'; npm run dev`

## Real-time OTP

Registration, login, and password reset now use server-verified email OTPs.

Local development:

```env
OTP_DELIVERY_PROVIDER=console
OTP_EXPIRY_MINUTES=5
OTP_RESEND_COOLDOWN_SECONDS=60
OTP_MAX_ATTEMPTS=5
```

In console mode, OTPs are generated in real time and printed in the backend terminal log, and the UI also shows the dev OTP to make local testing easy.

Email OTP delivery:

```env
OTP_DELIVERY_PROVIDER=email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your_app_password
EMAIL_FROM="AgriTrustra <your-email@gmail.com>"
```

For Gmail, create an App Password first and use that as `SMTP_PASS` instead of your normal Gmail password.

Restart `npm run dev` after changing OTP settings. When email delivery is configured, `/api/auth/send-otp` sends live OTP emails and the register, login, and reset flows verify them on the backend.

## Real AI training and IoT simulation

The backend can run a trained TensorFlow model instead of simulated AI.

1. Install Python dependencies:

```bash
npm run ml:install
```

2. Place datasets in this structure:

```text
datasets/
  PlantVillage/
    Tomato___healthy/
    Tomato___Late_blight/
    ...
  PlantDoc/
    Tomato leaf bacterial spot/
    Tomato leaf late blight/
    ...
```

Dataset sources:

- PlantVillage: https://www.kaggle.com/datasets/abdallahalidev/plantvillage-dataset
- PlantDoc: https://github.com/pratikkayal/PlantDoc-Dataset

If your dataset already has `train`, `val`, or `test` folders, point the script to the dataset root. The script will use the training folder automatically.

### Tomato Price Prediction

The repo also supports the Kaggle tomato prices dataset by Dheeraj. Put the CSV at `datasets/tomato-prices.csv` and run the regression training flow.

```bash
npm run ml:train:tomato-price
npm run ml:test:tomato-price
```

The tomato price workflow produces:

```text
ml/artifacts/tomato-price-model/model.keras
ml/artifacts/tomato-price-model/metadata.json
ml/artifacts/tomato-price-model/history.csv
```

The app also includes a sample tomato price prediction integration. After training, the backend can load the tomato price model and dataset to return example predictions via `/api/tomato-price/sample`.

3. Train the model:

```bash
npm run ml:train
```

This creates:

```text
ml/artifacts/plant-health-model/model.keras
ml/artifacts/plant-health-model/labels.json
ml/artifacts/plant-health-model/metrics.json
ml/artifacts/plant-health-model/history.csv
```

Test the trained model:

```bash
npm run ml:test
```

If you also install PlantDoc later, use:

```bash
npm run ml:train:all
npm run ml:test:all
```

Test outputs:

```text
ml/artifacts/plant-health-model/test-output/test_metrics.json
ml/artifacts/plant-health-model/test-output/test_predictions.csv
```

4. Make sure `.env.local` points to the trained model:

```env
AI_MODEL_DIR=ml/artifacts/plant-health-model
PYTHON_BIN=python
AI_CONFIDENCE_THRESHOLD=0.65
```

5. Restart the app and test:

```text
GET http://localhost:3000/api/ai/status
GET http://localhost:3000/api/iot/simulate
```

During farm certification, `/api/farms/:id/ai-analyze` runs the trained image model on the submitted plant image and fuses that result with IoT moisture, pH, and temperature readings. Certification only continues to blockchain if the trained AI and IoT checks pass.

Generate a local IoT CSV simulation:

```bash
npm run ml:iot
```

## Real blockchain certificates

The backend issues real EVM transactions when a farm reaches AI certification.

1. Deploy `contracts/AgriTrustraCertificate.sol` to a local EVM chain such as Ganache/Hardhat, or to a testnet.
2. Use the same wallet private key in the backend that deployed the contract, because only the contract owner can issue certificates.
3. Add these values to `.env.local`:

```env
BLOCKCHAIN_RPC_URL=http://127.0.0.1:8545
BLOCKCHAIN_PRIVATE_KEY=your_deployer_private_key
CERTIFICATE_CONTRACT_ADDRESS=0xYourDeployedContractAddress
BLOCKCHAIN_EXPLORER_TX_URL=https://sepolia.etherscan.io/tx
```

4. Restart `npm run dev`.
5. Check blockchain connectivity:

```text
GET http://localhost:3000/api/blockchain/status
```

When AI certifies a farm, MongoDB stores the on-chain `certificateId`, transaction hash, block number, gas used, and verification URL.
