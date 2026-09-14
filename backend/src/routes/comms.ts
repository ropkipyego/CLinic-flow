import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { param } from "../lib/params.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { created, ok } from "../lib/response.js";
import { prisma } from "../lib/prisma.js";
import {
  campaignSchema,
  createCampaign,
  getCampaign,
  listCampaigns,
  previewCampaign,
  queueCampaign,
} from "../services/smsCampaignService.js";
import { emailPublicConfig } from "../services/email/index.js";
import { smsPublicConfig } from "../services/sms/index.js";

export const smsRouter = Router();
smsRouter.use(authenticate, authorize("ADMIN"));

smsRouter.get("/status", asyncHandler(async (_req, res) => ok(res, smsPublicConfig())));

smsRouter.get(
  "/campaigns",
  asyncHandler(async (req, res) => ok(res, await listCampaigns(req.user!.tenantId))),
);

smsRouter.post(
  "/campaigns",
  asyncHandler(async (req, res) => {
    const body = campaignSchema.parse(req.body);
    return created(res, await createCampaign(req.user!.tenantId, req.user!.id, body));
  }),
);

smsRouter.get(
  "/campaigns/:id",
  asyncHandler(async (req, res) => ok(res, await getCampaign(req.user!.tenantId, param(req, "id")))),
);

smsRouter.post(
  "/campaigns/:id/queue",
  asyncHandler(async (req, res) => ok(res, await queueCampaign(req.user!.tenantId, req.user!.id, param(req, "id")))),
);

smsRouter.post(
  "/preview",
  asyncHandler(async (req, res) => {
    const body = z.object({ message: z.string(), recipients: z.array(z.string()) }).parse(req.body);
    return ok(res, previewCampaign(body.message, body.recipients));
  }),
);

export const emailRouter = Router();
emailRouter.use(authenticate, authorize("ADMIN"));
emailRouter.get("/status", asyncHandler(async (_req, res) => ok(res, emailPublicConfig())));
emailRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const records = await prisma.emailRecord.findMany({
      where: { tenantId: req.user!.tenantId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return ok(res, records);
  }),
);

export const auditRouter = Router();
auditRouter.use(authenticate, authorize("ADMIN"));
auditRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const logs = await prisma.auditLog.findMany({
      where: { tenantId: req.user!.tenantId },
      include: { user: { select: { firstName: true, lastName: true, email: true, role: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return ok(res, logs);
  }),
);
