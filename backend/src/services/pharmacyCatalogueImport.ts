import { createHash } from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { writeAudit } from "../lib/audit.js";
import { badRequest, conflict } from "../lib/errors.js";
import { parseCsv } from "../lib/csv.js";
import { isUniqueConstraintError } from "../lib/prismaErrors.js";
import { assertCatalogueWritesAllowed } from "../lib/catalogueWriteGuard.js";
import {
  mappingNeedsReview,
  resolveHeaderMapping,
  suggestHeaderMapping,
  type HeaderMapping,
} from "../lib/catalogueHeaders.js";
import { moveStock } from "./pharmacyService.js";

export {
  CATALOGUE_FIELD_ALIASES,
  mappingNeedsReview,
  resolveHeaderMapping,
  suggestHeaderMapping,
  type CatalogueField,
  type HeaderMapping,
} from "../lib/catalogueHeaders.js";

export type CatalogueSourceRow = {
  name: string;
  quantity: number | null;
  quantityRaw: string;
  aten: string;
  costPrice: number | null;
  costRaw: string;
  sellingPrice: number | null;
  sellingRaw: string;
  description: string;
  unit: string;
  genericName: string;
  strength: string;
  dosageForm: string;
  category: string;
  manufacturer: string;
  rowNumber: number;
};

export type CataloguePreviewRow = CatalogueSourceRow & {
  errors: string[];
  warnings: string[];
  action: "create" | "update" | "match" | "skip" | "reject";
  matchMedicineId: string | null;
  matchName: string | null;
};

export type CatalogueImportReport = {
  sourceRows: number;
  validCatalogueItems: number;
  created: number;
  updated: number;
  matched: number;
  skipped: number;
  rejected: number;
  unresolved: number;
  missingSellingPrice: number;
  zeroSellingPrice: number;
  zeroQuantity: number;
  stockChangesProposed: 0;
  issues: Array<{ row: number; item: string; code: string; detail: string }>;
  preview: CataloguePreviewRow[];
  dryRun: boolean;
  sourceFilename: string | null;
};

function parseMoney(raw: string): { value: number | null; error?: string; blank: boolean } {
  const trimmed = raw.trim();
  if (trimmed === "") return { value: null, blank: true };
  const n = Number(trimmed.replace(/,/g, ""));
  if (!Number.isFinite(n)) return { value: null, blank: false, error: `Malformed amount "${raw}".` };
  if (n < 0) return { value: null, blank: false, error: "Amount cannot be negative." };
  return { value: n, blank: false };
}

function parseQty(raw: string): { value: number | null; error?: string; blank: boolean } {
  const trimmed = raw.trim();
  if (trimmed === "") return { value: null, blank: true };
  if (!/^-?\d+$/.test(trimmed.replace(/,/g, ""))) {
    return { value: null, blank: false, error: `Quantity must be a whole number (got "${raw}").` };
  }
  const n = Number(trimmed.replace(/,/g, ""));
  if (!Number.isInteger(n)) return { value: null, blank: false, error: `Quantity must be a whole number (got "${raw}").` };
  if (n < 0) return { value: null, blank: false, error: "Quantity cannot be negative." };
  return { value: n, blank: false };
}

function cell(row: Record<string, string>, header?: string): string {
  if (!header) return "";
  return row[header] ?? "";
}

export function parseCatalogueRows(
  rows: Record<string, unknown>[],
  mapping?: HeaderMapping,
): CatalogueSourceRow[] {
  const headers = rows[0] ? Object.keys(rows[0]) : [];
  const map = resolveHeaderMapping(headers, mapping);
  return rows.map((raw, i) => {
    const rec: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) rec[k] = v == null ? "" : String(v);
    const qty = parseQty(cell(rec, map.quantity));
    const cost = parseMoney(cell(rec, map.costPrice));
    const sell = parseMoney(cell(rec, map.sellingPrice));
    return {
      name: cell(rec, map.name).trim(),
      quantity: qty.error ? null : qty.value,
      quantityRaw: cell(rec, map.quantity),
      aten: cell(rec, map.aten).trim(),
      costPrice: cost.error ? Number.NaN : cost.value,
      costRaw: cell(rec, map.costPrice),
      sellingPrice: sell.error ? Number.NaN : sell.value,
      sellingRaw: cell(rec, map.sellingPrice),
      description: cell(rec, map.description).trim(),
      unit: cell(rec, map.unit).trim(),
      genericName: cell(rec, map.genericName).trim(),
      strength: cell(rec, map.strength).trim(),
      dosageForm: cell(rec, map.dosageForm).trim(),
      category: cell(rec, map.category).trim() || cell(rec, map.description).trim(),
      manufacturer: cell(rec, map.manufacturer).trim(),
      rowNumber: i + 2,
      _qtyError: qty.error,
      _costError: cost.error,
      _sellError: sell.error,
    } as CatalogueSourceRow & { _qtyError?: string; _costError?: string; _sellError?: string };
  });
}

