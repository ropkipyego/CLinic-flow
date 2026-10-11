import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app, auth, createTenant, createUser, login, prisma, resetDb } from "./helpers.js";

describe("deactivate and void safeguards", () => {
  let admin: string;
  let cashier: string;
  let pharmacy: string;
  let reception: string;
  let tenantId: string;

  beforeAll(async () => {
    await prisma.$connect();
    await resetDb();
    const tenant = await createTenant("archive-clinic", "Archive Clinic");
    tenantId = tenant.id;
    await createUser(tenant.id, "ADMIN", "admin.arch@test.clinic");
    await createUser(tenant.id, "CASHIER", "cashier.arch@test.clinic");
    await createUser(tenant.id, "PHARMACY", "pharmacy.arch@test.clinic");
    await createUser(tenant.id, "RECEPTION", "reception.arch@test.clinic");
    admin = await login("admin.arch@test.clinic");
    cashier = await login("cashier.arch@test.clinic");
    pharmacy = await login("pharmacy.arch@test.clinic");
    reception = await login("reception.arch@test.clinic");
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("deletes unused items and deactivates items with history", async () => {
    const unused = await request(app).post("/api/v1/pharmacy/medicines").set(auth(pharmacy)).send({
      name: "Unused cream",
      sku: "UNUSED1",
      costPrice: 1,
      sellingPrice: 2,
    });
    expect(unused.status).toBe(201);
    const gone = await request(app).delete(`/api/v1/pharmacy/medicines/${unused.body.data.id}`).set(auth(pharmacy));
    expect(gone.status).toBe(200);
    expect(gone.body.data.deleted).toBe(true);

    const withQty = await prisma.medicine.create({
      data: {
        tenantId,
        name: "Stocked item",
        sku: "STOCKED1",
        costPrice: 1,
        sellingPrice: 3,
        quantityOnHand: 5,
      },
    });
    const deactivated = await request(app).delete(`/api/v1/pharmacy/medicines/${withQty.id}`).set(auth(admin));
    expect(deactivated.status).toBe(200);
    expect(deactivated.body.data.deactivated).toBe(true);
    expect(await prisma.medicine.findFirst({ where: { id: withQty.id } })).toMatchObject({ active: false, quantityOnHand: 5 });
  });

  it("voids unpaid charges, keeps paid charges, and rejects pharmacy", async () => {
    const patient = await request(app).post("/api/v1/patients").set(auth(reception)).send({
      firstName: "Grace",
      lastName: "Mwangi",
      phone: "0711223344",
      sex: "FEMALE",
      ageYears: 29,
    });
    const visit = await request(app).post("/api/v1/encounters").set(auth(reception)).send({
      patientId: patient.body.data.id,
      checkInToConsultation: true,
    });
    const encounterId = visit.body.data.id as string;
    const charge = await request(app).post(`/api/v1/charges/encounters/${encounterId}`).set(auth(cashier)).send({
      description: "Dressing",
      unitPrice: 100,
      quantity: 1,
    });
    expect(charge.status).toBe(201);
    expect(charge.body.data.encounterId || encounterId).toBeTruthy();

    const denied = await request(app).delete(`/api/v1/charges/${charge.body.data.id}`).set(auth(pharmacy));
    expect(denied.status).toBe(403);

    const voided = await request(app).delete(`/api/v1/charges/${charge.body.data.id}`).set(auth(cashier));
    expect(voided.status).toBe(200);
    expect(voided.body.data.status).toBe("VOIDED");

    const paidCharge = await request(app).post(`/api/v1/charges/encounters/${encounterId}`).set(auth(cashier)).send({
      description: "Injection",
      unitPrice: 50,
      quantity: 1,
    });
    const pay = await request(app).post(`/api/v1/payments/encounters/${encounterId}`).set(auth(cashier)).send({
      amount: 50,
      method: "CASH",
      clientRequestId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    });
    expect(pay.status).toBe(201);
    const refuse = await request(app).delete(`/api/v1/charges/${paidCharge.body.data.id}`).set(auth(admin));
    expect(refuse.status).toBe(409);
    expect(await prisma.payment.count({ where: { encounterId } })).toBe(1);
    expect((await prisma.charge.findFirst({ where: { id: paidCharge.body.data.id } }))?.status).toBe("PAID");
  });
});
