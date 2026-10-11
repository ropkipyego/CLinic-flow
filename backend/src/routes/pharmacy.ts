import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { param } from "../lib/params.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { created, ok } from "../lib/response.js";
import { z } from "zod";
import { assertOpeningStockWritesAllowed } from "../lib/catalogueWriteGuard.js";
import { badRequest } from "../lib/errors.js";
import { suggestHeaderMapping } from "../lib/catalogueHeaders.js";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readXlsxRowsFromFile } from "../lib/xlsxRows.js";
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
import {
  importOpeningStock,
  importPharmacyCatalogue,
  parseCatalogueCsv,
  parseCatalogueRows,
  type HeaderMapping,
} from "../services/pharmacyCatalogueImport.js";

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
  authorize("ADMIN"),
  asyncHandler(async (req, res) => {
    return created(
      res,
      await importMedicines(req.user!.tenantId, req.user!.id, req.user!.role, importMedicinesSchema.parse(req.body)),
    );
  }),
);

const catalogueImportBody = z.object({
  rows: z.array(z.record(z.string(), z.any())).optional(),
  csvText: z.string().optional(),
  mapping: z.record(z.string(), z.string()).optional(),
  dryRun: z.boolean().optional(),
  sourceFilename: z.string().optional().nullable(),
  sourceHash: z.string().optional().nullable(),
});

pharmacyRouter.post(
  "/catalogue/parse",
  authorize("ADMIN", "PHARMACY"),
  asyncHandler(async (req, res) => {
    const body = z.object({ csvText: z.string().min(1) }).parse(req.body);
    const parsed = parseCatalogueCsv(body.csvText);
    return ok(res, parsed);
  }),
);

pharmacyRouter.post(
  "/catalogue/parse-workbook",
  authorize("ADMIN"),
  asyncHandler(async (req, res) => {
    const body = z.object({ xlsxBase64: z.string().min(20) }).parse(req.body);
    const dir = mkdtempSync(join(tmpdir(), "clinicflow-xlsx-"));
    const file = join(dir, "catalogue.xlsx");
    try {
      writeFileSync(file, Buffer.from(body.xlsxBase64, "base64"));
      const raw = readXlsxRowsFromFile(file);
      const headers = raw[0] ? Object.keys(raw[0]) : [];
      return ok(res, {
        headers,
        rows: raw,
        suggestedMapping: suggestHeaderMapping(headers),
        parsedRows: parseCatalogueRows(raw),
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }),
);

pharmacyRouter.post(
  "/catalogue/import",
  authorize("ADMIN"),
  asyncHandler(async (req, res) => {
    const body = catalogueImportBody.parse(req.body);
    const dryRun = body.dryRun !== false;
    const mapping = body.mapping as HeaderMapping | undefined;
    const rows = body.csvText
      ? parseCatalogueCsv(body.csvText, mapping).rows
      : parseCatalogueRows(body.rows ?? [], mapping);
    if (rows.length > 5000) {
      throw badRequest("Catalogue import is limited to 5000 rows.");
    }
    const report = await importPharmacyCatalogue({
      tenantId: req.user!.tenantId,
      actorId: req.user!.id,
      actorRole: req.user!.role,
      rows,
      dryRun,
      sourceFilename: body.sourceFilename,
      sourceHash: body.sourceHash,
    });
    return ok(res, report);
  }),
);

pharmacyRouter.post(
  "/catalogue/opening-stock",
  authorize("ADMIN", "PHARMACY"),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        csvText: z.string().optional(),
        rows: z.array(z.record(z.string(), z.any())).optional(),
        mapping: z.record(z.string(), z.string()).optional(),
        reason: z.string().min(3),
        dryRun: z.boolean().optional(),
        sourceFilename: z.string().optional().nullable(),
        sourceHash: z.string().min(8),
      })
      .parse(req.body);
    const dryRun = body.dryRun !== false;
    if (!dryRun) assertOpeningStockWritesAllowed();
    const mapping = body.mapping as HeaderMapping | undefined;
    const rows = body.csvText
      ? parseCatalogueCsv(body.csvText, mapping).rows
      : parseCatalogueRows(body.rows ?? [], mapping);
    return ok(
      res,
      await importOpeningStock({
        tenantId: req.user!.tenantId,
        actorId: req.user!.id,
        role: req.user!.role,
        rows,
        reason: body.reason,
        dryRun,
        sourceFilename: body.sourceFilename,
        sourceHash: body.sourceHash,
      }),
    );
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
