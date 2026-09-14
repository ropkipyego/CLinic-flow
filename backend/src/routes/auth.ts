import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate } from "../middleware/auth.js";
import { ok } from "../lib/response.js";
import { forgotPasswordSchema, login, loginSchema, requestPasswordReset, resetPassword, resetPasswordSchema } from "../services/authService.js";
import { getTenant } from "../services/tenantService.js";
import { emailPublicConfig } from "../services/email/index.js";
import { smsPublicConfig } from "../services/sms/index.js";

export const authRouter = Router();

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const body = loginSchema.parse(req.body);
    const result = await login(body, req.ip);
    return ok(res, result);
  }),
);

authRouter.post(
  "/forgot-password",
  asyncHandler(async (req, res) => {
    const body = forgotPasswordSchema.parse(req.body);
    return ok(res, await requestPasswordReset(body));
  }),
);

authRouter.post(
  "/reset-password",
  asyncHandler(async (req, res) => {
    const body = resetPasswordSchema.parse(req.body);
    return ok(res, await resetPassword(body));
  }),
);

authRouter.get(
  "/me",
  authenticate,
  asyncHandler(async (req, res) => {
    const tenant = await getTenant(req.user!.tenantId);
    return ok(res, {
      user: req.user,
      tenant,
      messaging: { email: emailPublicConfig(), sms: smsPublicConfig() },
    });
  }),
);
