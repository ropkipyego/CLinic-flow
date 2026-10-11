import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app, auth, createTenant, createUser, login, prisma, resetDb } from "./helpers.js";

describe("patient registration and encounters", () => {
  let reception: string;
  let doctor: string;
  let pharmacy: string;

  beforeAll(async () => {
    await prisma.$connect();
    await resetDb();
    const tenant = await createTenant("reg-clinic", "Reg Clinic");
    await createUser(tenant.id, "RECEPTION", "reception.reg@test.clinic");
    await createUser(tenant.id, "DOCTOR", "doctor.reg@test.clinic");
    await createUser(tenant.id, "PHARMACY", "pharmacy.reg@test.clinic");
    reception = await login("reception.reg@test.clinic");
    doctor = await login("doctor.reg@test.clinic");
    pharmacy = await login("pharmacy.reg@test.clinic");
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creates one patient, finds them by normalized phone, and allows multiple encounters", async () => {
    const register = await request(app)
      .post("/api/v1/patients")
      .set(auth(reception))
      .send({
        firstName: "Alice",
        lastName: "Njeri",
        phone: "0712345678",
        sex: "FEMALE",
        ageYears: 32,
      });
    expect(register.status).toBe(201);
    const patientId = register.body.data.id as string;
    expect(await prisma.patient.count({ where: { phoneNormalized: "712345678" } })).toBe(1);

    const byAltPhone = await request(app).get("/api/v1/patients?q=%2B254712345678").set(auth(reception));
    expect(byAltPhone.status).toBe(200);
    expect(byAltPhone.body.data[0].id).toBe(patientId);

    const byName = await request(app).get("/api/v1/patients?q=Alice%20Njeri").set(auth(reception));
    expect(byName.body.data[0].id).toBe(patientId);

    const visit1 = await request(app)
      .post("/api/v1/encounters")
      .set(auth(reception))
      .send({ patientId, checkInToConsultation: true, clientRequestId: "11111111-1111-4111-8111-111111111111" });
    const visit2 = await request(app)
      .post("/api/v1/encounters")
      .set(auth(reception))
      .send({ patientId, checkInToConsultation: true, clientRequestId: "22222222-2222-4222-8222-222222222222" });
    expect(visit1.status).toBe(201);
    expect(visit2.status).toBe(201);
    expect(visit1.body.data.id).not.toBe(visit2.body.data.id);
    expect(visit1.body.data.patient.id).toBe(patientId);
    expect(visit2.body.data.patient.id).toBe(patientId);
    expect(await prisma.encounter.count({ where: { patientId } })).toBe(2);

    const charge = await request(app)
      .post(`/api/v1/charges/encounters/${visit1.body.data.id}`)
      .set(auth(reception))
      .send({ description: "Registration", unitPrice: 50, quantity: 1 });
    expect(charge.status).toBe(201);
    const bill = await request(app)
      .get(`/api/v1/payments/encounters/${visit1.body.data.id}`)
      .set(auth(reception));
    expect(bill.body.data.patient.id).toBe(patientId);
    expect(bill.body.data.charges[0].description).toBe("Registration");
    expect(await prisma.charge.findFirst({ where: { id: charge.body.data.id } })).toMatchObject({
      patientId,
      encounterId: visit1.body.data.id,
    });
  });

  it("replays duplicate patient and encounter submissions", async () => {
    const body = {
      firstName: "Brian",
      lastName: "Otieno",
      phone: "0799887766",
      sex: "MALE",
      ageYears: 40,
      clientRequestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    };
    const first = await request(app).post("/api/v1/patients").set(auth(reception)).send(body);
    const retry = await request(app).post("/api/v1/patients").set(auth(reception)).send(body);
    expect(first.status).toBe(201);
    expect(retry.status).toBe(201);
    expect(retry.body.data.id).toBe(first.body.data.id);
    expect(await prisma.patient.count({ where: { lastName: "Otieno" } })).toBe(1);

    const encounterBody = {
      patientId: first.body.data.id,
      clientRequestId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    };
    const e1 = await request(app).post("/api/v1/encounters").set(auth(reception)).send(encounterBody);
    const e2 = await request(app).post("/api/v1/encounters").set(auth(reception)).send(encounterBody);
    expect(e1.body.data.id).toBe(e2.body.data.id);

    const raceId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const raceBody = {
      firstName: "Race",
      lastName: "Safe",
      phone: "0700554433",
      sex: "FEMALE",
      ageYears: 22,
      clientRequestId: raceId,
    };
    const [r1, r2] = await Promise.all([
      request(app).post("/api/v1/patients").set(auth(reception)).send(raceBody),
      request(app).post("/api/v1/patients").set(auth(reception)).send(raceBody),
    ]);
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    expect(r1.body.data.id).toBe(r2.body.data.id);
    expect(await prisma.patient.count({ where: { lastName: "Safe" } })).toBe(1);
  });

  it("does not auto-merge family members who share a phone", async () => {
    const shared = "0700112233";
    const a = await request(app).post("/api/v1/patients").set(auth(reception)).send({
      firstName: "Mary",
      lastName: "Wanjiku",
      phone: shared,
      sex: "FEMALE",
      ageYears: 34,
    });
    const blocked = await request(app).post("/api/v1/patients").set(auth(reception)).send({
      firstName: "John",
      lastName: "Wanjiku",
      phone: shared,
      sex: "MALE",
      ageYears: 8,
      nextOfKin: "Mary Wanjiku",
      nextOfKinPhone: shared,
    });
    expect(a.status).toBe(201);
    expect(blocked.status).toBe(409);
    const child = await request(app).post("/api/v1/patients").set(auth(reception)).send({
      firstName: "John",
      lastName: "Wanjiku",
      phone: shared,
      sex: "MALE",
      ageYears: 8,
      nextOfKin: "Mary Wanjiku",
      nextOfKinPhone: shared,
      confirmDuplicate: true,
    });
    expect(child.status).toBe(201);
    expect(child.body.data.id).not.toBe(a.body.data.id);
  });

  it("rejects unauthorized patient registration", async () => {
    const res = await request(app).post("/api/v1/patients").set(auth(pharmacy)).send({
      firstName: "Nope",
      lastName: "User",
      phone: "0711000000",
      sex: "MALE",
      ageYears: 20,
    });
    expect(res.status).toBe(403);
    const clinical = await request(app).get("/api/v1/encounters/stats/dashboard").set(auth(doctor));
    expect(clinical.status).toBe(403);
  });
});
