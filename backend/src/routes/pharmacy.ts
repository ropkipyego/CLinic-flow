import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { param } from "../lib/params.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { created, ok } from "../lib/response.js";
import {
  createPrescription,
  dispensePrescription,
  dispenseSchema,
  getPrescription,
  listMedicines,
  medicineSchema,
  pharmacyQueue,
  prescriptionSchema,
  recordStockMovement,
  stockMovementSchema,
  upsertMedicine,
  listStockMovements,
  otcSaleSchema,
  sellOtc,
} from "../services/pharmacyService.js";

export const pharmacyRouter = Router();
pharmacyRouter.use(authenticate);

pharmacyRouter.get(
  "/medicines",
  authorize("ADMIN", "PHARMACY", "DOCTOR"),
  asyncHandler(async (req, res) =>
    ok(res, await listMedicines(req.user!.tenantId, { lowStock: req.query.lowStock === "true", activeOnly: req.query.active === "true" })),
  ),
);

pharmacyRouter.post(
  "/medicines",
  authorize("ADMIN", "PHARMACY"),
  asyncHandler(async (req, res) => {
    const body = medicineSchema.parse(req.body);
    return created(res, await upsertMedicine(req.user!.tenantId, req.user!.id, body));
  }),
);

pharmacyRouter.patch(
  "/medicines/:id",
  authorize("ADMIN", "PHARMACY"),
  asyncHandler(async (req, res) => {
    const body = medicineSchema.parse(req.body);
    return ok(res, await upsertMedicine(req.user!.tenantId, req.user!.id, body, param(req, "id")));
  }),
);

pharmacyRouter.get(
  "/queue",
  authorize("ADMIN", "PHARMACY"),
  asyncHandler(async (req, res) => ok(res, await pharmacyQueue(req.user!.tenantId))),
);

pharmacyRouter.post(
  "/prescriptions/encounters/:encounterId",
  authorize("ADMIN", "DOCTOR"),
  asyncHandler(async (req, res) => {
    const body = prescriptionSchema.parse(req.body);
    return created(res, await createPrescription(req.user!.tenantId, req.user!.id, param(req, "encounterId"), body, req.ip));
  }),
);

pharmacyRouter.get(
  "/prescriptions/:id",
  authorize("ADMIN", "PHARMACY", "DOCTOR"),
  asyncHandler(async (req, res) => ok(res, await getPrescription(req.user!.tenantId, param(req, "id")))),
);

pharmacyRouter.post(
  "/prescriptions/:id/dispense",
  authorize("ADMIN", "PHARMACY"),
  asyncHandler(async (req, res) => {
    const body = dispenseSchema.parse(req.body);
    return created(
      res,
      await dispensePrescription(req.user!.tenantId, req.user!.id, req.user!.role, param(req, "id"), body, req.ip),
    );
  }),
);

pharmacyRouter.post(
  "/otc",
  authorize("ADMIN", "PHARMACY"),
  asyncHandler(async (req, res) => {
    const body = otcSaleSchema.parse(req.body);
    return created(res, await sellOtc(req.user!.tenantId, req.user!.id, req.user!.role, body, req.ip));
  }),
);

export const inventoryRouter = Router();
inventoryRouter.use(authenticate, authorize("ADMIN", "PHARMACY"));

inventoryRouter.get(
  "/movements",
  asyncHandler(async (req, res) => {
    const medicineId = typeof req.query.medicineId === "string" ? req.query.medicineId : undefined;
    return ok(res, await listStockMovements(req.user!.tenantId, medicineId));
  }),
);

inventoryRouter.post(
  "/movements",
  asyncHandler(async (req, res) => {
    const body = stockMovementSchema.parse(req.body);
    return created(res, await recordStockMovement(req.user!.tenantId, req.user!.id, req.user!.role, body, req.ip));
  }),
);
