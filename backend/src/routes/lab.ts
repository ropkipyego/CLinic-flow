import { LabOrderStatus } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { param } from "../lib/params.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { created, ok } from "../lib/response.js";
import {
  createLabOrder,
  createLabOrderSchema,
  getLabOrder,
  labQueue,
  labResultSchema,
  labTestSchema,
  listLabTests,
  patientLabResults,
  saveLabResult,
  updateLabOrderStatus,
  upsertLabTest,
} from "../services/labService.js";

export const labRouter = Router();
labRouter.use(authenticate);

labRouter.get(
  "/tests",
  authorize("ADMIN", "DOCTOR", "LAB"),
  asyncHandler(async (req, res) => ok(res, await listLabTests(req.user!.tenantId, req.query.active === "true"))),
);

labRouter.post(
  "/tests",
  authorize("ADMIN"),
  asyncHandler(async (req, res) => {
    const body = labTestSchema.parse(req.body);
    return created(res, await upsertLabTest(req.user!.tenantId, req.user!.id, body));
  }),
);

labRouter.patch(
  "/tests/:id",
  authorize("ADMIN"),
  asyncHandler(async (req, res) => {
    const body = labTestSchema.parse(req.body);
    return ok(res, await upsertLabTest(req.user!.tenantId, req.user!.id, body, param(req, "id")));
  }),
);

labRouter.get(
  "/queue",
  authorize("ADMIN", "LAB", "DOCTOR"),
  asyncHandler(async (req, res) => {
    const status = typeof req.query.status === "string" ? (req.query.status as LabOrderStatus) : undefined;
    return ok(res, await labQueue(req.user!.tenantId, status));
  }),
);

labRouter.post(
  "/orders/encounters/:encounterId",
  authorize("ADMIN", "DOCTOR"),
  asyncHandler(async (req, res) => {
    const body = createLabOrderSchema.parse(req.body);
    return created(res, await createLabOrder(req.user!.tenantId, req.user!.id, param(req, "encounterId"), body, req.ip));
  }),
);

labRouter.get(
  "/orders/:id",
  authorize("ADMIN", "LAB", "DOCTOR"),
  asyncHandler(async (req, res) => ok(res, await getLabOrder(req.user!.tenantId, param(req, "id")))),
);

labRouter.post(
  "/orders/:id/status",
  authorize("ADMIN", "LAB"),
  asyncHandler(async (req, res) => {
    const body = z.object({ status: z.nativeEnum(LabOrderStatus) }).parse(req.body);
    return ok(res, await updateLabOrderStatus(req.user!.tenantId, req.user!.id, param(req, "id"), body.status));
  }),
);

labRouter.post(
  "/results/items/:itemId",
  authorize("ADMIN", "LAB"),
  asyncHandler(async (req, res) => {
    const body = labResultSchema.parse(req.body);
    return created(res, await saveLabResult(req.user!.tenantId, req.user!.id, param(req, "itemId"), body, req.ip));
  }),
);

labRouter.get(
  "/results/patients/:patientId",
  authorize("ADMIN", "LAB", "DOCTOR"),
  asyncHandler(async (req, res) => ok(res, await patientLabResults(req.user!.tenantId, param(req, "patientId")))),
);
