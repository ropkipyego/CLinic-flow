import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { param } from "../lib/params.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { created, ok } from "../lib/response.js";
import { getService, listServices, serviceSchema, upsertService } from "../services/catalogService.js";
import {
  addManualCharge,
  cashierToday,
  encounterBilling,
  getReceipt,
  listCharges,
  manualChargeSchema,
  receivePayment,
  receivePaymentSchema,
} from "../services/billingService.js";

export const servicesRouter = Router();
servicesRouter.use(authenticate);

servicesRouter.get(
  "/",
  authorize("ADMIN", "RECEPTION", "DOCTOR", "CASHIER", "LAB", "PHARMACY"),
  asyncHandler(async (req, res) => ok(res, await listServices(req.user!.tenantId, req.query.active === "true"))),
);

servicesRouter.post(
  "/",
  authorize("ADMIN"),
  asyncHandler(async (req, res) => created(res, await upsertService(req.user!.tenantId, req.user!.id, serviceSchema.parse(req.body)))),
);

servicesRouter.patch(
  "/:id",
  authorize("ADMIN"),
  asyncHandler(async (req, res) =>
    ok(res, await upsertService(req.user!.tenantId, req.user!.id, serviceSchema.parse(req.body), param(req, "id"))),
  ),
);

servicesRouter.get(
  "/:id",
  authorize("ADMIN"),
  asyncHandler(async (req, res) => ok(res, await getService(req.user!.tenantId, param(req, "id")))),
);

export const chargesRouter = Router();
chargesRouter.use(authenticate, authorize("ADMIN", "CASHIER"));
chargesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const encounterId = typeof req.query.encounterId === "string" ? req.query.encounterId : undefined;
    return ok(res, await listCharges(req.user!.tenantId, encounterId));
  }),
);

chargesRouter.post(
  "/encounters/:encounterId",
  asyncHandler(async (req, res) => {
    const body = manualChargeSchema.parse(req.body);
    return created(res, await addManualCharge(req.user!.tenantId, req.user!.id, param(req, "encounterId"), body, req.ip));
  }),
);

export const paymentsRouter = Router();
paymentsRouter.use(authenticate, authorize("ADMIN", "CASHIER"));

paymentsRouter.get(
  "/today",
  asyncHandler(async (req, res) => ok(res, await cashierToday(req.user!.tenantId))),
);

paymentsRouter.get(
  "/encounters/:encounterId",
  asyncHandler(async (req, res) => ok(res, await encounterBilling(req.user!.tenantId, param(req, "encounterId")))),
);

paymentsRouter.post(
  "/encounters/:encounterId",
  asyncHandler(async (req, res) => {
    const body = receivePaymentSchema.parse(req.body);
    const result = await receivePayment(req.user!.tenantId, req.user!.id, param(req, "encounterId"), body, req.ip);
    if (result.replayed) return ok(res, result);
    return created(res, result);
  }),
);

export const receiptsRouter = Router();
receiptsRouter.use(authenticate, authorize("ADMIN", "CASHIER"));
receiptsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => ok(res, await getReceipt(req.user!.tenantId, param(req, "id")))),
);
