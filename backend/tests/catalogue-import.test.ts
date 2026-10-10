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
});
