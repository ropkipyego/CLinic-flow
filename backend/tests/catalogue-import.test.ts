import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app, auth, createTenant, createUser, login, prisma, resetDb } from "./helpers.js";
import { openingStockWritesBlocked } from "../src/lib/catalogueWriteGuard.js";
import { importOpeningStock, importPharmacyCatalogue, parseCatalogueRows } from "../src/services/pharmacyCatalogueImport.js";

describe("pharmacy catalogue import", () => {
  let tenantId: string;
  let actorId: string;
  let otherTenantId: string;
  let adminToken: string;
  let pharmacyToken: string;

  beforeAll(async () => {
    await prisma.$connect();
    await resetDb();
    const tenant = await createTenant("import-clinic", "Import Clinic");
    tenantId = tenant.id;
    const user = await createUser(tenant.id, "ADMIN", "admin.import@test.clinic");
    actorId = user.id;
    const pharmacy = await createUser(tenant.id, "PHARMACY", "pharm.import@test.clinic");
    const other = await createTenant("other-clinic", "Other Clinic");
    otherTenantId = other.id;
    await createUser(other.id, "ADMIN", "admin.other@test.clinic");
    adminToken = await login("admin.import@test.clinic");
    pharmacyToken = await login("pharm.import@test.clinic");
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

    const dry = await importPharmacyCatalogue({ tenantId, actorId, actorRole: "ADMIN", rows, dryRun: true });
    expect(dry.created).toBe(2);
    expect(dry.missingSellingPrice).toBe(1);
    expect(dry.stockChangesProposed).toBe(0);
    expect(await prisma.medicine.count({ where: { tenantId } })).toBe(0);

    const first = await importPharmacyCatalogue({
      tenantId,
      actorId,
      actorRole: "ADMIN",
      rows,
      dryRun: false,
      sourceFilename: "drugs.csv",
    });
    expect(first.created).toBe(2);
    const meds = await prisma.medicine.findMany({ where: { tenantId } });
    expect(meds.every((m) => m.quantityOnHand === 0)).toBe(true);
    expect(meds.find((m) => m.name === "NO PRICE SYRUP")?.sellingPrice).toBeNull();
    expect(Number(meds.find((m) => m.name === "NO PRICE SYRUP")?.costPrice)).toBe(50);
    expect(meds.find((m) => m.sku === "PARA-T")?.sku).toBe("PARA-T");

    const second = await importPharmacyCatalogue({ tenantId, actorId, actorRole: "ADMIN", rows, dryRun: false });
    expect(second.created).toBe(0);
    expect(second.updated).toBe(2);
    expect(await prisma.medicine.count({ where: { tenantId } })).toBe(2);
    expect(await prisma.stockMovement.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { tenantId, action: "pharmacy.catalogue_imported" } })).toBe(2);
  });

  it("updates matching medicines without changing stock or blanking selling price", async () => {
    await prisma.medicine.updateMany({
      where: { tenantId, sku: "PARA-T" },
      data: { quantityOnHand: 17, sellingPrice: 99, genericName: "Paracetamol" },
    });
    const rows = parseCatalogueRows([
      { "Drug name": "PARA TEST UPDATED", Quantity: 999, ATEN: "PARA-T", "Cost price": 6, "Selling price": "", genericName: "" },
    ]);
    const result = await importPharmacyCatalogue({ tenantId, actorId, actorRole: "ADMIN", rows, dryRun: false });
    expect(result.updated).toBe(1);
    const para = await prisma.medicine.findFirst({ where: { tenantId, sku: "PARA-T" } });
    expect(para?.name).toBe("PARA TEST UPDATED");
    expect(para?.quantityOnHand).toBe(17);
    expect(Number(para?.sellingPrice)).toBe(99);
    expect(para?.genericName).toBe("Paracetamol");
    expect(Number(para?.costPrice)).toBe(6);
    expect(await prisma.stockMovement.count({ where: { tenantId } })).toBe(0);
  });

  it("adds genuinely missing medicines and matches conservatively on name+strength+form", async () => {
    const rows = parseCatalogueRows([
      { "Drug name": "NEW TABLET", Quantity: "5.0", ATEN: "NEW-TAB", "Cost price": 3, strength: "10mg", "dosage form": "Tablet" },
      { "Drug name": "PARA TEST UPDATED", Quantity: 1, ATEN: "", "Cost price": 6, strength: "", "dosage form": "" },
    ]);
    const result = await importPharmacyCatalogue({ tenantId, actorId, actorRole: "ADMIN", rows, dryRun: false });
    expect(result.created).toBe(1);
    expect(result.updated).toBeGreaterThanOrEqual(1);
    expect(await prisma.medicine.findFirst({ where: { tenantId, sku: "NEW-TAB" } })).toBeTruthy();
    expect((await prisma.medicine.findFirst({ where: { tenantId, sku: "NEW-TAB" } }))?.quantityOnHand).toBe(0);
  });

  it("rejects blank names and malformed prices; skips in-file duplicates; does not reject informational qty", async () => {
    const rows = parseCatalogueRows([
      { "Drug name": "", Quantity: "1", ATEN: "X", "Cost price": "1" },
      { "Drug name": "Qty decimal", Quantity: "3.5", ATEN: "QDEC", "Cost price": "1" },
      { "Drug name": "Bad cost", Quantity: "1", ATEN: "Z", "Cost price": "abc" },
      { "Drug name": "Dup A", Quantity: "1", ATEN: "SAME", "Cost price": "1" },
      { "Drug name": "Dup B", Quantity: "1", ATEN: "SAME", "Cost price": "1" },
    ]);
    const dry = await importPharmacyCatalogue({ tenantId, actorId, actorRole: "ADMIN", rows, dryRun: true });
    expect(dry.rejected).toBe(2);
    expect(dry.skipped).toBe(1);
    expect(dry.created).toBe(2);
  });

  it("does not leak medicines across tenants", async () => {
    expect(await prisma.medicine.count({ where: { tenantId: otherTenantId } })).toBe(0);
    const rows = parseCatalogueRows([{ "Drug name": "PARA TEST UPDATED", Quantity: 1, ATEN: "PARA-T", "Cost price": 4 }]);
    const other = await importPharmacyCatalogue({
      tenantId: otherTenantId,
      actorId,
      actorRole: "ADMIN",
      rows,
      dryRun: false,
    });
    expect(other.created).toBe(1);
    expect(await prisma.medicine.count({ where: { tenantId: otherTenantId, sku: "PARA-T" } })).toBe(1);
    expect((await prisma.medicine.findFirst({ where: { tenantId, sku: "PARA-T" } }))?.name).toBe("PARA TEST UPDATED");
  });

  it("allows an authenticated admin to commit catalogue import over HTTP", async () => {
    const csv = "name,aten,costPrice,sellingPrice\nHTTP NEW,HTTP-1,2,8\n";
    const dry = await request(app)
      .post("/api/v1/pharmacy/catalogue/import")
      .set(auth(adminToken))
      .send({ csvText: csv, dryRun: true, sourceFilename: "http.csv" });
    expect(dry.status).toBe(200);
    expect(dry.body.data.created).toBe(1);
    const write = await request(app)
      .post("/api/v1/pharmacy/catalogue/import")
      .set(auth(adminToken))
      .send({ csvText: csv, dryRun: false, sourceFilename: "http.csv" });
    expect(write.status).toBe(200);
    expect(write.body.data.created).toBe(1);
    expect(write.body.data.stockChangesProposed).toBe(0);
    expect(await prisma.medicine.findFirst({ where: { tenantId, sku: "HTTP-1" } })).toBeTruthy();
  });

  it("rejects unauthorised catalogue import writes", async () => {
    const csv = "name,aten,costPrice\nNOPE,NOPE-1,1\n";
    const res = await request(app)
      .post("/api/v1/pharmacy/catalogue/import")
      .set(auth(pharmacyToken))
      .send({ csvText: csv, dryRun: false });
    expect(res.status).toBe(403);
    expect(await prisma.medicine.findFirst({ where: { tenantId, sku: "NOPE-1" } })).toBeNull();
    await expect(
      importPharmacyCatalogue({
        tenantId,
        actorId,
        actorRole: "PHARMACY",
        rows: parseCatalogueRows([{ "Drug name": "NOPE", ATEN: "NOPE-1", "Cost price": 1 }]),
        dryRun: false,
      }),
    ).rejects.toThrow(/administrator/i);
  });

  it("keeps opening-stock writes blocked in production", () => {
    expect(openingStockWritesBlocked({ isProduction: true, writeEnabled: true, nodeEnv: "production" })).toBe(true);
  });

  it("keeps opening stock as a separate ledger post and blocks duplicate application", async () => {
    const hash = "opening-hash-para-test-001";
    const rows = parseCatalogueRows([{ "Drug name": "PARA TEST UPDATED", Quantity: 7, ATEN: "PARA-T", "Cost price": 4 }]);
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
    const before = (await prisma.medicine.findFirst({ where: { tenantId, sku: "PARA-T" } }))!.quantityOnHand;

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
    expect(para?.quantityOnHand).toBe(before + 7);
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
    expect((await prisma.medicine.findFirst({ where: { id: para!.id } }))?.quantityOnHand).toBe(before + 7);
  });
});
