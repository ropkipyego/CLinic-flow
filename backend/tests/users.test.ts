import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app, auth, createTenant, createUser, login, prisma, resetDb } from "./helpers.js";

describe("user administration safeguards", () => {
  let admin: string;
  let superAdmin: string;
  let tenantId: string;
  let staffId: string;

  beforeAll(async () => {
    await prisma.$connect();
    await resetDb();
    const tenant = await createTenant("user-clinic", "User Clinic");
    tenantId = tenant.id;
    await createUser(tenant.id, "SUPER_ADMIN", "super.user@test.clinic");
    await createUser(tenant.id, "ADMIN", "admin.user@test.clinic");
    const staff = await createUser(tenant.id, "RECEPTION", "desk.user@test.clinic");
    staffId = staff.id;
    superAdmin = await login("super.user@test.clinic");
    admin = await login("admin.user@test.clinic");
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("deactivates a user and rejects further API access", async () => {
    const token = await login("desk.user@test.clinic");
    const ok = await request(app).get("/api/v1/patients").set(auth(token));
    expect(ok.status).toBe(200);
    const off = await request(app).patch(`/api/v1/users/${staffId}`).set(auth(admin)).send({ active: false });
    expect(off.status).toBe(200);
    const denied = await request(app).get("/api/v1/patients").set(auth(token));
    expect(denied.status).toBe(401);
  });

  it("refuses to delete a user with historical references and protects the last Super Admin", async () => {
    const reception = await createUser(tenantId, "RECEPTION", "hist.user@test.clinic");
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: reception.id,
        action: "patient.created",
        entity: "patient",
      },
    });
    const delHist = await request(app).delete(`/api/v1/users/${reception.id}`).set(auth(admin));
    expect(delHist.status).toBe(409);

    const supers = await prisma.user.findMany({ where: { tenantId, role: "SUPER_ADMIN" } });
    expect(supers).toHaveLength(1);
    const demote = await request(app)
      .patch(`/api/v1/users/${supers[0]!.id}`)
      .set(auth(superAdmin))
      .send({ active: false });
    expect(demote.status).toBe(400);

    const unused = await createUser(tenantId, "CASHIER", "fresh.user@test.clinic");
    const deleted = await request(app).delete(`/api/v1/users/${unused.id}`).set(auth(admin));
    expect(deleted.status).toBe(200);
    expect(await prisma.user.findFirst({ where: { id: unused.id } })).toBeNull();
  });
});
