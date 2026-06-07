import express from "express";
import { createServer as createViteServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import net from "net";
import path from "path";
import { fileURLToPath } from "url";
import os from "os";
import { randomInt } from "crypto";
import { execFile } from "child_process";
import { promises as fs } from "fs";
import { promisify } from "util";
import mongoose from "mongoose";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import { Contract, Wallet, JsonRpcProvider, keccak256, toUtf8Bytes, type Network, type TransactionReceipt } from "ethers";

dotenv.config({ path: ".env.local" });
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
const execFileAsync = promisify(execFile);

const REQUESTED_PORT = Number(process.env.PORT || 3000);
const ALLOW_PORT_FALLBACK = process.env.ALLOW_PORT_FALLBACK === "true";
let activePort = REQUESTED_PORT;
const JWT_SECRET = process.env.JWT_SECRET || "agritrustra-secret-key";
const isProduction = process.env.NODE_ENV === "production";
if (isProduction && (!process.env.JWT_SECRET || process.env.JWT_SECRET === "agritrustra-secret-key")) {
  throw new Error("JWT_SECRET must be set to a strong unique value in production.");
}
const AI_MODEL_DIR = process.env.AI_MODEL_DIR || path.join(process.cwd(), "ml", "artifacts", "plant-health-model");
const TOMATO_PRICE_MODEL_DIR = process.env.TOMATO_PRICE_MODEL_DIR || path.join(process.cwd(), "ml", "artifacts", "tomato-price-model");
const AGMARKNET_RESOURCE_ID = "9ef84268-d588-465a-a308-a864a43d0070";
const AGMARKNET_API_KEY =
  process.env.AGMARKNET_API_KEY ||
  process.env.DATA_GOV_API_KEY ||
  "579b464db66ec23bdd000001d9143fc81ac74bce7ad727abc2705a8a";
const PYTHON_BIN = process.env.PYTHON_BIN || "python";
const AI_CONFIDENCE_THRESHOLD = Number(process.env.AI_CONFIDENCE_THRESHOLD || 0.65);
const AI_TRAINED_INFERENCE_TIMEOUT_MS = Number(process.env.AI_TRAINED_INFERENCE_TIMEOUT_MS || 30000);
const OTP_EXPIRY_MINUTES = Number(process.env.OTP_EXPIRY_MINUTES || 5);
const OTP_RESEND_COOLDOWN_SECONDS = Number(process.env.OTP_RESEND_COOLDOWN_SECONDS || 60);
const OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS || 5);
const EMAIL_OTP_PROVIDER = (process.env.OTP_DELIVERY_PROVIDER || "console").toLowerCase();
const SMTP_HOST = process.env.SMTP_HOST || "";
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = process.env.SMTP_SECURE === "true";
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const EMAIL_FROM = process.env.EMAIL_FROM || SMTP_USER || "";

const getAppUrl = () => {
  const configuredUrl = process.env.APP_URL;
  if (!configuredUrl) return `http://localhost:${activePort}`;

  if (process.env.APP_URL_AUTO === "true") {
    try {
      const url = new URL(configuredUrl);
      url.port = String(activePort);
      return url.toString().replace(/\/$/, "");
    } catch {
      return configuredUrl;
    }
  }

  return configuredUrl;
};
const isLocalhostUrl = (value = "") => /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(value);
const VITE_WATCH_IGNORES = [
  "**/.git/**",
  "**/.kaggle/**",
  "**/.mongodb/**",
  "**/.venv/**",
  "**/assets/**",
  "**/contracts/**",
  "**/datasets/**",
  "**/dist/**",
  "**/ml/artifacts/**",
  "**/node_modules/**",
  "**/*.log",
  "**/*.zip"
];
type OtpPurpose = "register" | "login" | "reset-password";
type OtpChannel = "email" | "sms";
const OTP_PURPOSES: OtpPurpose[] = ["register", "login", "reset-password"];

const normalizePhone = (phone: string) => phone.replace(/\D/g, "");
const normalizeEmail = (email: string) => email.trim().toLowerCase();
const isValidOtpPurpose = (value: string): value is OtpPurpose =>
  OTP_PURPOSES.includes(value as OtpPurpose);
const generateOtpCode = () => randomInt(0, 1000000).toString().padStart(6, "0");
const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));

const getOtpAction = (purpose: OtpPurpose) => {
  if (purpose === "register") return "complete your AgriTrustra registration";
  if (purpose === "login") return "log in to AgriTrustra";
  return "reset your AgriTrustra password";
};

const buildOtpMessage = (otp: string, purpose: OtpPurpose) =>
  `${otp} is your AgriTrustra OTP to ${getOtpAction(purpose)}. It expires in ${OTP_EXPIRY_MINUTES} minutes.`;

let otpMailer: nodemailer.Transporter | null = null;

const getOtpMailer = () => {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !EMAIL_FROM) {
    throw new Error("Email OTP delivery is not fully configured. Add SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and EMAIL_FROM.");
  }

  if (!otpMailer) {
    otpMailer = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS
      }
    });
  }

  return otpMailer;
};

const getOtpDeliveryErrorMessage = (error: any) => {
  const providerMessage = String(error?.message || "");

  return providerMessage || "Failed to send OTP";
};

const buildOtpEmail = (otp: string, purpose: OtpPurpose) => {
  const subject = purpose === "register"
    ? "Your AgriTrustra registration OTP"
    : purpose === "login"
      ? "Your AgriTrustra login OTP"
      : "Your AgriTrustra password reset OTP";
  const message = buildOtpMessage(otp, purpose);

  return {
    subject,
    text: message,
    html: `<p>${message}</p>`
  };
};

const isEmailDeliveryConfigured = () => Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS && EMAIL_FROM);

const sendEmailMessage = async ({
  to,
  subject,
  text,
  html
}: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}) => {
  if (!isEmailDeliveryConfigured()) {
    console.log(`[AgriTrustra][Email] To: ${to}`);
    console.log(`[AgriTrustra][Email] Subject: ${subject}`);
    console.log(text);
    return { delivery: "console" as const };
  }

  const transporter = getOtpMailer();
  await transporter.sendMail({
    from: EMAIL_FROM,
    to,
    subject,
    text,
    html: html || `<pre>${text}</pre>`
  });
  return { delivery: "email" as const };
};

const sendOtpViaEmail = async (email: string, otp: string, purpose: OtpPurpose) => {
  const transporter = getOtpMailer();
  const { subject, text, html } = buildOtpEmail(otp, purpose);

  await transporter.sendMail({
    from: EMAIL_FROM,
    to: email,
    subject,
    text,
    html
  });
};

const deliverEmailOtp = async (email: string, otp: string, purpose: OtpPurpose) => {
  if (EMAIL_OTP_PROVIDER === "email") {
    await sendOtpViaEmail(email, otp, purpose);
    return { delivery: "email" as const, devOtp: "" };
  }

  console.log(`[AgriTrustra][OTP][EMAIL] ${purpose} OTP for ${email}: ${otp}`);
  return {
    delivery: "console" as const,
    devOtp: isProduction ? "" : otp
  };
};

const isPortAvailable = async (port: number) =>
  new Promise<boolean>(resolve => {
    const tester = net.createServer();

    tester.once("error", () => resolve(false));
    tester.once("listening", () => {
      tester.close(() => resolve(true));
    });

    tester.listen(port, "0.0.0.0");
  });

const findAvailablePort = async (startPort: number, maxAttempts = 20) => {
  for (let port = startPort; port < startPort + maxAttempts; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }

  throw new Error(`No open port found between ${startPort} and ${startPort + maxAttempts - 1}.`);
};

const CERTIFICATE_CONTRACT_ABI = [
  "function issueCertificate(string farmId,string farmerId,string cropType,bytes32 metadataHash) returns (bytes32)",
  "event CertificateIssued(bytes32 indexed certificateId,string farmId,string farmerId,string cropType,bytes32 metadataHash,address indexed issuer,uint256 issuedAt)"
];

const getBlockchainConfig = () => ({
  rpcUrl: process.env.BLOCKCHAIN_RPC_URL,
  privateKey: process.env.BLOCKCHAIN_PRIVATE_KEY,
  contractAddress: process.env.CERTIFICATE_CONTRACT_ADDRESS,
  explorerTxUrl: process.env.BLOCKCHAIN_EXPLORER_TX_URL
});

const isBlockchainConfigured = () => {
  const config = getBlockchainConfig();
  return Boolean(config.rpcUrl && config.privateKey && config.contractAddress);
};

const stableStringify = (value: any): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;

  return `{${Object.keys(value)
    .sort()
    .map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(",")}}`;
};

const buildCertificateMetadata = (farm: any) => ({
  farmId: farm._id?.toString(),
  farmerId: farm.farmerId?.toString(),
  cropType: farm.cropType,
  soilType: farm.soilType,
  location: farm.location,
  geoTaggedImages: farm.geoTaggedImages,
  iotData: farm.iotData,
  auditor1VerifiedAt: farm.auditor1Data?.verifiedAt,
  auditor1GeoTaggedPhotos: farm.auditor1Data?.geoTaggedPhotos,
  auditor2VerifiedAt: farm.auditor2Data?.verifiedAt,
  auditor2GeoTaggedPhotos: farm.auditor2Data?.geoTaggedPhotos,
  aiReport: farm.aiReport
});

const buildExplorerUrl = (txHash: string) => {
  const { explorerTxUrl } = getBlockchainConfig();
  if (!explorerTxUrl) return "";
  if (explorerTxUrl.includes("{txHash}")) {
    return explorerTxUrl.replace("{txHash}", txHash);
  }
  return `${explorerTxUrl.replace(/\/$/, "")}/${txHash}`;
};

const buildCertificateVerificationUrl = (certificateId: string) =>
  `${getAppUrl().replace(/\/$/, "")}/certificate/${encodeURIComponent(certificateId)}`;

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const issueLocalCertificate = async (farm: any) => {
  const metadata = buildCertificateMetadata(farm);
  const metadataHash = keccak256(toUtf8Bytes(stableStringify(metadata)));

  return {
    certificateId: metadataHash,
    metadataHash,
    txHash: "",
    blockNumber: 0,
    contractAddress: "local-demo",
    chainId: 0,
    receiptStatus: 1,
    gasUsed: "0",
    explorerUrl: "",
    issuedAt: new Date()
  };
};

const getCertificateContract = async () => {
  const { rpcUrl, privateKey, contractAddress } = getBlockchainConfig();
  if (!rpcUrl || !privateKey || !contractAddress) {
    throw new Error("Blockchain is not configured. Set BLOCKCHAIN_RPC_URL, BLOCKCHAIN_PRIVATE_KEY, and CERTIFICATE_CONTRACT_ADDRESS in .env.local.");
  }

  const provider = new JsonRpcProvider(rpcUrl);
  const wallet = new Wallet(privateKey, provider);
  return {
    provider,
    contract: new Contract(contractAddress, CERTIFICATE_CONTRACT_ABI, wallet)
  };
};