export function parseCatalogueCsv(text: string, mapping?: HeaderMapping) {
  const { headers, rows } = parseCsv(text);
  return {
    headers,
    suggestedMapping: suggestHeaderMapping(headers),
    mappingNeedsReview: mappingNeedsReview(headers, resolveHeaderMapping(headers, mapping)),
    rows: parseCatalogueRows(rows, resolveHeaderMapping(headers, mapping)),
  };
}

function skuFromName(name: string) {
  const slug = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
  const hash = createHash("sha1").update(name).digest("hex").slice(0, 6);
  return `CF-${slug || "ITEM"}-${hash}`.slice(0, 40);
}

export function sourceKey(name: string, aten: string) {
  if (aten.trim()) return `aten:${aten.trim()}`;
  return `name:${name.trim().toLowerCase()}`;
}

function asRow(row: CatalogueSourceRow) {
  return row as CatalogueSourceRow & { _qtyError?: string; _costError?: string; _sellError?: string };
}

async function findMatches(tenantId: string, row: CatalogueSourceRow) {
  if (row.aten) {
    const bySku = await prisma.medicine.findMany({
      where: { tenantId, sku: { equals: row.aten, mode: "insensitive" } },
    });
    if (bySku.length) return bySku;
  }
  return prisma.medicine.findMany({
    where: { tenantId, name: { equals: row.name, mode: "insensitive" } },
  });
}

export async function previewCatalogueImport(opts: {
  tenantId: string;
  rows: CatalogueSourceRow[];
}): Promise<CataloguePreviewRow[]> {
  const atenCounts = new Map<string, number[]>();
  const nameCounts = new Map<string, number[]>();
  for (const row of opts.rows) {
    if (row.aten) {
      const k = row.aten.toLowerCase();
      atenCounts.set(k, [...(atenCounts.get(k) || []), row.rowNumber]);
    } else if (row.name) {
      const k = row.name.toLowerCase();
      nameCounts.set(k, [...(nameCounts.get(k) || []), row.rowNumber]);
    }
  }
  const preview: CataloguePreviewRow[] = [];

  for (const row of opts.rows) {
    const extra = asRow(row);
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!row.name) errors.push("Drug name is required.");
    if (extra._qtyError) errors.push(extra._qtyError);
    if (extra._costError) errors.push(extra._costError);
    if (extra._sellError) errors.push(extra._sellError);
    if (row.aten) {
      const rows = atenCounts.get(row.aten.toLowerCase()) || [];
      if (rows.length > 1) errors.push(`ATEN/SKU "${row.aten}" is duplicated in this file (rows ${rows.join(", ")}).`);
    } else if (row.name) {
      const rows = nameCounts.get(row.name.toLowerCase()) || [];
      if (rows.length > 1) errors.push(`Drug name "${row.name}" is duplicated in this file (rows ${rows.join(", ")}).`);
    }

    const matches = row.name && !errors.length ? await findMatches(opts.tenantId, row) : [];
    let action: CataloguePreviewRow["action"] = "create";
    let matchMedicineId: string | null = null;
    let matchName: string | null = null;
    if (errors.length) action = "reject";
    else if (matches.length > 1) {
      action = "reject";
      errors.push(`Matches ${matches.length} existing medicines; not merged.`);
    } else if (matches.length === 1) {
      action = "update";
      matchMedicineId = matches[0]!.id;
      matchName = matches[0]!.name;
    }
    if (row.sellingPrice === null && !extra._sellError) {
      warnings.push("Selling price is blank. Cost will not be copied. Item will need a selling price before dispensing.");
    }
    if (row.sellingPrice === 0) {
      warnings.push("Selling price is 0 (distinct from blank). Cost is not used as a substitute.");
    }
    if (row.quantity === 0) {
      warnings.push("Quantity 0 is preserved as a catalogue value only. Stock is not changed by this import.");
    }
    if (row.quantity !== null && row.quantity > 0) {
      warnings.push(`Quantity ${row.quantity} is shown for review only. Catalogue import never posts stock.`);
    }
    preview.push({
      ...row,
      errors,
      warnings,
      action: errors.length ? "reject" : action,
      matchMedicineId,
      matchName,
    });
  }
  return preview;
}

