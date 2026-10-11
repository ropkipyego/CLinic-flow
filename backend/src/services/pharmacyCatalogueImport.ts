import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { writeAudit } from "../lib/audit.js";
import { badRequest, conflict } from "../lib/errors.js";
import { parseCsv } from "../lib/csv.js";
import { isUniqueConstraintError } from "../lib/prismaErrors.js";
import {
  assertCatalogueMasterDataImportAllowed,
  assertOpeningStockWritesAllowed,
} from "../lib/catalogueWriteGuard.js";
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
  if (aten.trim()) return `aten:${aten.trim().toLowerCase()}`;
  return `name:${normalizeMatch(name)}`;
}

export function normalizeMatch(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function identityKey(name: string, strength: string, form: string) {
  return `${normalizeMatch(name)}|${normalizeMatch(strength)}|${normalizeMatch(form)}`;
}

function asRow(row: CatalogueSourceRow) {
  return row as CatalogueSourceRow & { _qtyError?: string; _costError?: string; _sellError?: string };
}

type MedicineMatch = { id: string; name: string; sku: string; strength: string | null; dosageForm: string | null };

function findMatches(
  row: CatalogueSourceRow,
  bySku: Map<string, MedicineMatch[]>,
  byIdentity: Map<string, MedicineMatch[]>,
  byName: Map<string, MedicineMatch[]>,
  bySourceKey: Map<string, MedicineMatch>,
): { matches: MedicineMatch[]; reason: string } {
  const mapped = bySourceKey.get(sourceKey(row.name, row.aten));
  if (mapped) return { matches: [mapped], reason: "import map" };
  if (row.aten) {
    const skuHits = bySku.get(normalizeMatch(row.aten)) || [];
    if (skuHits.length) return { matches: skuHits, reason: "sku" };
  }
  if (row.name && (row.strength || row.dosageForm)) {
    const ident = byIdentity.get(identityKey(row.name, row.strength, row.dosageForm)) || [];
    if (ident.length) return { matches: ident, reason: "name+strength+form" };
  }
  if (row.name && !row.aten) {
    const named = byName.get(normalizeMatch(row.name)) || [];
    return { matches: named, reason: "name" };
  }
  return { matches: [], reason: "none" };
}

export async function previewCatalogueImport(opts: {
  tenantId: string;
  rows: CatalogueSourceRow[];
}): Promise<CataloguePreviewRow[]> {
  const atenFirst = new Map<string, number>();
  const nameFirst = new Map<string, number>();
  const medicines = await prisma.medicine.findMany({
    where: { tenantId: opts.tenantId },
    select: { id: true, name: true, sku: true, strength: true, dosageForm: true },
  });
  const maps = await prisma.catalogueImportMap.findMany({ where: { tenantId: opts.tenantId } });
  const bySku = new Map<string, MedicineMatch[]>();
  const byIdentity = new Map<string, MedicineMatch[]>();
  const byName = new Map<string, MedicineMatch[]>();
  for (const m of medicines) {
    const skuKey = normalizeMatch(m.sku);
    bySku.set(skuKey, [...(bySku.get(skuKey) || []), m]);
    const ident = identityKey(m.name, m.strength || "", m.dosageForm || "");
    byIdentity.set(ident, [...(byIdentity.get(ident) || []), m]);
    const nk = normalizeMatch(m.name);
    byName.set(nk, [...(byName.get(nk) || []), m]);
  }
  const medById = new Map(medicines.map((m) => [m.id, m]));
  const bySourceKey = new Map<string, MedicineMatch>();
  for (const map of maps) {
    const med = medById.get(map.medicineId);
    if (med) bySourceKey.set(map.sourceKey, med);
  }

  const preview: CataloguePreviewRow[] = [];

  for (const row of opts.rows) {
    const extra = asRow(row);
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!row.name) errors.push("Drug name is required.");
    if (extra._qtyError) warnings.push(`${extra._qtyError} Quantity is ignored for catalogue import.`);
    if (extra._costError) errors.push(extra._costError);
    if (extra._sellError) errors.push(extra._sellError);

    let duplicateOf: number | null = null;
    if (row.aten) {
      const k = row.aten.toLowerCase();
      const first = atenFirst.get(k);
      if (first == null) atenFirst.set(k, row.rowNumber);
      else duplicateOf = first;
    } else if (row.name) {
      const k = normalizeMatch(row.name);
      const first = nameFirst.get(k);
      if (first == null) nameFirst.set(k, row.rowNumber);
      else duplicateOf = first;
    }

    let action: CataloguePreviewRow["action"] = "create";
    let matchMedicineId: string | null = null;
    let matchName: string | null = null;
    if (duplicateOf != null) {
      action = "skip";
      errors.push(
        row.aten
          ? `Duplicate ATEN/SKU "${row.aten}" in this file. Kept row ${duplicateOf}.`
          : `Duplicate drug name "${row.name}" in this file. Kept row ${duplicateOf}.`,
      );
    } else if (errors.length) {
      action = "reject";
    } else {
      const { matches } = findMatches(row, bySku, byIdentity, byName, bySourceKey);
      if (matches.length > 1) {
        action = "reject";
        errors.push(`Matches ${matches.length} existing medicines; not merged.`);
      } else if (matches.length === 1) {
        action = "update";
        matchMedicineId = matches[0]!.id;
        matchName = matches[0]!.name;
      }
    }
    if (row.sellingPrice === null && !extra._sellError) {
      warnings.push("Selling price is blank. Existing selling price is kept. Cost is not copied.");
    }
    if (row.sellingPrice === 0) {
      warnings.push("Selling price is 0 (distinct from blank). Cost is not used as a substitute.");
    }
    if (row.quantity !== null && row.quantity !== 0) {
      warnings.push(`Quantity ${row.quantity} is shown for review only. Catalogue import never posts stock.`);
    }
    if (row.quantity === 0) {
      warnings.push("Quantity 0 is catalogue-only. Stock is not changed by this import.");
    }
    preview.push({
      ...row,
      errors,
      warnings,
      action,
      matchMedicineId,
      matchName,
    });
  }
  return preview;
}