const issueBlockchainCertificate = async (farm: any) => {
  const { provider, contract } = await getCertificateContract();
  const metadata = buildCertificateMetadata(farm);
  const metadataHash = keccak256(toUtf8Bytes(stableStringify(metadata)));
  const tx = await contract.issueCertificate(
    farm._id.toString(),
    farm.farmerId.toString(),
    farm.cropType || "organic-crop",
    metadataHash
  );
  const receipt = await tx.wait(1);

  if (!receipt || receipt.status !== 1) {
    throw new Error("Blockchain transaction failed or was not confirmed.");
  }

  let certificateId = metadataHash;
  for (const log of receipt.logs) {
    try {
      const parsed = contract.interface.parseLog({ topics: [...log.topics], data: log.data });
      if (parsed?.name === "CertificateIssued") {
        certificateId = parsed.args.certificateId;
        break;
      }
    } catch {
      // Ignore logs emitted by other contracts in the transaction.
    }
  }

  const network = await provider.getNetwork();
  return {
    certificateId,
    metadataHash,
    txHash: tx.hash,
    blockNumber: Number(receipt.blockNumber),
    contractAddress: contract.address,
    chainId: Number((network as Network).chainId ?? 0),
    receiptStatus: Number(receipt.status),
    gasUsed: receipt.gasUsed.toString(),
    explorerUrl: buildExplorerUrl(tx.hash),
    issuedAt: new Date()
  };
};

const fileExists = async (filePath: string) => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

const isAiModelReady = async () =>
  (await fileExists(path.join(AI_MODEL_DIR, "model.keras"))) &&
  (await fileExists(path.join(AI_MODEL_DIR, "labels.json")));

const AI_BASELINE_DIR = path.join(process.cwd(), "ml", "artifacts", "plantvillage-baseline");

const readJsonIfExists = async (filePath: string) => {
  if (!(await fileExists(filePath))) {
    return null;
  }

  return JSON.parse(await fs.readFile(filePath, "utf-8"));
};

const parseCsvValue = (value: string) => {
  const trimmed = value.trim();
  if (trimmed === "") return trimmed;
  const numeric = Number(trimmed);
  return Number.isNaN(numeric) ? trimmed : numeric;
};

const parseSimpleCsv = (content: string) => {
  const lines = content
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return [];
  }

  const headers = lines[0].split(",").map(header => header.trim());
  return lines.slice(1).map(line => {
    const values = line.split(",").map(value => value.trim());
    return headers.reduce((record: Record<string, any>, header, index) => {
      record[header] = parseCsvValue(values[index] || "");
      return record;
    }, {});
  });
};

const readCsvIfExists = async (filePath: string) => {
  if (!(await fileExists(filePath))) {
    return [];
  }

  return parseSimpleCsv(await fs.readFile(filePath, "utf-8"));
};

const summarizeAiMetrics = (metrics: any) => {
  if (!metrics || typeof metrics !== "object") {
    return null;
  }

  return {
    accuracy: Number(metrics.accuracy ?? metrics.validation_accuracy ?? metrics.val_accuracy ?? metrics.best_val_accuracy ?? 0),
    macroF1: Number(metrics.macro_f1 ?? 0),
    loss: Number(metrics.loss ?? metrics.val_loss ?? 0),
    totalTestImages: Number(metrics.total_test_images ?? 0),
    imageSize: Number(metrics.image_size ?? 0),
    classCount: Array.isArray(metrics.labels)
      ? metrics.labels.length
      : Object.keys(metrics.per_class || {}).length
  };
};

const isPlantHealthyFromAi = (aiReport: any) =>
  aiReport?.isHealthy === true ||
  String(aiReport?.plantHealth || "").toLowerCase() === "healthy" ||
  String(aiReport?.diseaseName || "").toLowerCase() === "none detected";

const hasAuditorOrganicApproval = (farm: any) =>
  farm?.auditor1Data?.isOrganicCertified === true &&
  farm?.auditor2Data?.isOrganicCertified === true;

const getModelArtifacts = async () => {
  const expectedArtifacts = ["model.keras", "labels.json", "metrics.json", "history.csv"];
  const availableArtifacts = [];

  for (const artifact of expectedArtifacts) {
    if (await fileExists(path.join(AI_MODEL_DIR, artifact))) {
      availableArtifacts.push(artifact);
    }
  }

  const labels = await readJsonIfExists(path.join(AI_MODEL_DIR, "labels.json"));
  const metrics = await readJsonIfExists(path.join(AI_MODEL_DIR, "metrics.json"));
  const testMetrics = await readJsonIfExists(path.join(AI_MODEL_DIR, "test-output", "test_metrics.json"));
  const history = await readCsvIfExists(path.join(AI_MODEL_DIR, "history.csv"));

  return {
    expectedArtifacts,
    availableArtifacts,
    labels: Array.isArray(labels) ? labels : [],
    metrics: testMetrics || metrics,
    history
  };
};

const getTomatoPriceArtifacts = async () => {
  const expectedArtifacts = ["model.joblib", "metadata.json", "test_predictions.csv"];
  const availableArtifacts = [];

  for (const artifact of expectedArtifacts) {
    if (await fileExists(path.join(TOMATO_PRICE_MODEL_DIR, artifact))) {
      availableArtifacts.push(artifact);
    }
  }

  const metadata = await readJsonIfExists(path.join(TOMATO_PRICE_MODEL_DIR, "metadata.json"));

  return {
    configured: availableArtifacts.includes("model.joblib") && availableArtifacts.includes("metadata.json"),
    modelDir: TOMATO_PRICE_MODEL_DIR,
    expectedArtifacts,
    availableArtifacts,
    metadata
  };
};

const normalizeRecordKey = (key: string) => key.trim().replace(/\s+/g, "_").toLowerCase();

const getNumericRecordValue = (record: Record<string, any>, candidates: string[]) => {
  for (const candidate of candidates) {
    const value = record[candidate] ?? record[normalizeRecordKey(candidate)];
    const numeric = Number(value);
    if (!Number.isNaN(numeric) && numeric > 0) {
      return numeric;
    }
  }
  return null;
};

const marketCatalog = [
  { category: "vegetables", product: "tomato", commodity: "Tomato", aliases: ["tomato", "vegetables", "vegetable"] },
  { category: "vegetables", product: "onion", commodity: "Onion", aliases: ["onion"] },
  { category: "vegetables", product: "potato", commodity: "Potato", aliases: ["potato"] },
  { category: "vegetables", product: "brinjal", commodity: "Brinjal", aliases: ["brinjal", "eggplant"] },
  { category: "fruits", product: "banana", commodity: "Banana", aliases: ["banana", "bananas", "plantain"] },
  { category: "fruits", product: "mango", commodity: "Mango", aliases: ["mango", "mangoes", "aam"] },
  { category: "fruits", product: "apple", commodity: "Apple", aliases: ["apple", "apples"] },
  { category: "fruits", product: "water apple", commodity: "Water Apple", aliases: ["water apple", "water apples", "rose apple", "java apple", "wax apple"], useLive: false },
  { category: "grains", product: "wheat", commodity: "Wheat", aliases: ["wheat", "grains", "grain"] },
  { category: "grains", product: "rice", commodity: "Paddy(Dhan)(Common)", aliases: ["rice", "paddy"] },
  { category: "grains", product: "maize", commodity: "Maize", aliases: ["maize", "corn"] },
  { category: "pulses", product: "tur dal", commodity: "Arhar (Tur/Red Gram)(Whole)", aliases: ["tur", "arhar", "pulses", "pulse"] }
];

const defaultMarketProductByCategory: Record<string, string> = {
  fruits: "water apple",
  fruit: "water apple",
  vegetables: "tomato",
  vegetable: "tomato",
  grains: "rice",
  grain: "rice",
  pulses: "tur dal",
  pulse: "tur dal"
};

const fallbackMarketRows = [
  { category: "vegetables", product: "tomato", commodity: "Tomato", state: "Karnataka", district: "Bengaluru", market: "BANGALURU", modalPricePerKg: 17.5, minPricePerKg: 15, maxPricePerKg: 20, date: "2023-06-13" },
  { category: "vegetables", product: "onion", commodity: "Onion", state: "Maharashtra", district: "Nashik", market: "Nashik", modalPricePerKg: 18.5, minPricePerKg: 15, maxPricePerKg: 22.5 },
  { category: "vegetables", product: "potato", commodity: "Potato", state: "Uttar Pradesh", district: "Agra", market: "Agra", modalPricePerKg: 14.2, minPricePerKg: 11, maxPricePerKg: 17.6 },
  { category: "fruits", product: "banana", commodity: "Banana", state: "Maharashtra", district: "Jalgaon", market: "Jalgaon", modalPricePerKg: 17.2, minPricePerKg: 14, maxPricePerKg: 21.5 },
  { category: "fruits", product: "mango", commodity: "Mango", state: "Telangana", district: "Hyderabad", market: "Hyderabad", modalPricePerKg: 52, minPricePerKg: 41, maxPricePerKg: 68 },
  { category: "fruits", product: "apple", commodity: "Apple", state: "Himachal Pradesh", district: "Shimla", market: "Shimla", modalPricePerKg: 94, minPricePerKg: 78, maxPricePerKg: 112 },
  { category: "fruits", product: "water apple", commodity: "Water Apple", state: "Karnataka", district: "Bengaluru", market: "BANGALURU", modalPricePerKg: 86, minPricePerKg: 72, maxPricePerKg: 104 },
  { category: "grains", product: "wheat", commodity: "Wheat", state: "Madhya Pradesh", district: "Indore", market: "Indore", modalPricePerKg: 24.5, minPricePerKg: 23.2, maxPricePerKg: 26.2 },
  { category: "grains", product: "rice", commodity: "Paddy(Dhan)(Common)", state: "Chhattisgarh", district: "Raipur", market: "Raipur", modalPricePerKg: 31.8, minPricePerKg: 29.2, maxPricePerKg: 35.2 }
];

let marketPriceCache: { expiresAt: number; data: any } | null = null;

const rupeesPerKg = (quintalPrice: any) => {
  const numeric = Number(String(quintalPrice ?? "").replace(/,/g, ""));
  return Number.isNaN(numeric) || numeric <= 0 ? null : Number((numeric / 100).toFixed(2));
};

