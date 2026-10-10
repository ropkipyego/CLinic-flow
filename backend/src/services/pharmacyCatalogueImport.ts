import { createHash } from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { writeAudit } from "../lib/audit.js";

export type CatalogueSourceRow = {
  item: string;
  description: string;
  quantityOnHand: number | null;
  unit: string;
  cost: number | null;
  price: number | null;
  grossPrice: number | null;
  rowNumber: number;
};

export type CatalogueImportReport = {
  sourceRows: number;
  created: number;
  matched: number;
  skipped: number;
  unresolved: number;
  zeroPrice: number;
  missingDescription: number;
  missingUnit: number;
  quantityMissingOrNegative: number;
  priceGrossMismatch: number;
  issues: Array<{ row: number; item: string; code: string; detail: string }>;
  dryRun: boolean;
};

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function skuFromName(name: string) {
  const slug = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
  const hash = createHash("sha1").update(name).digest("hex").slice(0, 6);
  return `JAL-${slug || "ITEM"}-${hash}`.slice(0, 40);
}

export function sourceKey(item: string) {
  return item.trim();
}

export function parseCatalogueRows(rows: Record<string, unknown>[]): CatalogueSourceRow[] {
  return rows.map((raw, i) => ({
    item: String(raw.Item ?? raw.item ?? "").trim(),
    description: String(raw.Description ?? raw.description ?? "").trim(),
    quantityOnHand: num(raw["Quantity On Hand"] ?? raw.quantityOnHand),
    unit: String(raw["U/M"] ?? raw.unit ?? "").trim(),
    cost: num(raw.Cost ?? raw.cost),
    price: num(raw.Price ?? raw.price),
    grossPrice: num(raw["Gross Price"] ?? raw.grossPrice),
    rowNumber: i + 2,
  }));
}

export async function importPharmacyCatalogue(opts: {
  tenantId: string;
  actorId: string;
  rows: CatalogueSourceRow[];
  dryRun: boolean;
}): Promise<CatalogueImportReport> {
  const report: CatalogueImportReport = {
    sourceRows: opts.rows.length,
    created: 0,
    matched: 0,
    skipped: 0,
    unresolved: 0,
    zeroPrice: 0,
    missingDescription: 0,
    missingUnit: 0,
    quantityMissingOrNegative: 0,
    priceGrossMismatch: 0,
    issues: [],
    dryRun: opts.dryRun,
  };

  const note = (row: number, item: string, code: string, detail: string) => {
    report.issues.push({ row, item, code, detail });
  };

  const createdKeys = new Set<string>();

  for (const row of opts.rows) {
    if (!row.item) {
      report.skipped += 1;
      note(row.rowNumber, "", "EMPTY_ITEM", "Row has no Item name.");
      continue;
    }
    if (!row.description) {
      report.missingDescription += 1;
      note(row.rowNumber, row.item, "MISSING_DESCRIPTION", "No Description/category hint.");
    }
    if (!row.unit) {
      report.missingUnit += 1;
      note(row.rowNumber, row.item, "MISSING_UNIT", "U/M is empty; will use unit.");
    }
    if (row.quantityOnHand === null || row.quantityOnHand < 0) {
      report.quantityMissingOrNegative += 1;
    }
    if (row.price === 0) {
      report.zeroPrice += 1;
      note(row.rowNumber, row.item, "ZERO_PRICE", "Selling price is 0 and will be kept as 0.");
    }
    if (row.price !== null && row.grossPrice !== null && row.price !== row.grossPrice) {
      report.priceGrossMismatch += 1;
      note(row.rowNumber, row.item, "PRICE_GROSS_MISMATCH", `Price ${row.price} vs Gross Price ${row.grossPrice}. Price is used.`);
    }
    if (row.price === null) {
      report.skipped += 1;
      note(row.rowNumber, row.item, "INVALID_PRICE", "Price is missing or not a number.");
      continue;
    }

    const key = sourceKey(row.item);
    if (createdKeys.has(key)) {
      report.matched += 1;
      note(row.rowNumber, row.item, "DUPLICATE_IN_SOURCE", "Same Item already processed in this import.");
      continue;
    }
    const mapped = await prisma.catalogueImportMap.findFirst({
      where: { tenantId: opts.tenantId, sourceKey: key },
      include: { medicine: true },
    });
    const exactName = await prisma.medicine.findMany({
      where: { tenantId: opts.tenantId, name: { equals: row.item, mode: "insensitive" } },
    });

    let medicineId: string | null = mapped?.medicineId ?? null;
    if (!medicineId && exactName.length === 1) medicineId = exactName[0]!.id;
    if (!medicineId && exactName.length > 1) {
      report.unresolved += 1;
      note(
        row.rowNumber,
        row.item,
        "AMBIGUOUS",
        `Matches ${exactName.length} existing products; not merged.`,
      );
      continue;
    }

    if (medicineId) {
      report.matched += 1;
      createdKeys.add(key);
      const existing = mapped?.medicine || exactName[0];
      if (existing && Number(existing.sellingPrice) !== row.price) {
        note(row.rowNumber, row.item, "PRICE_DIFFERS", `Catalogue Price ${row.price}; existing selling price ${existing.sellingPrice}. Existing price kept.`);
      }
      if (opts.dryRun) continue;
      await prisma.catalogueImportMap.upsert({
        where: { tenantId_sourceKey: { tenantId: opts.tenantId, sourceKey: key } },
        create: { tenantId: opts.tenantId, sourceKey: key, medicineId, sourceName: row.item },
        update: {},
      });
      continue;
    }

    report.created += 1;
    createdKeys.add(key);
    if (opts.dryRun) continue;

    const created = await prisma.medicine.create({
      data: {
        tenantId: opts.tenantId,
        name: row.item,
        genericName: null,
        strength: null,
        dosageForm: null,
        unit: row.unit || "unit",
        sku: skuFromName(row.item),
        category: row.description || "REVIEW",
        sellingPrice: row.price,
        costPrice: row.cost ?? 0,
        reorderLevel: 10,
        quantityOnHand: 0,
        active: true,
      },
    });
    await prisma.catalogueImportMap.create({
      data: {
        tenantId: opts.tenantId,
        sourceKey: key,
        medicineId: created.id,
        sourceName: row.item,
      },
    });
  }

  if (!opts.dryRun) {
    await writeAudit({
      tenantId: opts.tenantId,
      userId: opts.actorId,
      action: "pharmacy.catalogue_imported",
      entity: "medicine",
      metadata: {
        created: report.created,
        matched: report.matched,
        unresolved: report.unresolved,
        sourceRows: report.sourceRows,
      },
    });
  }

  return report;
}
