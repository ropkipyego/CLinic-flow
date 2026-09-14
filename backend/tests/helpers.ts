import request from "supertest";
import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { createApp } from "../src/app.js";

export const prisma = new PrismaClient();
export const app = createApp();

export async function resetDb() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "SmsMessage",
      "SmsCampaign",
      "EmailRecord",
      "AuditLog",
      "Payment",
      "Receipt",
      "Charge",
      "DispenseItem",
      "Dispense",
      "PrescriptionItem",
      "Prescription",
      "StockMovement",
      "Medicine",
      "LabResult",
      "LabOrderItem",
      "LabOrder",
      "LabTest",
      "Diagnosis",
      "Vitals",
      "Consultation",
      "Encounter",
      "Patient",
      "Service",
      "PasswordResetToken",
      "Sequence",
      "User",
      "Tenant"
    RESTART IDENTITY CASCADE
  `);
}

export async function createTenant(slug: string, name = slug) {
  return prisma.tenant.create({
    data: {
      slug,
      name,
      timezone: "Africa/Nairobi",
      currency: "KES",
      phone: "+254700000000",
      email: `${slug}@example.com`,
      address: "Nairobi",
      receiptFooter: "Get well soon",
    },
  });
}

export async function createUser(tenantId: string, role: Role, email: string) {
  return prisma.user.create({
    data: {
      tenantId,
      email,
      passwordHash: await bcrypt.hash("Password123!", 10),
      firstName: role,
      lastName: "User",
      role,
    },
  });
}

export async function login(email: string) {
  const res = await request(app).post("/api/v1/auth/login").send({ email, password: "Password123!" });
  if (!res.body.success) throw new Error(`Login failed for ${email}: ${JSON.stringify(res.body)}`);
  return res.body.data.token as string;
}

export function auth(token: string) {
  return {
    Authorization: `Bearer ${token}`,
  };
}

export async function seedCatalog(tenantId: string) {
  const consult = await prisma.service.create({
    data: { tenantId, name: "Consultation", code: "CONSULT", category: "CONSULTATION", price: 500 },
  });
  const malariaService = await prisma.service.create({
    data: { tenantId, name: "Malaria Test", code: "MAL", category: "LABORATORY", price: 200 },
  });
  const malaria = await prisma.labTest.create({
    data: {
      tenantId,
      name: "Malaria",
      code: "MAL",
      category: "RAPID",
      price: 200,
      resultType: "POSITIVE_NEGATIVE",
      serviceId: malariaService.id,
      selectOptions: ["Positive", "Negative"],
    },
  });
  const para = await prisma.medicine.create({
    data: {
      tenantId,
      name: "Paracetamol",
      genericName: "Paracetamol",
      strength: "500mg",
      dosageForm: "Tablet",
      unit: "tab",
      sku: "PARA500",
      sellingPrice: 10,
      costPrice: 4,
      reorderLevel: 20,
      quantityOnHand: 100,
    },
  });
  return { consult, malaria, para };
}