const getMarketCatalogItem = (cropType: string) => {
  const normalizedCrop = String(cropType || "").trim().toLowerCase();
  if (!normalizedCrop) return null;

  const exactProduct = marketCatalog.find((item: any) =>
    item.product === normalizedCrop ||
    item.aliases?.some((alias: string) => alias === normalizedCrop)
  );
  if (exactProduct) return exactProduct;

  const categoryDefault = defaultMarketProductByCategory[normalizedCrop];
  if (categoryDefault) {
    return marketCatalog.find((item: any) => item.product === categoryDefault) || null;
  }

  return marketCatalog.find((item: any) =>
    item.aliases?.some((alias: string) => normalizedCrop.includes(alias) || alias.includes(normalizedCrop))
  ) || null;
};

const normalizeLiveMandiRecord = (record: Record<string, any>, catalogItem: any) => {
  const modalPricePerKg = rupeesPerKg(record.modal_price);
  if (!modalPricePerKg) return null;

  return {
    category: catalogItem.category,
    product: catalogItem.product,
    commodity: record.commodity || catalogItem.commodity,
    variety: record.variety || "Standard",
    state: record.state || "India",
    district: record.district || "Regional",
    market: record.market || "Mandi",
    modalPricePerKg,
    minPricePerKg: rupeesPerKg(record.min_price),
    maxPricePerKg: rupeesPerKg(record.max_price),
    unit: "per kg",
    date: record.arrival_date || record.date || "",
    currency: "INR",
    dataMode: "live",
    updatedAt: new Date().toISOString()
  };
};

