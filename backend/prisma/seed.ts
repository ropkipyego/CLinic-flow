import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { CLINIC_LAB_TESTS, MANUAL_CHARGE_SERVICES } from "../src/data/labCatalog.js";

const prisma = new PrismaClient();

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed production.");
  process.exit(1);
}

async function main() {
  const password = await bcrypt.hash("Password123!", 10);

  const tenant = await prisma.tenant.upsert({
    where: { slug: "demo-clinic" },
    update: {
      primaryColor: "#1B6CB3",
      secondaryColor: "#C62828",
      logoUrl: "/logo.png",
    },
    create: {
      name: "Community Health Services",
      slug: "demo-clinic",
      logoUrl: "/logo.png",
      primaryColor: "#1B6CB3",
      secondaryColor: "#C62828",
      phone: "+254700000000",
      email: "clinic@example.com",
      address: "Nairobi, Kenya",
      website: "https://example.com",
      receiptFooter: "Thank you for visiting. Get well soon.",
      smsSenderId: "CLINIC",
      timezone: "Africa/Nairobi",
      currency: "KES",
    },
  });

  const users = [
    { email: "admin@demo.clinic", firstName: "Amina", lastName: "Otieno", role: "ADMIN" as const },
    { email: "reception@demo.clinic", firstName: "James", lastName: "Mwangi", role: "RECEPTION" as const },
    { email: "doctor@demo.clinic", firstName: "Grace", lastName: "Wanjiku", role: "DOCTOR" as const },
    { email: "lab@demo.clinic", firstName: "Peter", lastName: "Kamau", role: "LAB" as const },
    { email: "pharmacy@demo.clinic", firstName: "Faith", lastName: "Njeri", role: "PHARMACY" as const },
    { email: "cashier@demo.clinic", firstName: "Brian", lastName: "Ochieng", role: "CASHIER" as const },
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: u.email } },
      update: {},
      create: { tenantId: tenant.id, ...u, passwordHash: password },
    });
  }

  for (const s of MANUAL_CHARGE_SERVICES) {
    await prisma.service.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: s.code } },
      update: { price: s.price, name: s.name, active: true, category: s.category },
      create: { tenantId: tenant.id, ...s },
    });
  }

  for (const t of CLINIC_LAB_TESTS) {
    const service = await prisma.service.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: t.code } },
      update: { price: t.price, name: t.name, active: true, category: "LABORATORY" },
      create: {
        tenantId: tenant.id,
        name: t.name,
        code: t.code,
        category: "LABORATORY",
        price: t.price,
      },
    });
    await prisma.labTest.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: t.code } },
      update: {
        name: t.name,
        price: t.price,
        category: t.category,
        resultType: t.resultType,
        referenceRange: t.referenceRange ?? null,
        turnaroundTime: t.tat,
        serviceId: service.id,
        selectOptions: t.selectOptions,
        active: true,
      },
      create: {
        tenantId: tenant.id,
        name: t.name,
        code: t.code,
        category: t.category,
        price: t.price,
        resultType: t.resultType,
        referenceRange: t.referenceRange ?? null,
        turnaroundTime: t.tat,
        serviceId: service.id,
        selectOptions: t.selectOptions,
      },
    });
  }

  const medicines = [
    { name: "Paracetamol", genericName: "Paracetamol", strength: "500mg", dosageForm: "Tablet", unit: "tab", sku: "PARA500", sellingPrice: 10, costPrice: 4, reorderLevel: 50, quantityOnHand: 200 },
    { name: "Amoxicillin", genericName: "Amoxicillin", strength: "250mg", dosageForm: "Capsule", unit: "cap", sku: "AMOX250", sellingPrice: 20, costPrice: 8, reorderLevel: 40, quantityOnHand: 120 },
    { name: "ORS", genericName: "Oral rehydration salts", strength: "20.5g", dosageForm: "Sachet", unit: "sachet", sku: "ORS205", sellingPrice: 30, costPrice: 12, reorderLevel: 20, quantityOnHand: 80 },
    { name: "AL", genericName: "Artemether/Lumefantrine", strength: "20/120mg", dosageForm: "Tablet", unit: "tab", sku: "AL20120", sellingPrice: 15, costPrice: 6, reorderLevel: 30, quantityOnHand: 90 },
  ];

  const admin = await prisma.user.findFirst({ where: { tenantId: tenant.id, email: "admin@demo.clinic" } });
  for (const m of medicines) {
    const med = await prisma.medicine.upsert({
      where: { tenantId_sku: { tenantId: tenant.id, sku: m.sku } },
      update: { quantityOnHand: m.quantityOnHand, sellingPrice: m.sellingPrice },
      create: { tenantId: tenant.id, ...m, active: true },
    });
    const existingMove = await prisma.stockMovement.findFirst({
      where: { tenantId: tenant.id, medicineId: med.id, type: "OPENING_BALANCE" },
    });
    if (!existingMove && admin) {
      await prisma.stockMovement.create({
        data: {
          tenantId: tenant.id,
          medicineId: med.id,
          type: "OPENING_BALANCE",
          quantity: m.quantityOnHand,
          previousQuantity: 0,
          newQuantity: m.quantityOnHand,
          userId: admin.id,
          reference: "SEED",
          notes: "Opening balance",
        },
      });
    }
  }

  const samplePatients = [
    { firstName: "Mary", lastName: "Achieng", phone: "0711000001", sex: "FEMALE" as const, ageYears: 28 },
    { firstName: "John", lastName: "Kiprop", phone: "0711000002", sex: "MALE" as const, ageYears: 41 },
    { firstName: "Esther", lastName: "Mutiso", phone: "0711000003", sex: "FEMALE" as const, ageYears: 19 },
  ];

  for (const [i, p] of samplePatients.entries()) {
    const number = `CLF-${String(i + 1).padStart(6, "0")}`;
    await prisma.patient.upsert({
      where: { tenantId_patientNumber: { tenantId: tenant.id, patientNumber: number } },
      update: {},
      create: {
        tenantId: tenant.id,
        patientNumber: number,
        ...p,
        paymentMethod: "CASH",
      },
    });
  }

  await prisma.sequence.upsert({
    where: { tenantId_name_dateKey: { tenantId: tenant.id, name: "patient", dateKey: "" } },
    update: { value: samplePatients.length },
    create: { tenantId: tenant.id, name: "patient", dateKey: "", value: samplePatients.length },
  });

  console.log("Seed complete. Demo tenant: demo-clinic");
  console.log("Users: admin|reception|doctor|lab|pharmacy|cashier @demo.clinic / Password123!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
