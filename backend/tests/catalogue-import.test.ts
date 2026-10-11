import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTenant, createUser, prisma, resetDb } from "./helpers.js";
import { importPharmacyCatalogue, parseCatalogueRows } from "../src/services/pharmacyCatalogueImport.js";

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

  it("dry-run does not write, keeps quantities at zero, and is rerun-safe", async () => {
    const rows = parseCatalogueRows([
      { Item: "PARA TEST", Description: "ANALGESIC", "Quantity On Hand": 40, "U/M": "tab", Cost: 4, Price: 10, "Gross Price": 12 },
      { Item: "ZERO PRICE ITEM", Description: "", "Quantity On Hand": -2, "U/M": "", Cost: 0, Price: 0, "Gross Price": 0 },
      { Item: "PARA TEST", Description: "ANALGESIC", "Quantity On Hand": 1, "U/M": "tab", Cost: 4, Price: 10, "Gross Price": 10 },
    ]);

    const dry = await importPharmacyCatalogue({ tenantId, actorId, rows, dryRun: true });
    expect(dry.created).toBe(2);
    expect(dry.zeroPrice).toBe(1);
    expect(dry.priceGrossMismatch).toBe(1);
    expect(dry.missingUnit).toBe(1);
    expect(await prisma.medicine.count({ where: { tenantId } })).toBe(0);

    const first = await importPharmacyCatalogue({ tenantId, actorId, rows, dryRun: false });
    expect(first.created).toBe(2);
    const meds = await prisma.medicine.findMany({ where: { tenantId } });
    expect(meds.every((m) => m.quantityOnHand === 0)).toBe(true);
    expect(meds.find((m) => m.name === "ZERO PRICE ITEM")?.sellingPrice.toString()).toBe("0");

    const second = await importPharmacyCatalogue({ tenantId, actorId, rows, dryRun: false });
    expect(second.created).toBe(0);
    expect(second.matched).toBe(3);
    expect(await prisma.medicine.count({ where: { tenantId } })).toBe(2);
    expect(await prisma.stockMovement.count({ where: { tenantId } })).toBe(0);
  });

  it("reads PRICE header, skips blank selling prices, and never proposes stock from the workbook", () => {
    const rows = parseCatalogueRows([
      { Item: "ZYRTEC 1MG/ML 75ML", Description: "ANTI-ALLERGIC", "Quantity On Hand": "5", Cost: "26", PRICE: "" },
      { Item: "ACINET 625MG", Description: "ANTIBIOTICS", "Quantity On Hand": "-17", Cost: "80", PRICE: "" },
      { Item: "NAMED WITH PRICE", Description: "ANALGESIC", "Quantity On Hand": "40", Cost: "4", PRICE: "10" },
    ]);
    expect(rows[0]!.price).toBeNull();
    expect(rows[2]!.price).toBe(10);
  });

  it("does not create products when the workbook has no selling price", async () => {
    const rows = parseCatalogueRows([
      { Item: "NO PRICE SYRUP", Description: "ANTIBIOTICS", "Quantity On Hand": "12", Cost: "50", PRICE: "" },
    ]);
    const dry = await importPharmacyCatalogue({ tenantId, actorId, rows, dryRun: true });
    expect(dry.skipped).toBe(1);
    expect(dry.missingSellingPrice).toBe(1);
    expect(dry.created).toBe(0);
    expect(dry.stockChangesProposed).toBe(0);
    expect(dry.validCatalogueItems).toBe(0);
    expect(await prisma.medicine.count({ where: { tenantId, name: "NO PRICE SYRUP" } })).toBe(0);
  });
});
