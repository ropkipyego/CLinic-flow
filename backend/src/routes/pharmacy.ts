import { Router, type NextFunction, type Request, type Response } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { param } from "../lib/params.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { created, ok } from "../lib/response.js";
import { z } from "zod";
import { assertOpeningStockWritesAllowed } from "../lib/catalogueWriteGuard.js";
import { badRequest } from "../lib/errors.js";
import { suggestHeaderMapping } from "../lib/catalogueHeaders.js";
import { createHash } from "node:crypto";
import multer from "multer";
import { readXlsxRowsFromBuffer } from "../lib/xlsxRows.js";
import { parseCsv } from "../lib/csv.js";
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
  removeMedicine,
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
  parseCatalogueUpload,
  serializeCatalogueReport,
  type HeaderMapping,
} from "../services/pharmacyCatalogueImport.js";

const catalogueUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
});

function optionalCatalogueFile(req: Request, res: Response, next: NextFunction) {
  const type = req.headers["content-type"] || "";
  if (type.includes("multipart/form-data")) {
    return catalogueUpload.single("file")(req, res, next);
  }
  next();
}

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

pharmacyRouter.delete(
  "/medicines/:id",
  authorize("ADMIN", "PHARMACY"),
  asyncHandler(async (req, res) =>
    ok(res, await removeMedicine(req.user!.tenantId, req.user!.id, param(req, "id"))),
  ),
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
  optionalCatalogueFile,
  asyncHandler(async (req, res) => {
    const file = req.file;
    if (!file?.buffer?.length) throw badRequest("Upload a CSV or Excel (.xlsx) catalogue file.");
    const filename = file.originalname || "catalogue.xlsx";
    const raw = filename.toLowerCase().endsWith(".xlsx")
      ? readXlsxRowsFromBuffer(file.buffer)
      : parseCsv(file.buffer.toString("utf8").replace(/^\uFEFF/, "")).rows;
    const headers = raw[0] ? Object.keys(raw[0]).filter(Boolean) : [];
    return ok(res, {
      headers,
      rowCount: raw.length,
      sampleRows: raw.slice(0, 8),
      suggestedMapping: suggestHeaderMapping(headers),
    });
  }),
);

pharmacyRouter.post(
  "/catalogue/import",
  authorize("ADMIN"),
  optionalCatalogueFile,
  asyncHandler(async (req, res) => {
    const file = req.file;
    const mappingRaw = typeof req.body?.mapping === "string" ? JSON.parse(req.body.mapping) : req.body?.mapping;
    const mapping = mappingRaw as HeaderMapping | undefined;
    const dryRun =
      req.body?.dryRun === false || req.body?.dryRun === "false" ? false : true;
    let rows;
    let sourceFilename = typeof req.body?.sourceFilename === "string" ? req.body.sourceFilename : null;
    let sourceHash = typeof req.body?.sourceHash === "string" ? req.body.sourceHash : null;
    if (file?.buffer?.length) {
      sourceFilename = sourceFilename || file.originalname;
      sourceHash = sourceHash || createHash("sha256").update(file.buffer).digest("hex");
      rows = parseCatalogueUpload(file.buffer, file.originalname || "catalogue.csv", mapping);
    } else {
      const body = catalogueImportBody.parse(req.body);
      rows = body.csvText
        ? parseCatalogueCsv(body.csvText, mapping).rows
        : parseCatalogueRows(body.rows ?? [], mapping);
      sourceFilename = body.sourceFilename ?? sourceFilename;
      sourceHash = body.sourceHash ?? sourceHash;
    }
    if (rows.length > 8000) {
      throw badRequest("Catalogue import is limited to 8000 rows.");
    }
    const report = await importPharmacyCatalogue({
      tenantId: req.user!.tenantId,
      actorId: req.user!.id,
      actorRole: req.user!.role,
      rows,
      dryRun,
      sourceFilename,
      sourceHash,
    });
    return ok(res, serializeCatalogueReport(report));
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