function catalogueUpdatePatch(row: CataloguePreviewRow): Prisma.MedicineUpdateInput {
  const data: Prisma.MedicineUpdateInput = { active: true };
  if (row.name) data.name = row.name;
  if (row.genericName) data.genericName = row.genericName;
  if (row.strength) data.strength = row.strength;
  if (row.dosageForm) data.dosageForm = row.dosageForm;
  if (row.unit) data.unit = row.unit;
  if (row.category) data.category = row.category;
  if (row.costPrice != null && Number.isFinite(row.costPrice)) data.costPrice = row.costPrice;
  if (row.sellingPrice !== null && Number.isFinite(row.sellingPrice)) data.sellingPrice = row.sellingPrice;
  return data;
}

export async function importPharmacyCatalogue(opts: {
  tenantId: string;
  actorId: string;
  actorRole: string;
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
  assertCatalogueMasterDataImportAllowed(opts.actorRole);

  const counts = await prisma.$transaction(async (tx) => {
    let created = 0;
    let updated = 0;
    for (const row of preview) {
      if (row.action !== "create" && row.action !== "update") continue;
      const sku = row.aten || skuFromName(row.name);
      const key = sourceKey(row.name, row.aten);
      if (row.matchMedicineId) {
        await tx.medicine.update({
          where: { id: row.matchMedicineId },
          data: catalogueUpdatePatch(row),
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
          name: row.name,
          genericName: row.genericName || null,
          strength: row.strength || null,
          dosageForm: row.dosageForm || null,
          unit: row.unit || "unit",
          sku,
          category: row.category || row.description || null,
          sellingPrice: row.sellingPrice != null && Number.isFinite(row.sellingPrice) ? row.sellingPrice : null,
          costPrice: row.costPrice != null && Number.isFinite(row.costPrice) ? row.costPrice : 0,
          active: true,
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
  assertOpeningStockWritesAllowed();

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
