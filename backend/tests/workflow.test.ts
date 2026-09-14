import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app, auth, createTenant, createUser, login, prisma, resetDb, seedCatalog } from "./helpers.js";

describe("ClinicFlow critical workflow", () => {
  let tenantA: string;
  let tenantB: string;
  let reception: string;
  let doctor: string;
  let lab: string;
  let pharmacy: string;
  let cashier: string;
  let adminA: string;
  let receptionB: string;
  let malariaId: string;
  let paraId: string;

  beforeAll(async () => {
    await prisma.$connect();
    await resetDb();
    const a = await createTenant("tenant-a", "Clinic A");
    const b = await createTenant("tenant-b", "Clinic B");
    tenantA = a.id;
    tenantB = b.id;
    await createUser(a.id, "ADMIN", "admin.a@test.clinic");
    await createUser(a.id, "RECEPTION", "reception.a@test.clinic");
    await createUser(a.id, "DOCTOR", "doctor.a@test.clinic");
    await createUser(a.id, "LAB", "lab.a@test.clinic");
    await createUser(a.id, "PHARMACY", "pharmacy.a@test.clinic");
    await createUser(a.id, "CASHIER", "cashier.a@test.clinic");
    await createUser(b.id, "RECEPTION", "reception.b@test.clinic");
    const catalog = await seedCatalog(a.id);
    malariaId = catalog.malaria.id;
    paraId = catalog.para.id;
    adminA = await login("admin.a@test.clinic");
    reception = await login("reception.a@test.clinic");
    doctor = await login("doctor.a@test.clinic");
    lab = await login("lab.a@test.clinic");
    pharmacy = await login("pharmacy.a@test.clinic");
    cashier = await login("cashier.a@test.clinic");
    receptionB = await login("reception.b@test.clinic");
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("runs the outpatient workflow and enforces tenant/role isolation", async () => {
    const register = await request(app)
      .post("/api/v1/patients")
      .set(auth(reception))
      .send({
        firstName: "Alice",
        lastName: "Njeri",
        phone: "0712345678",
        sex: "FEMALE",
        ageYears: 32,
        paymentMethod: "CASH",
      });
    expect(register.status).toBe(201);
    expect(register.body.data.patientNumber).toMatch(/^CLF-\d{6}$/);
    const patientId = register.body.data.id as string;

    const duplicateSearch = await request(app)
      .get("/api/v1/patients?q=0712345678")
      .set(auth(reception));
    expect(duplicateSearch.body.data[0].id).toBe(patientId);

    const visit = await request(app)
      .post("/api/v1/encounters")
      .set(auth(reception))
      .send({ patientId, checkInToConsultation: true });
    expect(visit.status).toBe(201);
    expect(visit.body.data.visitNumber).toMatch(/^VIS-\d{8}-\d{3}$/);
    expect(visit.body.data.status).toBe("WAITING_CONSULTATION");
    const encounterId = visit.body.data.id as string;

    const today = await request(app).get("/api/v1/encounters").set(auth(reception));
    expect(today.body.data.some((e: { id: string }) => e.id === encounterId)).toBe(true);

    const forbiddenVisit = await request(app).get(`/api/v1/encounters/${encounterId}`).set(auth(receptionB));
    expect(forbiddenVisit.status).toBe(404);

    const doctorBlocked = await request(app)
      .post("/api/v1/patients")
      .set(auth(doctor))
      .send({ firstName: "X", lastName: "Y", phone: "0700000000", sex: "MALE", ageYears: 20 });
    expect(doctorBlocked.status).toBe(403);

    const vitals = await request(app)
      .post(`/api/v1/vitals/encounters/${encounterId}`)
      .set(auth(doctor))
      .send({ pulse: 78, temperature: 37.1, spo2: 98, systolicBp: 120, diastolicBp: 80 });
    expect(vitals.status).toBe(201);

    const consult = await request(app)
      .put(`/api/v1/consultations/encounters/${encounterId}`)
      .set(auth(doctor))
      .send({
        chiefComplaint: "Fever",
        historyOfPresentingComplaint: "2 days of fever",
        examination: "Alert, febrile",
        assessment: "Suspected malaria",
        plan: "Test and treat",
      });
    expect(consult.status).toBe(200);

    const dx = await request(app)
      .post(`/api/v1/diagnoses/encounters/${encounterId}`)
      .set(auth(doctor))
      .send({ name: "Malaria", icd10Code: "B54" });
    expect(dx.status).toBe(201);

    const order = await request(app)
      .post(`/api/v1/lab/orders/encounters/${encounterId}`)
      .set(auth(doctor))
      .send({ labTestIds: [malariaId] });
    expect(order.status).toBe(201);
    const itemId = order.body.data.items[0].id as string;

    const queue = await request(app).get("/api/v1/lab/queue").set(auth(lab));
    expect(queue.body.data.length).toBeGreaterThan(0);

    const result = await request(app)
      .post(`/api/v1/lab/results/items/${itemId}`)
      .set(auth(lab))
      .send({ valueText: "Positive" });
    expect(result.status).toBe(201);

    const clinical = await request(app).get(`/api/v1/encounters/${encounterId}/clinical`).set(auth(doctor));
    expect(clinical.body.data.encounter.labOrders[0].items[0].result.valueText).toBe("Positive");

    const rx = await request(app)
      .post(`/api/v1/pharmacy/prescriptions/encounters/${encounterId}`)
      .set(auth(doctor))
      .send({
        items: [
          {
            medicineId: paraId,
            dose: "1 tab",
            frequency: "TDS",
            duration: "3 days",
            quantity: 10,
            instructions: "After food",
          },
        ],
      });
    expect(rx.status).toBe(201);
    const prescriptionId = rx.body.data.id as string;
    const rxItemId = rx.body.data.items[0].id as string;

    const pendingRx = await request(app).get("/api/v1/pharmacy/queue").set(auth(pharmacy));
    expect(pendingRx.body.data.some((p: { id: string }) => p.id === prescriptionId)).toBe(true);

    const beforeStock = await prisma.medicine.findFirst({ where: { id: paraId } });
    const dispense = await request(app)
      .post(`/api/v1/pharmacy/prescriptions/${prescriptionId}/dispense`)
      .set(auth(pharmacy))
      .send({ items: [{ prescriptionItemId: rxItemId, quantity: 10 }] });
    expect(dispense.status).toBe(201);
    const afterStock = await prisma.medicine.findFirst({ where: { id: paraId } });
    expect(afterStock!.quantityOnHand).toBe(beforeStock!.quantityOnHand - 10);

    const movements = await prisma.stockMovement.findMany({ where: { medicineId: paraId, type: "DISPENSE" } });
    expect(movements[0].previousQuantity).toBe(beforeStock!.quantityOnHand);
    expect(movements[0].newQuantity).toBe(afterStock!.quantityOnHand);

    const overDispense = await request(app)
      .post(`/api/v1/pharmacy/prescriptions/${prescriptionId}/dispense`)
      .set(auth(pharmacy))
      .send({ items: [{ prescriptionItemId: rxItemId, quantity: 1 }] });
    expect(overDispense.status).toBe(400);

    const extra = await request(app)
      .post(`/api/v1/charges/encounters/${encounterId}`)
      .set(auth(cashier))
      .send({ description: "Dressing", unitPrice: 200, quantity: 1 });
    expect(extra.status).toBe(201);

    const billing = await request(app).get(`/api/v1/payments/encounters/${encounterId}`).set(auth(cashier));
    expect(billing.body.data.balance).toBeGreaterThan(0);
    expect(billing.body.data.charges.some((c: { description: string }) => c.description === "Dressing")).toBe(true);

    const pay = await request(app)
      .post(`/api/v1/payments/encounters/${encounterId}`)
      .set(auth(cashier))
      .send({ amount: billing.body.data.balance, method: "CASH" });
    expect(pay.status).toBe(201);
    expect(pay.body.data.receipt.receiptNumber).toMatch(/^RCP-\d{6}$/);

    const receipt = await request(app)
      .get(`/api/v1/receipts/${pay.body.data.receipt.id}`)
      .set(auth(cashier));
    expect(receipt.body.data.clinic.name).toBe("Clinic A");
    expect(receipt.body.data.balance).toBe(0);
    expect(receipt.body.data.items.some((i: { description: string }) => i.description === "Dressing")).toBe(true);

    const completed = await request(app).get(`/api/v1/encounters/${encounterId}`).set(auth(reception));
    expect(completed.body.data.status).toBe("COMPLETED");

    const profile = await request(app).get(`/api/v1/patients/${patientId}/profile`).set(auth(doctor));
    expect(profile.body.data.encounters.length).toBe(1);
    expect(profile.body.data.payments).toBeUndefined();

    const finance = await request(app).get(`/api/v1/patients/${patientId}/profile`).set(auth(cashier));
    expect(finance.body.data.payments.length).toBe(1);

    const isolation = await request(app).get(`/api/v1/patients/${patientId}`).set(auth(receptionB));
    expect(isolation.status).toBe(404);

    const usersBlocked = await request(app).get("/api/v1/users").set(auth(reception));
    expect(usersBlocked.status).toBe(403);

    const usersOk = await request(app).get("/api/v1/users").set(auth(adminA));
    expect(usersOk.status).toBe(200);
    expect(usersOk.body.data.length).toBe(6);

    void tenantA;
    void tenantB;
  });
});
