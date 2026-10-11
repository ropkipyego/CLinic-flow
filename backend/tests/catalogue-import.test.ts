import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTenant, createUser, prisma, resetDb } from "./helpers.js";
import { importOpeningStock, importPharmacyCatalogue, parseCatalogueRows } from "../src/services/pharmacyCatalogueImport.js";

describe("pharmacy catalogue import", () => {
  let tenantId: string;
  let actorId: string;

  beforeAll(async () => {
    await prisma.$connect();
    await resetDb();
    const tenant = await createTenant("import-clinic", "Import Clinic");
    tenantId = tenant.id;
    const user = await createUser(tenant.id, "ADMIN", "admin.import@test.clinic");
    actorId = user.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("parses PRICE vs Cost separately and treats blank vs zero as different", () => {
    const rows = parseCatalogueRows([
      { Item: "ZYRTEC", Description: "ANTI-ALLERGIC", "Quantity On Hand": "5", Cost: "26", PRICE: "" },
      { Item: "ZERO PRICE", Description: "", "Quantity On Hand": "0", Cost: "8", PRICE: "0" },
      { Item: "NAMED WITH PRICE", Description: "", "Quantity On Hand": "40", Cost: "4", PRICE: "10" },
    ]);
    expect(rows[0]!.sellingPrice).toBeNull();
    expect(rows[0]!.costPrice).toBe(26);
    expect(rows[1]!.sellingPrice).toBe(0);
    expect(rows[1]!.quantity).toBe(0);
    expect(rows[2]!.sellingPrice).toBe(10);
  });

  it("dry-run does not write, never posts stock, and retries do not duplicate", async () => {
    const rows = parseCatalogueRows([
      { "Drug name": "PARA TEST", Quantity: 40, ATEN: "PARA-T", "Cost price": 4, "Selling price": 10 },
      { "Drug name": "NO PRICE SYRUP", Quantity: 12, ATEN: "NPS", "Cost price": 50, "Selling price": "" },
    ]);

    const dry = await importPharmacyCatalogue({ tenantId, actorId, rows, dryRun: true });
    expect(dry.created).toBe(2);
    expect(dry.missingSellingPrice).toBe(1);
    expect(dry.stockChangesProposed).toBe(0);
    expect(await prisma.medicine.count({ where: { tenantId } })).toBe(0);

    const first = await importPharmacyCatalogue({ tenantId, actorId, rows, dryRun: false, sourceFilename: "drugs.csv" });
    expect(first.created).toBe(2);
    const meds = await prisma.medicine.findMany({ where: { tenantId } });
    expect(meds.every((m) => m.quantityOnHand === 0)).toBe(true);
    expect(meds.find((m) => m.name === "NO PRICE SYRUP")?.sellingPrice).toBeNull();
    expect(Number(meds.find((m) => m.name === "NO PRICE SYRUP")?.costPrice)).toBe(50);
    expect(meds.find((m) => m.sku === "PARA-T")?.sku).toBe("PARA-T");

    const second = await importPharmacyCatalogue({ tenantId, actorId, rows, dryRun: false });
    expect(second.created).toBe(0);
    expect(second.updated).toBe(2);
    expect(await prisma.medicine.count({ where: { tenantId } })).toBe(2);
    expect(await prisma.stockMovement.count({ where: { tenantId } })).toBe(0);
  });

  it("rejects blank names, negative qty, malformed prices, and duplicate identifiers", async () => {
    const rows = parseCatalogueRows([
      { "Drug name": "", Quantity: "1", ATEN: "X", "Cost price": "1" },
      { "Drug name": "Bad qty", Quantity: "-3", ATEN: "Y", "Cost price": "1" },
      { "Drug name": "Bad cost", Quantity: "1", ATEN: "Z", "Cost price": "abc" },
      { "Drug name": "Dup A", Quantity: "1", ATEN: "SAME", "Cost price": "1" },
      { "Drug name": "Dup B", Quantity: "1", ATEN: "SAME", "Cost price": "1" },
    ]);
    const dry = await importPharmacyCatalogue({ tenantId, actorId, rows, dryRun: true });
    expect(dry.rejected).toBe(5);
    expect(dry.created).toBe(0);
  });

  it("keeps opening stock as a separate ledger post and blocks duplicate application", async () => {
    const hash = "opening-hash-para-test-001";
    const rows = parseCatalogueRows([{ "Drug name": "PARA TEST", Quantity: 7, ATEN: "PARA-T", "Cost price": 4 }]);
    const dry = await importOpeningStock({
      tenantId,
      actorId,
      role: "ADMIN",
      rows,
      reason: "Opening balance from CSV",
      dryRun: true,
      sourceHash: hash,
    });
    expect(dry.posted).toBe(0);
    expect(await prisma.stockMovement.count({ where: { tenantId } })).toBe(0);

    const posted = await importOpeningStock({
      tenantId,
      actorId,
      role: "ADMIN",
      rows,
      reason: "Opening balance from CSV",
      dryRun: false,
      sourceHash: hash,
      sourceFilename: "opening.csv",
    });
    expect(posted.posted).toBe(1);
    const para = await prisma.medicine.findFirst({ where: { tenantId, sku: "PARA-T" } });
    expect(para?.quantityOnHand).toBe(7);
    expect(await prisma.stockMovement.count({ where: { tenantId, type: "OPENING_BALANCE" } })).toBe(1);

    await expect(
      importOpeningStock({
        tenantId,
        actorId,
        role: "ADMIN",
        rows,
        reason: "Opening balance from CSV",
        dryRun: false,
        sourceHash: hash,
      }),
    ).rejects.toThrow(/already posted/i);
    expect(para && (await prisma.medicine.findFirst({ where: { id: para.id } }))?.quantityOnHand).toBe(7);
  });
});