export async function importPharmacyCatalogue(opts: {
  tenantId: string;
  actorId: string;
  rows: CatalogueSourceRow[];
  dryRun: boolean;
  sourceFilename?: string | null;
  sourceHash?: string | null;
}): Promise<CatalogueImportReport> {
  const preview = await previewCatalogueImport({ tenantId: opts.tenantId, rows: opts.rows });
  const report: CatalogueImportReport = {
    sourceRows: opts.rows.length,
    validCatalogueItems: preview.filter((p) => p.action === "create" || p.action === "update").length,
    created: preview.filter((p) => p.action === "create").length,
    updated: preview.filter((p) => p.action === "update").length,
    matched: preview.filter((p) => p.action === "update").length,
    skipped: preview.filter((p) => p.action === "skip").length,
    rejected: preview.filter((p) => p.action === "reject").length,
    unresolved: preview.filter((p) => p.errors.some((e) => e.includes("Matches"))).length,
    missingSellingPrice: preview.filter((p) => p.sellingPrice === null && p.action !== "reject").length,
    zeroSellingPrice: preview.filter((p) => p.sellingPrice === 0).length,
    zeroQuantity: preview.filter((p) => p.quantity === 0).length,
    stockChangesProposed: 0,
    issues: preview.flatMap((p) =>
      [...p.errors, ...p.warnings].map((detail) => ({
        row: p.rowNumber,
        item: p.name,
        code: p.errors.length ? "VALIDATION" : "WARNING",
        detail,
      })),
    ),
    preview,
    dryRun: opts.dryRun,
    sourceFilename: opts.sourceFilename ?? null,
  };

  if (opts.dryRun) return report;
  assertCatalogueWritesAllowed();

  const counts = await prisma.$transaction(async (tx) => {
    let created = 0;
    let updated = 0;
    for (const row of preview) {
      if (row.action !== "create" && row.action !== "update") continue;
      const sku = row.aten || skuFromName(row.name);
      const data = {
        name: row.name,
        genericName: row.genericName || null,
        strength: row.strength || null,
        dosageForm: row.dosageForm || null,
        unit: row.unit || "unit",
        sku,
        category: row.category || row.description || null,
        sellingPrice: row.sellingPrice,
        costPrice: row.costPrice ?? 0,
        active: true,
      };
      const key = sourceKey(row.name, row.aten);
      if (row.matchMedicineId) {
        await tx.medicine.update({
          where: { id: row.matchMedicineId },
          data: {
            name: data.name,
            genericName: data.genericName ?? undefined,
            strength: data.strength ?? undefined,
            dosageForm: data.dosageForm ?? undefined,
            unit: data.unit,
            category: data.category ?? undefined,
            costPrice: data.costPrice,
            ...(row.sellingPrice !== null ? { sellingPrice: row.sellingPrice } : {}),
          },
        });
        await tx.catalogueImportMap.upsert({
          where: { tenantId_sourceKey: { tenantId: opts.tenantId, sourceKey: key } },
          create: { tenantId: opts.tenantId, sourceKey: key, medicineId: row.matchMedicineId, sourceName: row.name },
          update: { medicineId: row.matchMedicineId, sourceName: row.name },
        });
        updated += 1;
        continue;
      }
      const createdMed = await tx.medicine.create({
        data: {
          tenantId: opts.tenantId,
          ...data,
          quantityOnHand: 0,
        },
      });
      await tx.catalogueImportMap.create({
        data: {
          tenantId: opts.tenantId,
          sourceKey: key,
          medicineId: createdMed.id,
          sourceName: row.name,
        },
      });
      created += 1;
    }

    await tx.importBatch.create({
      data: {
        tenantId: opts.tenantId,
        kind: "CATALOGUE",
        sourceHash: opts.sourceHash || createHash("sha256").update(JSON.stringify(opts.rows)).digest("hex"),
        sourceFilename: opts.sourceFilename ?? null,
        dryRun: false,
        summary: {
          created,
          updated,
          rejected: report.rejected,
          sourceRows: report.sourceRows,
          stockChangesProposed: 0,
        },
        createdById: opts.actorId,
      },
    });
    await writeAudit(
      {
        tenantId: opts.tenantId,
        userId: opts.actorId,
        action: "pharmacy.catalogue_imported",
        entity: "medicine",
        metadata: {
          created,
          updated,
          rejected: report.rejected,
          sourceRows: report.sourceRows,
          sourceFilename: opts.sourceFilename ?? null,
          stockChangesProposed: 0,
        },
      },
      tx,
    );
    return { created, updated };
  });

  report.created = counts.created;
  report.updated = counts.updated;
  report.matched = counts.updated;
  return report;
}

