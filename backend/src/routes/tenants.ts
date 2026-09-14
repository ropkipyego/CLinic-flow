import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { ok } from "../lib/response.js";
import { getTenant, updateTenant, updateTenantSchema } from "../services/tenantService.js";

export const tenantsRouter = Router();
tenantsRouter.use(authenticate);

tenantsRouter.get(
  "/current",
  asyncHandler(async (req, res) => ok(res, await getTenant(req.user!.tenantId))),
);

tenantsRouter.patch(
  "/current",
  authorize("ADMIN"),
  asyncHandler(async (req, res) => {
    const body = updateTenantSchema.parse(req.body);
    return ok(res, await updateTenant(req.user!.tenantId, req.user!.id, body, req.ip));
  }),
);
