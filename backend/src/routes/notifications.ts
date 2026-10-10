import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { param } from "../lib/params.js";
import { authenticate } from "../middleware/auth.js";
import { ok } from "../lib/response.js";
import { listInbox, markInboxRead } from "../services/notificationService.js";

export const notificationsRouter = Router();
notificationsRouter.use(authenticate);

notificationsRouter.get(
  "/",
  asyncHandler(async (req, res) => ok(res, await listInbox(req.user!.tenantId, req.user!.id))),
);

notificationsRouter.post(
  "/:id/read",
  asyncHandler(async (req, res) => ok(res, await markInboxRead(req.user!.tenantId, req.user!.id, param(req, "id")))),
);
