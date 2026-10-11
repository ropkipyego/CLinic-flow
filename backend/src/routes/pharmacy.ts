import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { param } from "../lib/params.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { created, ok } from "../lib/response.js";
import { z } from "zod";
import { env } from "../config/env.js";
import { badRequest } from "../lib/errors.js";
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
  importMedicines,
  importMedicinesSchema,
  sellingPricePatchSchema,
  updateMedicineSellingPrice,
} from "../services/pharmacyService.js";
import { importPharmacyCatalogue, parseCatalogueRows } from "../services/pharmacyCatalogueImport.js";

export const pharmacyRouter = Router();
pharmacyRouter.use(authenticate);

pharmacyRouter.get(
  "/medicines",
  authorize("ADMIN", "PHARMACY", "DOCTOR"),
  asyncHandler(async (req, res) =>
    ok(
      res,
      await listMedicines(req.user!.tenantId, {
        lowStock: req.query.lowStock === "true",
        activeOnly: req.query.active === "true",
        q: typeof req.query.q === "string" ? req.query.q : undefined,
      }),
    ),
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
  "/medicines/:id/price",
  authorize("ADMIN", "PHARMACY"),
  asyncHandler(async (req, res) =>
    ok(
      res,
      await updateMedicineSellingPrice(
        req.user!.tenantId,
        req.user!.id,
        param(req, "id"),
        sellingPricePatchSchema.parse(req.body).sellingPrice,
      ),
    ),
  ),
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


pharmacyRouter.post(
  "/medicines/import",
  authorize("ADMIN", "PHARMACY"),
  asyncHandler(async (req, res) =>
    created(res, await importMedicines(req.user!.tenantId, req.user!.id, importMedicinesSchema.parse(req.body))),
  ),
);

const catalogueImportBody = z.object({
  rows: z.array(z.record(z.string(), z.any())),
  dryRun: z.boolean().optional(),
});

pharmacyRouter.post(
  "/catalogue/import",
  authorize("ADMIN"),
  asyncHandler(async (req, res) => {
    const body = catalogueImportBody.parse(req.body);
    const dryRun = body.dryRun !== false;
    if (!dryRun && (env.isProduction || !env.catalogueImportWrite)) {
      throw badRequest(
        "Catalogue write is blocked. Run a dry-run, review the report, then set CATALOGUE_IMPORT_WRITE=true in a non-production approval window. Workbook quantities are never imported.",
      );
    }
    const rows = parseCatalogueRows(body.rows);
    const report = await importPharmacyCatalogue({
      tenantId: req.user!.tenantId,
      actorId: req.user!.id,
      rows,
      dryRun,
    });
    return ok(res, report);
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
