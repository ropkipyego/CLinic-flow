import fs from "node:fs";
import path from "node:path";
import { config as loadEnv } from "dotenv";

const cwd = process.cwd();
const nodeEnv = process.env.NODE_ENV || "development";

const candidates = [
  path.resolve(cwd, "..", `.env.${nodeEnv}`),
  path.resolve(cwd, `.env.${nodeEnv}`),
  path.resolve(cwd, "..", ".env"),
  path.resolve(cwd, ".env"),
];

for (const file of candidates) {
  if (fs.existsSync(file)) {
    loadEnv({ path: file, override: false });
  }
}

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function bool(name: string, fallback = false): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return raw === "true" || raw === "1";
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const env = {
  nodeEnv,
  isProduction: nodeEnv === "production",
  isDevelopment: nodeEnv === "development",
  appName: process.env.APP_NAME || "ClinicFlow",
  port: num("APP_PORT", 4000),
  appUrl: process.env.APP_URL || "http://localhost:4000",
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:5174",
  apiPrefix: process.env.API_PREFIX || "/api/v1",
  databaseUrl: required("DATABASE_URL", "postgresql://clinicflow:clinicflow@localhost:5432/clinicflow"),
  jwtSecret: required("JWT_SECRET", "dev-only-not-a-real-secret-change-before-any-deploy"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "8h",
  passwordResetMinutes: num("PASSWORD_RESET_EXPIRES_MINUTES", 30),
  bcryptRounds: num("BCRYPT_ROUNDS", 12),
  rateLimitWindowMs: num("RATE_LIMIT_WINDOW_MS", 60_000),
  rateLimitMax: num("RATE_LIMIT_MAX", 120),
  authRateLimitMax: num("AUTH_RATE_LIMIT_MAX", 20),
  email: {
    enabled: bool("EMAIL_ENABLED", false),
    provider: process.env.EMAIL_PROVIDER || "",
    host: process.env.EMAIL_HOST || "",
    port: num("EMAIL_PORT", 587),
    username: process.env.EMAIL_USERNAME || "",
    password: process.env.EMAIL_PASSWORD || "",
    from: process.env.EMAIL_FROM || "",
    fromName: process.env.EMAIL_FROM_NAME || "ClinicFlow",
  },
  sms: {
    enabled: bool("SMS_ENABLED", false),
    provider: process.env.SMS_PROVIDER || "",
    apiUrl: process.env.SMS_API_URL || "",
    apiKey: process.env.SMS_API_KEY || "",
    username: process.env.SMS_USERNAME || "",
    password: process.env.SMS_PASSWORD || "",
    senderId: process.env.SMS_SENDER_ID || "",
  },
  storage: {
    provider: process.env.STORAGE_PROVIDER || "local",
    localDir: process.env.STORAGE_LOCAL_DIR || "./uploads",
    bucket: process.env.STORAGE_BUCKET || "",
    region: process.env.STORAGE_REGION || "",
    accessKey: process.env.STORAGE_ACCESS_KEY || "",
    secretKey: process.env.STORAGE_SECRET_KEY || "",
    publicUrl: process.env.STORAGE_PUBLIC_URL || "",
  },
  smsWorkerPollMs: num("SMS_WORKER_POLL_MS", 3000),
  smsMaxAttempts: num("SMS_MAX_ATTEMPTS", 3),
  seedOnStart: bool("SEED_ON_START", false),
};

if (env.isDevelopment && (env.email.enabled || env.sms.enabled)) {
  if (process.env.ALLOW_DEV_MESSAGING !== "true") {
    env.email.enabled = false;
    env.sms.enabled = false;
  }
}

if (env.isProduction && env.jwtSecret.includes("dev-only")) {
  throw new Error("Production JWT_SECRET must be set to a strong unique value.");
}

if (env.isProduction && env.seedOnStart) {
  throw new Error("SEED_ON_START cannot be enabled in production.");
}