export async function importOpeningStock(opts: {
  tenantId: string;
  actorId: string;
  role: string;
  rows: CatalogueSourceRow[];
  reason: string;
  dryRun: boolean;
  sourceFilename?: string | null;
  sourceHash: string;
}) {
  if (opts.role !== "SUPER_ADMIN" && opts.role !== "ADMIN" && opts.role !== "PHARMACY") {
    throw badRequest("Opening stock import requires a stock-authorised role.");
  }
  const reason = opts.reason.trim();
  if (reason.length < 3) throw badRequest("A reason is required before posting opening stock.");

  const prior = await prisma.importBatch.findFirst({
    where: { tenantId: opts.tenantId, kind: "OPENING_STOCK", sourceHash: opts.sourceHash, dryRun: false },
  });
  if (prior && !opts.dryRun) {
    throw conflict("This opening-stock file was already posted. Duplicate application is blocked.");
  }

  const preview = await previewCatalogueImport({ tenantId: opts.tenantId, rows: opts.rows });
  const proposed = [];
  for (const row of preview) {
    if (row.quantity === null || row.quantity === 0) continue;
    if (!row.matchMedicineId) {
      proposed.push({
        row: row.rowNumber,
        name: row.name,
        aten: row.aten,
        quantity: row.quantity,
        error: "Medicine must already exist in the catalogue. Opening stock does not create items.",
      });
      continue;
    }
    proposed.push({
      row: row.rowNumber,
      name: row.name,
      aten: row.aten,
      medicineId: row.matchMedicineId,
      quantity: row.quantity,
      error: null,
    });
  }

  if (opts.dryRun) {
    return { dryRun: true, alreadyPosted: Boolean(prior), proposed, posted: 0 };
  }
  assertCatalogueWritesAllowed();

  const valid = proposed.filter((p) => !p.error && p.medicineId);
  if (!valid.length) {
    return { dryRun: false, alreadyPosted: false, proposed, posted: 0 };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.importBatch.create({
        data: {
          tenantId: opts.tenantId,
          kind: "OPENING_STOCK",
          sourceHash: opts.sourceHash,
          sourceFilename: opts.sourceFilename ?? null,
          dryRun: false,
          summary: { posted: valid.length, reason, sourceFilename: opts.sourceFilename ?? null },
          createdById: opts.actorId,
        },
      });
      for (const line of valid) {
        await moveStock(tx, {
          tenantId: opts.tenantId,
          medicineId: line.medicineId!,
          userId: opts.actorId,
          type: "OPENING_BALANCE",
          quantity: line.quantity,
          signedDelta: line.quantity,
          reference: opts.sourceHash.slice(0, 12),
          notes: reason,
        });
      }
      await writeAudit(
        {
          tenantId: opts.tenantId,
          userId: opts.actorId,
          action: "pharmacy.opening_stock_imported",
          entity: "stock_movement",
          metadata: { posted: valid.length, reason, sourceFilename: opts.sourceFilename ?? null, sourceHash: opts.sourceHash },
        },
        tx,
      );
    });
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      throw conflict("This opening-stock file was already posted. Duplicate application is blocked.");
    }
    throw err;
  }

  return { dryRun: false, alreadyPosted: false, proposed, posted: valid.length };
}
