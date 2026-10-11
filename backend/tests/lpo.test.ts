import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTenant, createUser, prisma, resetDb } from "./helpers.js";
import {
  approvePurchaseOrder,
  cancelPurchaseOrder,
  createPurchaseOrder,
  issuePurchaseOrder,
  receivePurchaseOrder,
  submitPurchaseOrder,
} from "../src/services/procurementService.js";

describe("LPO and goods receipt", () => {
  let tenantId: string;
  let adminId: string;
  let pharmacyId: string;
  let medicineId: string;
  let supplierId: string;

  beforeAll(async () => {
    await prisma.$connect();
    await resetDb();
    const tenant = await createTenant("lpo-clinic", "LPO Clinic");
    tenantId = tenant.id;
    const admin = await createUser(tenant.id, "ADMIN", "admin.lpo@test.clinic");
    const pharmacy = await createUser(tenant.id, "PHARMACY", "pharmacy.lpo@test.clinic");
    adminId = admin.id;
    pharmacyId = pharmacy.id;
    const med = await prisma.medicine.create({
      data: {
        tenantId,
        name: "Amoxicillin 500mg",
        sku: "AMOX500",
        unit: "cap",
        sellingPrice: 10,
        costPrice: 4,
        quantityOnHand: 0,
      },
    });
    medicineId = med.id;
    const supplier = await prisma.supplier.create({
      data: { tenantId, name: "Nairobi Pharma Ltd", phone: "0700000000", taxPin: "P000000000X" },
    });
    supplierId = supplier.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creates unique LPO numbers, does not change stock until GRN, and receives only against remaining qty", async () => {
    const first = await createPurchaseOrder(tenantId, pharmacyId, {
      supplierId,
      expectedDate: "2026-10-20",
      quotationNumber: "Q-1",
      taxPercent: 0,
      deliveryCharge: 0,
      lines: [{ medicineId, quantityOrdered: 10, unitCost: 4 }],
    });
    expect(first.lpoNumber).toMatch(/^LPO-\d{6}$/);
    expect(first.status).toBe("DRAFT");
    expect(first.totals.grandTotal).toBe(40);
    expect((await prisma.medicine.findFirst({ where: { id: medicineId } }))?.quantityOnHand).toBe(0);

    const second = await createPurchaseOrder(tenantId, pharmacyId, {
      supplierId,
      lines: [{ medicineId, quantityOrdered: 2, unitCost: 4 }],
    });
    expect(second.lpoNumber).not.toBe(first.lpoNumber);

    await expect(receivePurchaseOrder(tenantId, pharmacyId, first.id, {
      lines: [{ purchaseOrderLineId: first.lines[0]!.id, quantityReceived: 1 }],
    })).rejects.toThrow(/issued LPO/i);

    await submitPurchaseOrder(tenantId, pharmacyId, first.id);
    await approvePurchaseOrder(tenantId, adminId, "ADMIN", first.id);
    const issued = await issuePurchaseOrder(tenantId, pharmacyId, first.id);
    expect(issued.status).toBe("ISSUED");
    expect((await prisma.medicine.findFirst({ where: { id: medicineId } }))?.quantityOnHand).toBe(0);

    const lineId = issued.lines[0]!.id;
    const partial = await receivePurchaseOrder(tenantId, pharmacyId, first.id, {
      deliveryNote: "DN-1",
      clientRequestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      lines: [{ purchaseOrderLineId: lineId, quantityReceived: 4 }],
    });
    expect(partial.status).toBe("PARTIAL");
    expect(partial.lines[0]!.quantityReceived).toBe(4);
    expect(partial.lines[0]!.outstanding).toBe(6);
    expect((await prisma.medicine.findFirst({ where: { id: medicineId } }))?.quantityOnHand).toBe(4);

    const replay = await receivePurchaseOrder(tenantId, pharmacyId, first.id, {
      deliveryNote: "DN-1",
      clientRequestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      lines: [{ purchaseOrderLineId: lineId, quantityReceived: 4 }],
    });
    expect(replay.lines[0]!.quantityReceived).toBe(4);
    expect((await prisma.medicine.findFirst({ where: { id: medicineId } }))?.quantityOnHand).toBe(4);

    await expect(
      receivePurchaseOrder(tenantId, pharmacyId, first.id, {
        lines: [{ purchaseOrderLineId: lineId, quantityReceived: 7 }],
      }),
    ).rejects.toThrow(/outstanding/i);

    const full = await receivePurchaseOrder(tenantId, pharmacyId, first.id, {
      clientRequestId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      lines: [{ purchaseOrderLineId: lineId, quantityReceived: 6 }],
    });
    expect(full.status).toBe("RECEIVED");
    expect((await prisma.medicine.findFirst({ where: { id: medicineId } }))?.quantityOnHand).toBe(10);
    expect(await prisma.goodsReceipt.count({ where: { tenantId, purchaseOrderId: first.id } })).toBe(2);
  });

  it("refuses to cancel after any quantity has been received", async () => {
    const po = await createPurchaseOrder(tenantId, pharmacyId, {
      supplierId,
      lines: [{ medicineId, quantityOrdered: 5, unitCost: 4 }],
    });
    await submitPurchaseOrder(tenantId, pharmacyId, po.id);
    await approvePurchaseOrder(tenantId, adminId, "ADMIN", po.id);
    await issuePurchaseOrder(tenantId, pharmacyId, po.id);
    const issued = await receivePurchaseOrder(tenantId, pharmacyId, po.id, {
      clientRequestId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      lines: [{ purchaseOrderLineId: po.lines[0]!.id, quantityReceived: 1 }],
    });
    expect(issued.status).toBe("PARTIAL");
    await expect(cancelPurchaseOrder(tenantId, pharmacyId, po.id)).rejects.toThrow(/cannot be cancelled/i);
    expect((await prisma.purchaseOrder.findFirst({ where: { id: po.id } }))?.status).toBe("PARTIAL");
  });
});