const fetchLiveMandiPricesForCommodity = async (catalogItem: any) => {
  if (catalogItem.useLive === false) {
    return [];
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  const params = new URLSearchParams({
    "api-key": AGMARKNET_API_KEY,
    format: "json",
    offset: "0",
    limit: "50",
    "filters[commodity]": catalogItem.commodity
  });

  try {
    const response = await fetch(
      `https://api.data.gov.in/resource/${AGMARKNET_RESOURCE_ID}?${params.toString()}`,
      { signal: controller.signal }
    );

    if (!response.ok) {
      throw new Error(`Agmarknet returned ${response.status}`);
    }

    const payload: any = await response.json();
    return (payload.records || [])
      .map((record: Record<string, any>) => normalizeLiveMandiRecord(record, catalogItem))
      .filter(Boolean);
  } finally {
    clearTimeout(timeout);
  }
};

const getFallbackMarketRows = () =>
  fallbackMarketRows.map(row => ({
    ...row,
    unit: "per kg",
    currency: "INR",
    dataMode: "fallback",
    date: row.date || new Date().toISOString().slice(0, 10),
    updatedAt: new Date().toISOString()
  }));

const buildMarketPriceReport = (matchedCatalogItem: any, rows: any[], dataMode: string) => {
  const pricedRows = rows.filter((item: any) => item.product === matchedCatalogItem.product);
  const latest = pricedRows[0];
  if (!latest) {
    return {
      available: false,
      product: matchedCatalogItem.product,
      message: "No market prices were returned for this product."
    };
  }

  const averageModalPrice =
    pricedRows.reduce((sum: number, row: any) => sum + Number(row.modalPricePerKg || 0), 0) / pricedRows.length;

  return {
    available: true,
    product: matchedCatalogItem.product,
    category: matchedCatalogItem.category,
    state: latest.state,
    district: latest.district,
    market: latest.market,
    date: latest.date || new Date().toISOString().slice(0, 10),
    currency: "INR",
    unit: "per kg",
    modalPrice: Number(Number(latest.modalPricePerKg).toFixed(2)),
    minPrice: latest.minPricePerKg ? Number(Number(latest.minPricePerKg).toFixed(2)) : null,
    maxPrice: latest.maxPricePerKg ? Number(Number(latest.maxPricePerKg).toFixed(2)) : null,
    recentAverageModalPrice: Number(averageModalPrice.toFixed(2)),
    dataMode: latest.dataMode || dataMode,
    updatedAt: new Date().toISOString()
  };
};

const getMarketPriceBoard = async () => {
  if (marketPriceCache && marketPriceCache.expiresAt > Date.now()) {
    return marketPriceCache.data;
  }

  let items: any[] = [];
  let dataMode = "live";
  try {
    const liveResults = await Promise.allSettled(
      marketCatalog.map(catalogItem => fetchLiveMandiPricesForCommodity(catalogItem))
    );
    items = liveResults.flatMap(result => result.status === "fulfilled" ? result.value : []);
  } catch (err) {
    console.warn("Agmarknet market price fetch failed:", err);
  }

  if (items.length === 0) {
    dataMode = "fallback";
    items = getFallbackMarketRows();
  } else {
    const liveProducts = new Set(items.map((item: any) => item.product));
    const supplementalRows = getFallbackMarketRows().filter(row => !liveProducts.has(row.product));
    items = [...items, ...supplementalRows];
  }

  const board = {
    updatedAt: new Date().toISOString(),
    dataMode,
    sourceNote: dataMode === "live"
      ? "Live mandi prices are loaded from the Government of India Agmarknet/data.gov.in feed and converted from Rs/quintal to Rs/kg."
      : "Live mandi prices could not be reached, so resilient local fallback prices are displayed.",
    categories: ["all", ...Array.from(new Set(marketCatalog.map(item => item.category)))],
    items
  };

  marketPriceCache = {
    expiresAt: Date.now() + 10 * 60 * 1000,
    data: board
  };
  return board;
};

const getCropMarketPriceReport = async (cropType: string) => {
  const normalizedCrop = String(cropType || "").trim().toLowerCase();
  const matchedCatalogItem = getMarketCatalogItem(normalizedCrop);

  if (!matchedCatalogItem) {
    return {
      available: false,
      product: normalizedCrop || "selected crop",
      message: "No market price feed is currently configured for this product."
    };
  }

  const board = await getMarketPriceBoard();
  return buildMarketPriceReport(matchedCatalogItem, board.items, board.dataMode);
};

const createIoTReading = (timestamp = new Date(), stress = false) => {
  const minutes = timestamp.getHours() * 60 + timestamp.getMinutes();
  const phase = minutes / (24 * 60);
  const stressOffset = stress ? 1 : 0;
  const moisture = 48 - 8 * Math.sin(2 * Math.PI * (phase - 0.1)) - stressOffset * 14 + (Math.random() * 3 - 1.5);
  const temperature = 27 + 5 * Math.sin(2 * Math.PI * (phase - 0.25)) + stressOffset * 3 + (Math.random() * 1.4 - 0.7);
  const ph = 6.6 + 0.25 * Math.sin(2 * Math.PI * phase) + (Math.random() * 0.12 - 0.06);
  const electricalConductivity =
    0.9 + 0.08 * Math.sin(2 * Math.PI * phase) + stressOffset * 0.5 + (Math.random() * 0.06 - 0.03);
  const lightLux =
    30000 + 18000 * Math.max(0, Math.sin(2 * Math.PI * phase)) + (Math.random() * 2400 - 1200);

  return {
    timestamp,
    moisture: Number(Math.max(0, Math.min(100, moisture)).toFixed(2)),
    ph: Number(Math.max(3.5, Math.min(9.5, ph)).toFixed(2)),
    temperature: Number(temperature.toFixed(2)),
    electricalConductivity: Number(Math.max(0, electricalConductivity).toFixed(3)),
    lightLux: Number(Math.max(0, lightLux).toFixed(2))
  };
};

const assessIoTData = (iotData: any = {}) => {
  const moisture = Number(iotData.moisture ?? iotData.soilMoisturePct ?? 0);
  const ph = Number(iotData.ph ?? iotData.soilPh ?? 0);
  const temperature = Number(iotData.temperature ?? iotData.temperatureC ?? 0);

  const checks = [
    { name: "moisture", passed: moisture >= 25 && moisture <= 75, value: moisture, range: "25-75%" },
    { name: "ph", passed: ph >= 5.5 && ph <= 7.8, value: ph, range: "5.5-7.8" },
    { name: "temperature", passed: temperature >= 12 && temperature <= 42, value: temperature, range: "12-42C" }
  ];
  const passed = checks.filter(check => check.passed).length;
  return {
    score: passed / checks.length,
    isOrganicSafe: passed >= 2,
    checks
  };
};

const generateIoTReadings = (hours = 24, intervalMinutes = 30, stress = false) => {
  const readings = [];
  const totalPoints = Math.max(1, Math.floor((hours * 60) / intervalMinutes));
  const now = Date.now();

  for (let index = 0; index < totalPoints; index++) {
    const timestamp = new Date(now - (totalPoints - index - 1) * intervalMinutes * 60 * 1000);
    readings.push(createIoTReading(timestamp, stress && index > totalPoints * 0.65));
  }

  return readings;
};

const isObsoleteAiNotification = (notification: any) =>
  typeof notification?.message === "string" &&
  notification.message.includes("AI analysis could not run: AI model artifacts not found.");

const isObsoleteBlockchainNotification = (notification: any) =>
  typeof notification?.message === "string" &&
  notification.message.includes("AI verified this farm, but blockchain certification failed: Blockchain is not configured.");

const sanitizeFarmNotifications = (farm: any) => {
  if (!farm?.notifications || !Array.isArray(farm.notifications)) {
    return farm;
  }

  farm.notifications = farm.notifications.filter((notification: any) =>
    !isObsoleteAiNotification(notification) && !isObsoleteBlockchainNotification(notification)
  );
  return farm;
};

const attachFarmerName = (farmInput: any) => {
  if (!farmInput) return farmInput;

  const farm = typeof farmInput.toObject === "function"
    ? farmInput.toObject({ virtuals: true })
    : farmInput;

  const farmerRef = farm.farmerId;
  const populatedFarmerName =
    farmerRef && typeof farmerRef === "object" && "name" in farmerRef ? farmerRef.name : "";
  const demoFarmerName =
    typeof farm.farmerId !== "undefined"
      ? demoUsers.find(user => user._id.toString() === farm.farmerId.toString())?.name
      : "";
  const demoFarmer =
    typeof farm.farmerId !== "undefined"
      ? demoUsers.find(user => user._id.toString() === farm.farmerId.toString())
      : null;

  farm.farmerName = farm.farmerName || populatedFarmerName || demoFarmerName || "";
  if (farmerRef && typeof farmerRef === "object") {
    farm.farmerPhone = farm.farmerPhone || farmerRef.phone || "";
    farm.farmerAddress = farm.farmerAddress || farmerRef.address || "";
  } else if (demoFarmer) {
    farm.farmerPhone = farm.farmerPhone || demoFarmer.phone || "";
    farm.farmerAddress = farm.farmerAddress || demoFarmer.address || "";
  }
  return farm;
};

const normalizeFarmMarketPrice = (farmInput: any) => {
  if (!farmInput) return farmInput;

  const farm = typeof farmInput.toObject === "function"
    ? farmInput.toObject({ virtuals: true })
    : farmInput;
  const cropType = String(farm.cropType || "").trim().toLowerCase();
  const marketPrice = farm.aiReport?.marketPrice;
  const product = String(marketPrice?.product || "").trim().toLowerCase();
  const matchedCatalogItem = getMarketCatalogItem(cropType);

  if (marketPrice && matchedCatalogItem && product && product !== matchedCatalogItem.product) {
    farm.aiReport = {
      ...farm.aiReport,
      marketPrice: buildMarketPriceReport(matchedCatalogItem, getFallbackMarketRows(), "fallback")
    };
  }

  return farm;
};

const normalizeFarmCertificateLink = (farm: any) => {
  if (!farm) return farm;

  const certificateId = farm.blockchain?.certificateId || farm.certificateHash;
  if (!certificateId) return farm;

  const currentUrl = buildCertificateVerificationUrl(String(certificateId));
  const existingUrl = Array.isArray(farm.qrCodes) ? String(farm.qrCodes[0] || "") : "";
  if (!existingUrl || isLocalhostUrl(existingUrl)) {
    farm.qrCodes = [currentUrl];
  }

  return farm;
};

const prepareFarmForClient = (farm: any) =>
  attachFarmerName(normalizeFarmCertificateLink(normalizeFarmMarketPrice(sanitizeFarmNotifications(farm))));

const runTrainedAiAnalysis = async (input: any, options?: { requireAuditorConsensus?: boolean }) => {
  if (!input.plantImage) {
    throw new Error("Plant image is required for trained AI inference.");
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agritrustra-ai-"));
  const imageDataPath = path.join(tempDir, "plant-image-base64.txt");
  await fs.writeFile(imageDataPath, input.plantImage, "utf-8");

  try {
    const scriptPath = path.join(process.cwd(), "ml", "predict_crop.py");
    const { stdout } = await execFileAsync(
      PYTHON_BIN,
      [scriptPath, "--model-dir", AI_MODEL_DIR, "--image-base64-file", imageDataPath],
      { maxBuffer: 10 * 1024 * 1024, timeout: AI_TRAINED_INFERENCE_TIMEOUT_MS }
    );
    const imageResult = JSON.parse(stdout.trim().split(/\r?\n/).at(-1) || "{}");
    const iotAssessment = assessIoTData(input.iotData);
    const baseFusedAccuracy = Number((imageResult.accuracy * 0.75 + iotAssessment.score * 0.25).toFixed(4));
    const isOrganic = Boolean(imageResult.isOrganic && iotAssessment.isOrganicSafe && baseFusedAccuracy >= AI_CONFIDENCE_THRESHOLD);

    return {
      accuracy: baseFusedAccuracy,
      imageConfidence: imageResult.accuracy,
      isOrganic,
      isHealthy: Boolean(imageResult.isHealthy),
      diseaseDetected: Boolean(imageResult.diseaseDetected),
      diseaseName: imageResult.diseaseName || (imageResult.isHealthy ? "None detected" : "Disease detected"),
      plantHealth: imageResult.plantHealth,
      predictedClass: imageResult.predictedClass,
      topPredictions: imageResult.topPredictions,
      fertilizerUsage: isOrganic
        ? "Dual auditor verification, healthy plant prediction, and trained AI-IoT fusion support organic certification."
        : "Trained image model found disease, low confidence, or IoT risk. Auditor review is required.",
      soilAnalysis: `IoT validation score ${(iotAssessment.score * 100).toFixed(0)}% across moisture, pH, and temperature.`,
      iotAssessment,
      fraudDetected: !iotAssessment.isOrganicSafe,
      isAgriculturalLand: imageResult.isAgriculturalLand,
      modelSource: "Real trained PlantVillage image classifier",
      auditorConsensusRequired: Boolean(options?.requireAuditorConsensus),
      timestamp: new Date()
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
};

const runAiAnalysis = async (input: any, options?: { requireAuditorConsensus?: boolean }) => {
  if (!(await isAiModelReady())) {
    throw new Error(`Trained AI model artifacts are required. Expected model.keras and labels.json in ${AI_MODEL_DIR}.`);
  }

  return runTrainedAiAnalysis(input, options);
};

// MongoDB Connection with timeout and fallback
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/agritrust";
let isDbConnected = false;
const isMongoDisabled = process.env.DISABLE_MONGODB === "true";
const canUseDatabase = () => isDbConnected && mongoose.connection.readyState === 1;

mongoose.set("bufferCommands", false);

if (isMongoDisabled) {
  console.warn("MongoDB disabled via DISABLE_MONGODB=true. Running in Demo Mode (In-memory storage).");
} else {
  mongoose.connection.on("connected", () => {
    isDbConnected = true;
    console.log("Connected to MongoDB");
  });

  mongoose.connection.on("disconnected", () => {
    isDbConnected = false;
    console.warn("MongoDB disconnected. Running in Demo Mode (In-memory storage).");
  });

  mongoose.connection.on("error", err => {
    isDbConnected = false;
    console.error("MongoDB runtime error. Running in Demo Mode (In-memory storage).", err.message);
  });

  mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 5000, // 5 seconds timeout
  })
    .then(() => {
      isDbConnected = true;
    })
    .catch(err => {
      console.error("MongoDB connection error. Running in Demo Mode (In-memory storage).", err.message);
      isDbConnected = false;
    });
}

// Demo Mode In-Memory Storage
const demoUsers: any[] = [];
const demoFarms: any[] = [];
const demoOtps: any[] = [];

// Models
const UserSchema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, enum: ["farmer", "auditor1", "auditor2"], default: "farmer" },
  name: String,
  address: String,
  verificationStatus: {
    emailVerified: { type: Boolean, default: false },
    otpVerified: { type: Boolean, default: false },
    verifiedAt: Date,
    verificationProvider: { type: String, default: "mock" }
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const OtpSchema = new mongoose.Schema({
  recipient: { type: String, required: true, index: true, trim: true },
  channel: { type: String, enum: ["email", "sms"], required: true },
  purpose: { type: String, enum: OTP_PURPOSES, required: true },
  provider: { type: String, default: "local" },
  otpHash: { type: String },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  attempts: { type: Number, default: 0 },
  consumedAt: Date,
  lastSentAt: { type: Date, default: Date.now }
});

const FarmSchema = new mongoose.Schema({
  farmerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  cropType: String,
  soilType: String,
  location: {
    lat: Number,
    lng: Number
  },
  images: [String], // Keeping for backward compatibility or general use
  cropPhoto: String,
  productImage: String,
  plantImage: String,
  geoTaggedImages: [{
    field: String,
    label: String,
    image: String,
    lat: Number,
    lng: Number,
    accuracy: Number,
    address: String,
    mapImage: String,
    capturedAt: String,
    capturedWith: String
  }],
  iotData: {
    moisture: Number,
    ph: Number,
    temperature: Number
  },
  status: { 
    type: String, 
    enum: ["pending", "auditor1_verified", "auditor2_verified", "ai_analyzed", "certified", "failed_ai_verification"], 
    default: "pending" 
  },
  auditor1Data: {
    verifiedAt: Date,
    inspectionDate: String,
    referenceNumber: String,
    farmAreaAcres: String,
    soilCondition: String,
    irrigationMethod: String,
    auditorNotes: String,
    isOrganicCertified: Boolean,
    fertilizerUsed: String,
    pesticideUsed: String,
    waterSource: String,
    seedSource: String,
    bufferZoneWidth: String,
    inputPurchaseRecords: String,
    contaminationRisks: String,
    recommendations: String,
    farmPhotos: [String],
    geoTaggedPhotos: [{
      image: String,
      fileName: String,
      lat: Number,
      lng: Number,
      accuracy: Number,
      address: String,
      mapImage: String,
      capturedAt: String,
      uploadedByRole: String,
      capturedWith: String
    }]
  },
  auditor2Data: {
    verifiedAt: Date,
    auditorNotes: String,
    isOrganicCertified: Boolean,
    referenceNumber: String,
    technicalReviewMemo: String,
    complianceChecklist: String,
    followUpNotes: String,
    farmPhotos: [String],
    geoTaggedPhotos: [{
      image: String,
      fileName: String,
      lat: Number,
      lng: Number,
      accuracy: Number,
      address: String,
      mapImage: String,
      capturedAt: String,
      uploadedByRole: String,
      capturedWith: String
    }]
  },
  aiReport: Object,
  notifications: [{
    message: { type: String },
    type: { type: String },
    createdAt: { type: Date, default: Date.now }
  }],
  certificateHash: String,
  blockchain: {
    certificateId: String,
    metadataHash: String,
    txHash: String,
    blockNumber: Number,
    contractAddress: String,
    chainId: Number,
    receiptStatus: Number,
    gasUsed: String,
    explorerUrl: String,
    issuedAt: Date
  },
  qrCodes: [String],
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model("User", UserSchema);
const Otp = mongoose.model("Otp", OtpSchema);
const Farm = mongoose.model("Farm", FarmSchema);

const getEntityId = (value: any) =>
  value && typeof value === "object" && "_id" in value ? value._id.toString() : String(value || "");

const findUserByPhone = async (phone: string) => {
  if (canUseDatabase()) {
    return User.findOne({ phone });
  }

  return demoUsers.find(u => u.phone === phone);
};

const findUserById = async (id: any) => {
  const normalizedId = getEntityId(id);
  if (!normalizedId) return null;

  if (canUseDatabase()) {
    return User.findById(normalizedId);
  }

  return demoUsers.find(user => user._id.toString() === normalizedId) || null;
};

const findUserByEmail = async (email: string) => {
  const normalizedEmail = normalizeEmail(email);
  if (canUseDatabase()) {
    return User.findOne({ email: normalizedEmail });
  }

  return demoUsers.find(u => normalizeEmail(u.email || "") === normalizedEmail);
};

const findUsersByRole = async (role: string) => {
  if (canUseDatabase()) {
    return User.find({ role });
  }

  return demoUsers.filter(user => user.role === role);
};

const buildAuditReferenceNumber = () =>
  `ATR-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${randomInt(1000, 10000)}`;

const summarizeAuditor1Approval = (farm: any, auditor1Data: any, farmerName: string, auditorName: string) => {
  const lines = [
    `Farmer: ${farmerName}`,
    `Crop: ${farm.cropType || "N/A"}`,
    `Reference Number: ${auditor1Data.referenceNumber}`,
    `Auditor 1: ${auditorName}`,
    `Inspection Date: ${auditor1Data.inspectionDate || "N/A"}`,
    `Farm Area: ${auditor1Data.farmAreaAcres || "N/A"}`,
    `Soil Condition: ${auditor1Data.soilCondition || "N/A"}`,
    `Irrigation Method: ${auditor1Data.irrigationMethod || "N/A"}`,
    `Water Source: ${auditor1Data.waterSource || "N/A"}`,
    `Seed Source: ${auditor1Data.seedSource || "N/A"}`,
    `Buffer Zone Width: ${auditor1Data.bufferZoneWidth || "N/A"}`,
    `Fertilizer Used: ${auditor1Data.fertilizerUsed || "N/A"}`,
    `Pesticide Used: ${auditor1Data.pesticideUsed || "N/A"}`,
    `Input Purchase Records: ${auditor1Data.inputPurchaseRecords || "N/A"}`,
    `Contamination Risks: ${auditor1Data.contaminationRisks || "N/A"}`,
    `Recommendations: ${auditor1Data.recommendations || "N/A"}`,
    `Organic Approval: ${auditor1Data.isOrganicCertified ? "Approved" : "Not approved"}`,
    `Auditor Notes: ${auditor1Data.auditorNotes || "N/A"}`
  ];

  return lines.join("\n");
};

const notifyAuditor1Approval = async (farm: any, auditor1Data: any, auditorUser: any) => {
  const farmerUser = await findUserById(farm.farmerId);
  const auditor2Users = (await findUsersByRole("auditor2")).filter(user => Boolean(normalizeEmail(user.email || "")));
  const farmerName = farmerUser?.name || farm.farmerName || "Registered Farmer";
  const auditorName = auditorUser?.name || "Auditor 1";
  const summary = summarizeAuditor1Approval(farm, auditor1Data, farmerName, auditorName);
  const warnings: string[] = [];

  if (farmerUser?.email) {
    try {
      await sendEmailMessage({
        to: farmerUser.email,
        subject: `AgriTrustra audit update for ${farm.cropType || "your farm"}`,
        text: `Auditor 1 has completed the initial inspection.\n\n${summary}`,
        html: `<p>Auditor 1 has completed the initial inspection.</p><pre>${summary}</pre>`
      });
    } catch (error: any) {
      warnings.push(`Farmer email failed: ${error.message}`);
    }
  } else {
    warnings.push("Farmer email is missing.");
  }

  if (auditor2Users.length === 0) {
    warnings.push("No Auditor 2 email recipients found.");
  } else {
    const auditor2Text = `A farm is ready for phase 2 review.\n\n${summary}\n\nPlease use reference number ${auditor1Data.referenceNumber} for final review.`;
    const results = await Promise.allSettled(
      auditor2Users.map(user =>
        sendEmailMessage({
          to: user.email,
          subject: `Phase 2 review required: ${auditor1Data.referenceNumber}`,
          text: auditor2Text,
          html: `<p>A farm is ready for phase 2 review.</p><pre>${summary}</pre><p>Please use reference number <strong>${auditor1Data.referenceNumber}</strong> for final review.</p>`
        })
      )
    );

    results.forEach((result, index) => {
      if (result.status === "rejected") {
        warnings.push(`Auditor 2 email failed for ${auditor2Users[index].email}: ${result.reason?.message || result.reason}`);
      }
    });
  }

  return warnings;
};

const removeExpiredDemoOtps = () => {
  const now = Date.now();
  for (let index = demoOtps.length - 1; index >= 0; index--) {
    const record = demoOtps[index];
    if (new Date(record.expiresAt).getTime() <= now || record.consumedAt) {
      demoOtps.splice(index, 1);
    }
  }
};

const getOtpRecord = async (recipient: string, purpose: OtpPurpose, channel: OtpChannel) => {
  if (canUseDatabase()) {
    return Otp.findOne({ recipient, purpose, channel, consumedAt: null }).sort({ lastSentAt: -1 });
  }

  removeExpiredDemoOtps();
  return demoOtps
    .filter(record => record.recipient === recipient && record.purpose === purpose && record.channel === channel && !record.consumedAt)
    .sort((a, b) => new Date(b.lastSentAt).getTime() - new Date(a.lastSentAt).getTime())[0] || null;
};

const storeOtpRecord = async ({
  recipient,
  purpose,
  channel,
  otp,
  provider
}: {
  recipient: string;
  purpose: OtpPurpose;
  channel: OtpChannel;
  otp?: string;
  provider: string;
}) => {
  const otpHash = otp ? await bcrypt.hash(otp, 10) : undefined;
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
  const payload = {
    recipient,
    channel,
    purpose,
    provider,
    otpHash,
    expiresAt,
    attempts: 0,
    consumedAt: null,
    lastSentAt: new Date()
  };

  if (canUseDatabase()) {
    await Otp.findOneAndUpdate(
      { recipient, purpose, channel, consumedAt: null },
      payload,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return;
  }

  const existingIndex = demoOtps.findIndex(record => record.recipient === recipient && record.purpose === purpose && record.channel === channel && !record.consumedAt);
  if (existingIndex >= 0) {
    demoOtps[existingIndex] = { ...demoOtps[existingIndex], ...payload };
  } else {
    demoOtps.push(payload);
  }
};

const markOtpConsumed = async (record: any) => {
  if (!record) return;

  if (canUseDatabase()) {
    await Otp.updateOne({ _id: record._id }, { consumedAt: new Date() });
    return;
  }

  record.consumedAt = new Date();
};

const incrementOtpAttempts = async (record: any) => {
  if (!record) return;

  if (canUseDatabase()) {
    await Otp.updateOne({ _id: record._id }, { $inc: { attempts: 1 } });
    return;
  }

  record.attempts = Number(record.attempts || 0) + 1;
};

const sendOtpCode = async ({
  email,
  phone,
  purpose
}: {
  email?: string;
  phone?: string;
  purpose: OtpPurpose;
}) => {
  const normalizedEmail = normalizeEmail(String(email || ""));
  if (!isValidEmail(normalizedEmail)) {
    throw new Error("Enter a valid email address.");
  }

  if (purpose !== "register") {
    const user = await findUserByEmail(normalizedEmail);
    if (!user) {
      throw new Error("User with this email address not found.");
    }
  }

  if (purpose === "register") {
    if (!phone) {
      throw new Error("Phone number is required for registration.");
    }

    const normalizedPhone = normalizePhone(String(phone));
    if (normalizedPhone.length < 10) {
      throw new Error("Enter a valid phone number.");
    }

    if (await findUserByPhone(normalizedPhone)) {
      throw new Error("An account with this phone number already exists.");
    }

    if (await findUserByEmail(normalizedEmail)) {
      throw new Error("An account with this email address already exists.");
    }
  }

  const recipient = normalizedEmail;
  const channel: OtpChannel = "email";
  const displayTarget = normalizedEmail;
  const provider = "local";

  const existingOtp = await getOtpRecord(recipient, purpose, channel);
  if (existingOtp?.lastSentAt) {
    const elapsedSeconds = Math.floor((Date.now() - new Date(existingOtp.lastSentAt).getTime()) / 1000);
    if (elapsedSeconds < OTP_RESEND_COOLDOWN_SECONDS) {
      const retryAfterSeconds = OTP_RESEND_COOLDOWN_SECONDS - elapsedSeconds;
      const cooldownError = new Error(`Please wait ${retryAfterSeconds}s before requesting another OTP.`);
      (cooldownError as any).statusCode = 429;
      (cooldownError as any).retryAfterSeconds = retryAfterSeconds;
      throw cooldownError;
    }
  }

  const otp = generateOtpCode();
  const deliveryResult = await deliverEmailOtp(recipient, otp, purpose);
  await storeOtpRecord({
    recipient,
    purpose,
    channel,
    provider,
    otp
  });

  return {
    message: `OTP sent to ${displayTarget}.`,
    delivery: deliveryResult.delivery,
    devOtp: deliveryResult.devOtp,
    expiresInSeconds: OTP_EXPIRY_MINUTES * 60,
    resendInSeconds: OTP_RESEND_COOLDOWN_SECONDS
  };
};

const verifyOtpCode = async ({
  recipient,
  purpose,
  otp,
  channel
}: {
  recipient: string;
  purpose: OtpPurpose;
  otp: string;
  channel: OtpChannel;
}) => {
  const record = await getOtpRecord(recipient, purpose, channel);

  if (!record) {
    throw new Error("OTP not found. Request a new OTP.");
  }

  if (new Date(record.expiresAt).getTime() <= Date.now()) {
    throw new Error("OTP expired. Request a new OTP.");
  }

  if (Number(record.attempts || 0) >= OTP_MAX_ATTEMPTS) {
    throw new Error("OTP verification limit reached. Request a new OTP.");
  }

  if (!record.otpHash) {
    throw new Error("OTP provider is misconfigured. Request a new OTP.");
  }

  const matches = await bcrypt.compare(String(otp || ""), record.otpHash);
  if (!matches) {
    await incrementOtpAttempts(record);
    throw new Error("Invalid OTP.");
  }

  await markOtpConsumed(record);
};

const ensureSixDigitPassword = (password: string) => {
  if (!/^\d{6}$/.test(String(password || ""))) {
    throw new Error("Password must be exactly 6 digits.");
  }
};

// Auth Middleware
const authenticate = (req: any, res: any, next: any) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid token" });
  }
};



// API Routes
app.post("/api/auth/send-otp", async (req, res) => {
  try {
    const { email, phone, purpose } = req.body;

    if (!isValidOtpPurpose(purpose)) {
      return res.status(400).json({ error: "Invalid OTP purpose" });
    }

    const result = await sendOtpCode({
      email: email ? String(email) : undefined,
      phone: phone ? String(phone) : undefined,
      purpose
    });
    res.json(result);
  } catch (err: any) {
    const statusCode = err.statusCode || 400;
    res.status(statusCode).json({
      error: getOtpDeliveryErrorMessage(err),
      retryAfterSeconds: err.retryAfterSeconds
    });
  }
});

app.post("/api/auth/register", async (req, res) => {
  try {
    const { phone, email, password, role, name, address, otp } = req.body;
    const normalizedPhone = normalizePhone(String(phone || ""));
    const normalizedEmail = normalizeEmail(String(email || ""));

    if (!normalizedPhone || normalizedPhone.length < 10) {
      return res.status(400).json({ error: "Valid phone number is required" });
    }

    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({ error: "Valid email address is required" });
    }

    const existingPhoneUser = await findUserByPhone(normalizedPhone);
    if (existingPhoneUser) {
      return res.status(400).json({ error: "This phone number is already registered" });
    }

    const existingEmailUser = await findUserByEmail(normalizedEmail);
    if (existingEmailUser) {
      return res.status(400).json({ error: "This email address is already registered" });
    }

    // Verify OTP using email only
    ensureSixDigitPassword(String(password || ""));
    await verifyOtpCode({
      recipient: normalizedEmail,
      purpose: "register",
      otp: String(otp || ""),
      channel: "email"
    });
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    let user;
    if (canUseDatabase()) {
      user = new User({ 
        phone: normalizedPhone, 
        email: normalizedEmail,
        password: hashedPassword, 
        role, 
        name, 
        address,
        verificationStatus: {
          emailVerified: true,
          otpVerified: true,
          verifiedAt: new Date()
        }
      });
      await user.save();
    } else {
      // Demo Mode
      user = { 
        _id: new mongoose.Types.ObjectId(), 
        phone: normalizedPhone, 
        email: normalizedEmail,
        password: hashedPassword, 
        role, 
        name, 
        address,
        verificationStatus: {
          emailVerified: true,
          otpVerified: true,
          verifiedAt: new Date()
        }
      };
      demoUsers.push(user);
    }
    
    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET);
    res.json({ 
      token, 
      user: { 
        id: user._id, 
        role: user.role, 
        name: user.name,
        phone: normalizedPhone,
        email: normalizedEmail,
        address: user.address || "",
        verificationStatus: (user as any).verificationStatus
      } 
    });
  } catch (err: any) {
    console.error("Registration error:", err);
    res.status(400).json({ error: err.message || "Registration failed" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, otp } = req.body;
    const normalizedEmail = normalizeEmail(String(email || ""));

    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({ error: "Valid email address is required" });
    }

    await verifyOtpCode({
      recipient: normalizedEmail,
      purpose: "login",
      otp: String(otp || ""),
      channel: "email"
    });

    const user = await findUserByEmail(normalizedEmail);
    if (!user) {
      return res.status(404).json({ error: "User with this email address not found" });
    }

    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET);
    res.json({
      token,
      user: {
        id: user._id,
        role: user.role,
        name: user.name,
        email: user.email,
        phone: user.phone,
        address: user.address || ""
      }
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Login failed" });
  }
});

app.patch("/api/auth/profile", authenticate, async (req: any, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const phone = normalizePhone(String(req.body?.phone || ""));
    const address = String(req.body?.address || "").trim();

    if (!name) {
      return res.status(400).json({ error: "Farmer name is required" });
    }

    if (!phone || phone.length < 10) {
      return res.status(400).json({ error: "Valid phone number is required" });
    }

    const existingPhoneUser = await findUserByPhone(phone);
    if (existingPhoneUser && existingPhoneUser._id.toString() !== req.user.id.toString()) {
      return res.status(400).json({ error: "This phone number is already used by another account" });
    }

    let user;
    if (canUseDatabase()) {
      user = await User.findByIdAndUpdate(
        req.user.id,
        { name, phone, address, updatedAt: new Date() },
        { new: true }
      );
    } else {
      const index = demoUsers.findIndex(item => item._id.toString() === req.user.id.toString());
      if (index >= 0) {
        demoUsers[index] = { ...demoUsers[index], name, phone, address, updatedAt: new Date() };
        user = demoUsers[index];
      }
    }

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      user: {
        id: user._id,
        role: user.role,
        name: user.name,
        email: user.email,
        phone: user.phone,
        address: user.address || ""
      }
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Profile update failed" });
  }
});

app.post("/api/auth/reset-password", async (req, res) => {
  try {
    const { email, password, otp } = req.body;
    const normalizedEmail = normalizeEmail(String(email || ""));
    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({ error: "Valid email address is required" });
    }
    ensureSixDigitPassword(String(password || ""));
    await verifyOtpCode({
      recipient: normalizedEmail,
      purpose: "reset-password",
      otp: String(otp || ""),
      channel: "email"
    });
    let user;
    const hashedPassword = await bcrypt.hash(password, 10);

    if (canUseDatabase()) {
      user = await User.findOneAndUpdate({ email: normalizedEmail }, { password: hashedPassword }, { new: true });
    } else {
      const index = demoUsers.findIndex(u => normalizeEmail(u.email || "") === normalizedEmail);
      if (index !== -1) {
        demoUsers[index].password = hashedPassword;
        user = demoUsers[index];
      }
    }

    if (!user) {
      return res.status(404).json({ error: "User with this email address not found" });
    }

    res.json({ message: "Password reset successful" });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/farms", authenticate, async (req: any, res) => {
  try {
    const { cropPhoto, productImage, plantImage, geoTaggedImages } = req.body;
    if (!cropPhoto || !productImage || !plantImage) {
      return res.status(400).json({ error: "Crop photo, product image, and plant image are required" });
    }
    if (!Array.isArray(geoTaggedImages) || geoTaggedImages.length < 3) {
      return res.status(400).json({ error: "Geo-tagged crop, product, and plant images are required" });
    }

    let farm;
    if (canUseDatabase()) {
      farm = new Farm({ ...req.body, farmerId: req.user.id });
      await farm.save();
    } else {
      farm = { ...req.body, _id: new mongoose.Types.ObjectId(), farmerId: req.user.id, createdAt: new Date(), status: "pending", notifications: [] };
      demoFarms.push(farm);
    }
    res.json(farm);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/api/farms/my", authenticate, async (req: any, res) => {
  let farms;
  if (canUseDatabase()) {
      farms = await Farm.find({ farmerId: req.user.id }).populate("farmerId", "name phone address");
  } else {
    farms = demoFarms.filter(f => f.farmerId.toString() === req.user.id.toString());
  }
  res.json(farms.map(prepareFarmForClient));
});

app.get("/api/farms/pending", authenticate, async (req: any, res) => {
  if (req.user.role !== "auditor1" && req.user.role !== "auditor2") return res.status(403).json({ error: "Forbidden" });
  let farms;
  if (canUseDatabase()) {
    if (req.user.role === "auditor1") {
      farms = await Farm.find({ status: { $in: ["pending", "failed_ai_verification"] } }).populate("farmerId", "name phone address");
    } else {
      farms = await Farm.find({ status: "auditor1_verified" }).populate("farmerId", "name phone address");
    }
  } else {
    if (req.user.role === "auditor1") {
      farms = demoFarms.filter(f => ["pending", "failed_ai_verification"].includes(f.status));
    } else {
      farms = demoFarms.filter(f => f.status === "auditor1_verified");
    }
  }
  res.json(farms.map(prepareFarmForClient));
});

app.post("/api/farms/:id/verify", authenticate, async (req: any, res) => {
  if (req.user.role !== "auditor1" && req.user.role !== "auditor2") return res.status(403).json({ error: "Forbidden" });
  
  let farm;
  if (canUseDatabase()) {
    farm = await Farm.findById(req.params.id) as any;
  } else {
    farm = demoFarms.find(f => f._id.toString() === req.params.id);
  }

  if (!farm) return res.status(404).json({ error: "Farm not found" });
  const warnings: string[] = [];
  let auditor1NotificationContext: { farm: any; auditor1Data: any; auditorUser: any } | null = null;

  // Auditor 1 logic
  if (req.user.role === "auditor1") {
    if (farm.status !== "pending" && farm.status !== "failed_ai_verification") {
      return res.status(400).json({ error: "Farm is not in a state for Auditor 1 verification" });
    }

    const requiredFields = [
      "inspectionDate",
      "farmAreaAcres",
      "soilCondition",
      "irrigationMethod",
      "fertilizerUsed",
      "pesticideUsed",
      "waterSource",
      "seedSource",
      "bufferZoneWidth",
      "inputPurchaseRecords",
      "contaminationRisks",
      "recommendations",
      "auditorNotes"
    ];
    const missingFields = requiredFields.filter(field => !String(req.body?.[field] || "").trim());
    if (!Array.isArray(req.body?.geoTaggedPhotos) || req.body.geoTaggedPhotos.length === 0) {
      missingFields.push("geoTaggedPhotos");
    }
    if (missingFields.length > 0) {
      return res.status(400).json({ error: `Missing required Auditor 1 fields: ${missingFields.join(", ")}` });
    }

    const referenceNumber = String(req.body.referenceNumber || "").trim() || buildAuditReferenceNumber();
    farm.status = "auditor1_verified";
    farm.auditor1Data = {
      ...req.body,
      referenceNumber,
      auditorId: req.user.id,
      verifiedAt: new Date()
    };

    const auditorUser = await findUserById(req.user.id);
    auditor1NotificationContext = {
      farm,
      auditor1Data: farm.auditor1Data,
      auditorUser
    };
  } 
  // Auditor 2 logic
  else if (req.user.role === "auditor2") {
    if (farm.status !== "auditor1_verified") {
      return res.status(400).json({ error: "Farm must be verified by Auditor 1 first" });
    }
    const referenceNumber =
      String(req.body.referenceNumber || "").trim() ||
      String(farm.auditor1Data?.referenceNumber || "").trim();
    farm.status = "auditor2_verified";
    farm.auditor2Data = {
      ...req.body,
      referenceNumber,
      auditorId: req.user.id,
      verifiedAt: new Date()
    };
  }
  
  if (canUseDatabase()) await farm.save();
  if (auditor1NotificationContext) {
    const emailWarnings = await notifyAuditor1Approval(
      auditor1NotificationContext.farm,
      auditor1NotificationContext.auditor1Data,
      auditor1NotificationContext.auditorUser
    );
    warnings.push(...emailWarnings);
  }
  res.json({ farm, warnings });
});

app.post("/api/farms/:id/ai-analyze", authenticate, async (req: any, res) => {
  let farm;
  if (canUseDatabase()) {
    farm = await Farm.findById(req.params.id) as any;
  } else {
    farm = demoFarms.find(f => f._id.toString() === req.params.id);
  }
  
  if (!farm) return res.status(404).json({ error: "Farm not found" });

  // AI Analysis only after Auditor 2 verification
  if (farm.status !== "auditor2_verified") {
    return res.status(400).json({ error: "AI Analysis can only be triggered after Auditor 2 verification" });
  }

  // Ensure only the farm owner (farmer) or an auditor can trigger it
  if (req.user.role !== "auditor1" && req.user.role !== "auditor2" && farm.farmerId.toString() !== req.user.id.toString()) {
    return res.status(403).json({ error: "Forbidden" });
  }
  
  try {
    farm.aiReport = await runAiAnalysis(farm, { requireAuditorConsensus: true });
    farm.aiReport.marketPrice = await getCropMarketPriceReport(farm.cropType);
    sanitizeFarmNotifications(farm);
  } catch (err: any) {
    console.error("AI inference error:", err);
    farm.notifications.push({
      message: `AI analysis could not run: ${err.message}`,
      type: "error"
    });
    if (canUseDatabase()) await farm.save();
    return res.status(503).json({ error: `AI analysis failed: ${err.message}` });
  }

  const canIssueCertificate =
    farm.aiReport.isOrganic === true &&
    isPlantHealthyFromAi(farm.aiReport) &&
    hasAuditorOrganicApproval(farm);

  if (canIssueCertificate) {
    let blockchainCertificate;
    if (isBlockchainConfigured()) {
      try {
        blockchainCertificate = await issueBlockchainCertificate(farm);
      } catch (err: any) {
        console.error("Blockchain certification error:", err);
        blockchainCertificate = await issueLocalCertificate(farm);
        farm.notifications.push({
          message: `AI verified this farm, but blockchain certification is temporarily unavailable: ${err.message}. A local certificate was issued so the farm record remains certified.`,
          type: "info"
        });
      }
    } else {
      blockchainCertificate = await issueLocalCertificate(farm);
    }

    farm.status = "certified";
    farm.certificateHash = blockchainCertificate.certificateId;
    farm.blockchain = blockchainCertificate;
    farm.qrCodes = [buildCertificateVerificationUrl(blockchainCertificate.certificateId)];
    farm.notifications.push({
      message: blockchainCertificate.txHash
        ? `Congratulations! Your farm has been certified on-chain. Transaction: ${blockchainCertificate.txHash}`
        : "Congratulations! Your farm has been certified locally. Add blockchain settings in .env.local to issue on-chain certificates.",
      type: "success"
    });
  } else {
    farm.status = "failed_ai_verification";
    farm.notifications.push({
      message: farm.aiReport.diseaseDetected
        ? `AI detected disease: ${farm.aiReport.diseaseName || farm.aiReport.predictedClass}. Certificate was not issued.`
        : "AI and auditor approval did not confirm healthy organic status. Certificate was not issued.",
      type: "error"
    });
  }
  
  if (canUseDatabase()) await farm.save();
  res.json(farm);
});

app.get("/api/blockchain/status", async (req, res) => {
  if (!isBlockchainConfigured()) {
    return res.json({
      configured: false,
      message: "Set BLOCKCHAIN_RPC_URL, BLOCKCHAIN_PRIVATE_KEY, and CERTIFICATE_CONTRACT_ADDRESS in .env.local."
    });
  }

  try {
    const { provider } = await getCertificateContract();
    const network = await withTimeout<Network>(provider.getNetwork(), 2500, "Blockchain RPC check");
    res.json({
      configured: true,
      chainId: Number(network.chainId),
      contractAddress: getBlockchainConfig().contractAddress
    });
  } catch (err: any) {
    res.status(503).json({
      configured: true,
      available: false,
      contractAddress: getBlockchainConfig().contractAddress,
      error: err.message
    });
  }
});

app.get("/api/ai/status", async (req, res) => {
  const trainedArtifactsAvailable = await isAiModelReady();
  const artifacts = await getModelArtifacts();
  const tomatoPriceModel = await getTomatoPriceArtifacts();

  const historyData = Array.isArray(artifacts.history) ? artifacts.history : [];
  const metricsData = artifacts.metrics && Number(artifacts.metrics.accuracy ?? artifacts.metrics.validation_accuracy) > 0
    ? artifacts.metrics
    : null;
  res.json({
    configured: trainedArtifactsAvailable,
    trainedArtifactsAvailable,
    mode: trainedArtifactsAvailable ? "trained-model" : "missing-trained-model",
    message: trainedArtifactsAvailable
      ? "Trained AI model is active. Inference uses saved model artifacts."
      : `Trained AI is not available. Train the model and place model.keras and labels.json in ${AI_MODEL_DIR}.`,
    modelDir: AI_MODEL_DIR,
    pythonBin: PYTHON_BIN,
    confidenceThreshold: AI_CONFIDENCE_THRESHOLD,
    trainedInferenceTimeoutMs: AI_TRAINED_INFERENCE_TIMEOUT_MS,
    expectedArtifacts: artifacts.expectedArtifacts,
    availableArtifacts: artifacts.availableArtifacts,
    labelsCount: artifacts.labels.length,
    metrics: metricsData ? summarizeAiMetrics(metricsData) : null,
    history: historyData,
    tomatoPriceModel
  });
});

app.post("/api/ai/analyze", async (req, res) => {
  try {
    const { imageData, iotData } = req.body || {};

    if (!imageData || typeof imageData !== "string") {
      return res.status(400).json({ error: "imageData is required and must be a base64 data URL." });
    }

    const report: any = await runAiAnalysis(
      {
        plantImage: imageData,
        iotData: iotData || createIoTReading(new Date(), false)
      },
      { requireAuditorConsensus: false }
    );
    report.marketPrice = await getCropMarketPriceReport(req.body?.cropType || "vegetables");

    res.json({
      report,
      analyzedAt: new Date(),
      iotAssessment: report.iotAssessment
    });
  } catch (err: any) {
    console.error("Ad-hoc AI analysis failed:", err);
    res.status(503).json({ error: err.message || "AI analysis failed" });
  }
});

app.get("/api/market-prices", async (req, res) => {
  try {
    const category = String(req.query.category || "all").toLowerCase();
    const search = String(req.query.search || "").trim().toLowerCase();
    const board = await getMarketPriceBoard();
    const items = board.items.filter((item: any) => {
      const matchesCategory = category === "all" || item.category === category;
      const matchesSearch =
        !search ||
        item.product.toLowerCase().includes(search) ||
        String(item.state || "").toLowerCase().includes(search) ||
        String(item.district || "").toLowerCase().includes(search) ||
        item.market.toLowerCase().includes(search) ||
        item.category.toLowerCase().includes(search);
      return matchesCategory && matchesSearch;
    });

    res.json({
      ...board,
      selectedCategory: category,
      items
    });
  } catch (err: any) {
    console.error("Market price board error:", err);
    res.status(500).json({ error: err.message || "Failed to load market prices" });
  }
});

app.get("/api/health", async (req, res) => {
  const aiReady = await isAiModelReady();
  res.json({
    ok: true,
    environment: process.env.NODE_ENV || "development",
    database: canUseDatabase() ? "connected" : "unavailable",
    aiModel: aiReady ? "ready" : "missing",
    timestamp: new Date().toISOString()
  });
});

app.get("/api/tomato-price/sample", async (req, res) => {
  const sample = Math.min(Math.max(Number(req.query.sample || 5), 1), 20);
  const csvPath = path.join(process.cwd(), "datasets", "tomato-prices.csv");
  const modelPath = path.join(TOMATO_PRICE_MODEL_DIR, "model.joblib");
  const metadataPath = path.join(TOMATO_PRICE_MODEL_DIR, "metadata.json");

  if (!(await fileExists(csvPath))) {
    return res.status(404).json({ error: "Tomato prices dataset not found at datasets/tomato-prices.csv." });
  }

  if (!(await fileExists(modelPath)) || !(await fileExists(metadataPath))) {
    return res.status(400).json({ error: "Tomato price model artifacts are missing. Train the model with npm run ml:train:tomato-price." });
  }

  try {
    const scriptPath = path.join(process.cwd(), "ml", "predict_tomato_price.py");
    const { stdout } = await execFileAsync(
      PYTHON_BIN,
      [scriptPath, "--model", TOMATO_PRICE_MODEL_DIR, "--csv", csvPath, "--sample", String(sample)],
      { maxBuffer: 20 * 1024 * 1024 }
    );

    const lastLine = stdout
      .trim()
      .split(/\r?\n/)
      .reverse()
      .find(line => Boolean(line.trim()));
    const parsed = lastLine ? JSON.parse(lastLine) : { sample_predictions: [] };

    return res.json({ samplePredictions: parsed.sample_predictions || [] });
  } catch (err: any) {
    console.error("Tomato price sample prediction error:", err);
    return res.status(500).json({ error: err.message || "Tomato price prediction failed" });
  }
});

app.get("/api/iot/simulate", async (req, res) => {
  const hours = Math.min(Number(req.query.hours || 24), 168);
  const intervalMinutes = Math.max(Number(req.query.intervalMinutes || 30), 5);
  const stress = req.query.stress === "true";
  const readings = generateIoTReadings(hours, intervalMinutes, stress);
  const latest = readings[readings.length - 1];

  res.json({
    latest,
    assessment: assessIoTData(latest),
    readings
  });
});

app.get("/api/iot/stream", async (req, res) => {
  const intervalMs = Math.min(Math.max(Number(req.query.intervalMs || 2500), 1000), 60000);
  const stress = req.query.stress === "true";

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const sendReading = () => {
    const latest = createIoTReading(new Date(), stress);
    res.write(`data: ${JSON.stringify({
      latest,
      assessment: assessIoTData(latest),
      streamMode: stress ? "stress" : "normal"
    })}\n\n`);
  };

  sendReading();
  const timer = setInterval(sendReading, intervalMs);

  req.on("close", () => {
    clearInterval(timer);
    res.end();
  });
});

app.get("/api/blockchain/transactions/:txHash", async (req, res) => {
  try {
    const { provider } = await getCertificateContract();
    const receipt = await provider.getTransactionReceipt(req.params.txHash) as TransactionReceipt | null;
    if (!receipt) return res.status(404).json({ error: "Transaction not found" });

    res.json({
      txHash: receipt.hash,
      valid: receipt.status === 1,
      status: receipt.status === 1 ? "success" : "failed",
      blockNumber: receipt.blockNumber,
      contractAddress: getBlockchainConfig().contractAddress,
      gasUsed: receipt.gasUsed.toString(),
      explorerUrl: buildExplorerUrl(receipt.hash)
    });
  } catch (err: any) {
    res.status(503).json({ error: err.message });
  }
});

app.get("/api/certificates/:certificateId", async (req, res) => {
  if (String(req.headers.accept || "").includes("text/html")) {
    return res.redirect(302, `/certificate/${encodeURIComponent(req.params.certificateId)}`);
  }

  try {
    let farm;
    if (canUseDatabase()) {
      farm = await Farm.findOne({ "blockchain.certificateId": req.params.certificateId }).populate("farmerId", "name phone address");
    } else {
      farm = demoFarms.find(f => f.blockchain?.certificateId === req.params.certificateId);
    }

    if (!farm) return res.status(404).json({ error: "Certificate not found" });

    let transactionValid = false;
    if (farm.blockchain?.txHash && isBlockchainConfigured()) {
      const { provider } = await getCertificateContract();
      const receipt = await provider.getTransactionReceipt(farm.blockchain.txHash);
      transactionValid = receipt?.status === 1;
    }

    res.json({
      certificateId: req.params.certificateId,
      transactionValid,
      farm: prepareFarmForClient(farm)
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Public Stats and Farm Data
app.get("/api/stats/farms", async (req, res) => {
  try {
    let farmersCount, farmsCount;
    if (canUseDatabase()) {
      farmersCount = await User.countDocuments({ role: "farmer" });
      farmsCount = await Farm.countDocuments();
    } else {
      farmersCount = demoUsers.filter(u => u.role === "farmer").length;
      farmsCount = demoFarms.length;
    }
    res.json({ totalFarmers: farmersCount, totalFarms: farmsCount });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/farms/public", async (req, res) => {
  try {
    let farms;
    if (canUseDatabase()) {
      farms = await Farm.find().select("cropType soilType location status createdAt farmerId certificateHash blockchain qrCodes").populate("farmerId", "name");
    } else {
      farms = demoFarms.map(f => {
        const farmer = demoUsers.find(u => u._id.toString() === f.farmerId.toString());
        return {
          ...f,
          farmerName: farmer ? farmer.name : "Registered Farmer"
        };
      });
    }
    res.json(farms.map(prepareFarmForClient));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

if (await isPortAvailable(REQUESTED_PORT)) {
  activePort = REQUESTED_PORT;
} else if (ALLOW_PORT_FALLBACK) {
  activePort = await findAvailablePort(REQUESTED_PORT + 1);
  console.warn("");
  console.warn(`[AgriTrustra] Port ${REQUESTED_PORT} is busy. Switched to ${activePort}.`);
} else {
  throw new Error(
    `[AgriTrustra] Port ${REQUESTED_PORT} is already in use. Stop the existing Node process or set PORT to another value. ` +
    "Set ALLOW_PORT_FALLBACK=true only if you want automatic port switching."
  );
}

// Vite middleware
if (process.env.NODE_ENV !== "production") {
  const vite = await createViteServer({
    // Avoid loading vite.config.ts here because some Windows environments throw
    // spawn EPERM while Vite resolves the config file.
    configFile: false,
    root: __dirname,
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    // This app embeds Vite inside Express, so each fallback HTTP port gets a
    // paired HMR port instead of colliding on Vite's default WebSocket port.
    server: {
      middlewareMode: true,
      watch: {
        ignored: VITE_WATCH_IGNORES,
      },
      hmr: {
        host: "localhost",
        port: activePort + 10000,
      },
    },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  const distPath = path.join(process.cwd(), "dist");
  app.use(express.static(distPath));
  app.get("*", (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

// Demo seed data is opt-in only. Production/fallback storage must start empty.
if (!canUseDatabase() && process.env.SEED_DEMO_DATA === "true") {
  // Create demo farmers
  const demoFarmerId1 = new mongoose.Types.ObjectId();
  const demoFarmerId2 = new mongoose.Types.ObjectId();
  const demoFarmerId3 = new mongoose.Types.ObjectId();

  demoUsers.push(
    {
      _id: demoFarmerId1,
      phone: "9876543210",
      email: "farmer1@demo.com",
      password: "hashedpassword",
      role: "farmer",
      name: "Rajesh Kumar",
      address: "Punjab, India",
      verificationStatus: { emailVerified: true, otpVerified: true, verifiedAt: new Date() },
      createdAt: new Date()
    },
    {
      _id: demoFarmerId2,
      phone: "9876543211",
      email: "farmer2@demo.com",
      password: "hashedpassword",
      role: "farmer",
      name: "Priya Singh",
      address: "Haryana, India",
      verificationStatus: { emailVerified: true, otpVerified: true, verifiedAt: new Date() },
      createdAt: new Date()
    },
    {
      _id: demoFarmerId3,
      phone: "9876543212",
      email: "farmer3@demo.com",
      password: "hashedpassword",
      role: "farmer",
      name: "Amit Patel",
      address: "Maharashtra, India",
      verificationStatus: { emailVerified: true, otpVerified: true, verifiedAt: new Date() },
      createdAt: new Date()
    }
  );

  // Create demo farms
  demoFarms.push(
    {
      _id: new mongoose.Types.ObjectId(),
      farmerId: demoFarmerId1,
      cropType: "Tomato",
      soilType: "Loamy",
      location: { lat: 31.1471, lng: 75.3412 },
      cropPhoto: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='40' fill='%23EF4444'/%3E%3C/svg%3E",
      productImage: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='40' fill='%23DC2626'/%3E%3C/svg%3E",
      plantImage: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath d='M50 10 Q60 30 50 50 Q40 30 50 10' fill='%2316A34A'/%3E%3C/svg%3E",
      iotData: { moisture: 65, ph: 6.8, temperature: 28 },
      status: "certified",
      areaInHectares: 2.5,
      plantingDate: "2025-03-15",
      certificationDate: new Date(),
      blockchain: {
        certificateId: "CERT-2025-001",
        transactionHash: "0x123abc...",
        timestamp: Date.now()
      },
      qrCodes: ["QR-001"],
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      _id: new mongoose.Types.ObjectId(),
      farmerId: demoFarmerId1,
      cropType: "Wheat",
      soilType: "Clayey",
      location: { lat: 30.8812, lng: 75.6119 },
      cropPhoto: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect x='30' y='10' width='40' height='60' fill='%23D97706'/%3E%3C/svg%3E",
      productImage: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect x='20' y='20' width='60' height='60' fill='%23B45309'/%3E%3C/svg%3E",
      plantImage: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath d='M50 10 L45 50 M50 10 L50 50 M50 10 L55 50' stroke='%23D97706' stroke-width='2'/%3E%3C/svg%3E",
      iotData: { moisture: 55, ph: 7.2, temperature: 22 },
      status: "certified",
      areaInHectares: 4.0,
      plantingDate: "2025-10-01",
      certificationDate: new Date(),
      blockchain: {
        certificateId: "CERT-2025-002",
        transactionHash: "0x456def...",
        timestamp: Date.now()
      },
      qrCodes: ["QR-002"],
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      _id: new mongoose.Types.ObjectId(),
      farmerId: demoFarmerId2,
      cropType: "Cotton",
      soilType: "Sandy Loam",
      location: { lat: 19.7515, lng: 75.7139 },
      cropPhoto: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='30' fill='%23F5F5F5'/%3E%3C/svg%3E",
      productImage: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='35' fill='%23E5E5E5'/%3E%3C/svg%3E",
      plantImage: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath d='M50 10 Q70 40 50 70 Q30 40 50 10' fill='%2334D399'/%3E%3C/svg%3E",
      iotData: { moisture: 45, ph: 7.5, temperature: 32 },
      status: "certified",
      areaInHectares: 3.5,
      plantingDate: "2025-06-15",
      certificationDate: new Date(),
      blockchain: {
        certificateId: "CERT-2025-003",
        transactionHash: "0x789ghi...",
        timestamp: Date.now()
      },
      qrCodes: ["QR-003"],
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      _id: new mongoose.Types.ObjectId(),
      farmerId: demoFarmerId2,
      cropType: "Rice",
      soilType: "Loamy",
      location: { lat: 20.5937, lng: 78.9629 },
      cropPhoto: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect x='40' y='20' width='20' height='60' fill='%23FCD34D'/%3E%3C/svg%3E",
      productImage: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect x='30' y='30' width='40' height='40' fill='%23F59E0B'/%3E%3C/svg%3E",
      plantImage: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath d='M50 10 L48 50 M50 10 L50 50 M50 10 L52 50' stroke='%23FCD34D' stroke-width='2'/%3E%3C/svg%3E",
      iotData: { moisture: 75, ph: 6.5, temperature: 26 },
      status: "certified",
      areaInHectares: 2.0,
      plantingDate: "2025-07-20",
      certificationDate: new Date(),
      blockchain: {
        certificateId: "CERT-2025-004",
        transactionHash: "0xabc123...",
        timestamp: Date.now()
      },
      qrCodes: ["QR-004"],
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      _id: new mongoose.Types.ObjectId(),
      farmerId: demoFarmerId3,
      cropType: "Sugarcane",
      soilType: "Alluvial",
      location: { lat: 22.6345, lng: 88.4361 },
      cropPhoto: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect x='40' y='15' width='20' height='70' fill='%236D28D9'/%3E%3C/svg%3E",
      productImage: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect x='35' y='25' width='30' height='50' fill='%235B21B6'/%3E%3C/svg%3E",
      plantImage: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath d='M50 10 Q40 35 50 60 Q60 35 50 10' fill='%2322C55E'/%3E%3C/svg%3E",
      iotData: { moisture: 70, ph: 7.0, temperature: 28 },
      status: "certified",
      areaInHectares: 5.5,
      plantingDate: "2025-01-10",
      certificationDate: new Date(),
      blockchain: {
        certificateId: "CERT-2025-005",
        transactionHash: "0xdef456...",
        timestamp: Date.now()
      },
      qrCodes: ["QR-005"],
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      _id: new mongoose.Types.ObjectId(),
      farmerId: demoFarmerId3,
      cropType: "Mango",
      soilType: "Red Loamy",
      location: { lat: 19.0760, lng: 72.8777 },
      cropPhoto: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cellipse cx='52' cy='52' rx='28' ry='36' fill='%23FACC15'/%3E%3Cpath d='M42 22 Q55 6 68 22' fill='%2316A34A'/%3E%3C/svg%3E",
      productImage: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cellipse cx='50' cy='54' rx='30' ry='34' fill='%23F59E0B'/%3E%3Cpath d='M44 24 Q58 10 70 24' fill='%2322C55E'/%3E%3C/svg%3E",
      plantImage: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath d='M50 82 V28' stroke='%237C2D12' stroke-width='6'/%3E%3Cpath d='M50 28 Q30 20 22 42 Q44 44 50 28' fill='%2316A34A'/%3E%3Cpath d='M50 28 Q72 20 80 42 Q58 44 50 28' fill='%2322C55E'/%3E%3Ccircle cx='43' cy='52' r='8' fill='%23F59E0B'/%3E%3Ccircle cx='61' cy='50' r='8' fill='%23FACC15'/%3E%3C/svg%3E",
      iotData: { moisture: 62, ph: 6.6, temperature: 30 },
      status: "certified",
      areaInHectares: 3.2,
      plantingDate: "2025-02-12",
      certificationDate: new Date(),
      blockchain: {
        certificateId: "CERT-2025-006",
        transactionHash: "0xfed789...",
        timestamp: Date.now()
      },
      qrCodes: ["QR-006"],
      createdAt: new Date(),
      updatedAt: new Date()
    }
  );

  console.log(`[AgriTrustra] Initialized demo mode with ${demoFarms.length} farms and ${demoUsers.length} farmers`);
}

const server = app.listen(activePort, "0.0.0.0", () => {
  console.log("");
  console.log("=".repeat(56));
  console.log("[AgriTrustra] Development server is ready");
  console.log(`[AgriTrustra] Local URL: ${getAppUrl()}`);
  console.log(`[AgriTrustra] Network bind: http://0.0.0.0:${activePort}`);
  console.log("=".repeat(56));
  console.log("");
});

server.on("error", (err: NodeJS.ErrnoException) => {
  console.error(`Server failed to start on port ${activePort}: ${err.message}`);
  throw err;
});
