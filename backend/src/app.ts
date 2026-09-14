import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { env } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";
import { authRouter } from "./routes/auth.js";
import { tenantsRouter } from "./routes/tenants.js";
import { usersRouter } from "./routes/users.js";
import { patientsRouter } from "./routes/patients.js";
import { encountersRouter } from "./routes/encounters.js";
import { consultationsRouter, diagnosesRouter, vitalsRouter } from "./routes/consultations.js";
import { labRouter } from "./routes/lab.js";
import { inventoryRouter, pharmacyRouter } from "./routes/pharmacy.js";
import { chargesRouter, paymentsRouter, receiptsRouter, servicesRouter } from "./routes/billing.js";
import { reportsRouter } from "./routes/reports.js";
import { auditRouter, emailRouter, smsRouter } from "./routes/comms.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(
    cors({
      origin: env.frontendUrl.split(",").map((s) => s.trim()),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "1mb" }));

  const limiter = rateLimit({
    windowMs: env.rateLimitWindowMs,
    max: env.rateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
  });
  const authLimiter = rateLimit({
    windowMs: env.rateLimitWindowMs,
    max: env.authRateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "clinicflow-api", time: new Date().toISOString() });
  });

  const api = express.Router();
  api.use(limiter);
  api.use("/auth", authLimiter, authRouter);
  api.use("/tenants", tenantsRouter);
  api.use("/users", usersRouter);
  api.use("/patients", patientsRouter);
  api.use("/encounters", encountersRouter);
  api.use("/consultations", consultationsRouter);
  api.use("/vitals", vitalsRouter);
  api.use("/diagnoses", diagnosesRouter);
  api.use("/lab", labRouter);
  api.use("/pharmacy", pharmacyRouter);
  api.use("/inventory", inventoryRouter);
  api.use("/services", servicesRouter);
  api.use("/charges", chargesRouter);
  api.use("/payments", paymentsRouter);
  api.use("/receipts", receiptsRouter);
  api.use("/reports", reportsRouter);
  api.use("/sms", smsRouter);
  api.use("/email", emailRouter);
  api.use("/audit", auditRouter);

  app.use(env.apiPrefix, api);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
