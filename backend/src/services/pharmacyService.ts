import { Prisma, StockMovementType } from "@prisma/client";
import { z } from "zod";
import { prisma, type TxClient } from "../lib/prisma.js";
import { writeAudit } from "../lib/audit.js";
import { badRequest, forbidden, notFound } from "../lib/errors.js";
import { money } from "../lib/serialize.js";
import { createChargeInTx } from "./billingService.js";
import { refreshEncounterStatus } from "./encounterService.js";
import { createWalkInEncounter, findOrCreateWalkInPatient, walkInClientSchema } from "./walkInService.js";

export const medicineSchema = z.object({
  name: z.string().min(1),
  genericName: z.string().optional().nullable(),
  strength: z.string().optional().nullable(),
  dosageForm: z.string().optional().nullable(),
  unit: z.string().optional(),
  sku: z.string().min(1),
  sellingPrice: z.number().nonnegative(),
  costPrice: z.number().nonnegative(),
  reorderLevel: z.number().int().nonnegative().optional(),
  active: z.boolean().optional(),
});

export const stockMovementSchema = z.object({
  medicineId: z.string().uuid(),
  type: z.nativeEnum(StockMovementType),
  quantity: z.number().int().positive(),
  direction: z.enum(["IN", "OUT"]).optional(),
  reference: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const prescriptionSchema = z.object({
  notes: z.string().optional().nullable(),
  items: z
    .array(
      z.object({
        medicineId: z.string().uuid(),
        dose: z.string().min(1),
        frequency: z.string().min(1),
        duration: z.string().min(1),
        quantity: z.number().int().positive(),
        instructions: z.string().optional().nullable(),
      }),
    )
    .min(1),
});

export const dispenseSchema = z.object({
  items: z
    .array(
      z.object({
        prescriptionItemId: z.string().uuid(),
        quantity: z.number().int().positive(),
      }),
    )
    .min(1),
  overrideInsufficientStock: z.boolean().optional(),
});

export async function listMedicines(tenantId: string, opts?: { lowStock?: boolean; activeOnly?: boolean }) {
  return prisma.medicine.findMany({
    where: {
      tenantId,
      ...(opts?.activeOnly ? { active: true } : {}),
    },
    orderBy: { name: "asc" },
  }).then((rows) =>
    rows
      .filter((m) => (opts?.lowStock ? m.quantityOnHand <= m.reorderLevel : true))
      .map(serializeMedicine),
  );
}

export function serializeMedicine(m: {
  id: string;
  name: string;
  genericName: string | null;
  strength: string | null;
  dosageForm: string | null;
  unit: string;
  sku: string;
  sellingPrice: Prisma.Decimal;
  costPrice: Prisma.Decimal;
  reorderLevel: number;
  quantityOnHand: number;
  active: boolean;
}) {
  return {
    ...m,
    sellingPrice: money(m.sellingPrice),
    costPrice: money(m.costPrice),
    lowStock: m.quantityOnHand <= m.reorderLevel,
  };
}

export async function upsertMedicine(
  tenantId: string,
  actorId: string,
  input: z.infer<typeof medicineSchema>,
  id?: string,
) {
  const data = {
    name: input.name,
    genericName: input.genericName ?? null,
    strength: input.strength ?? null,
    dosageForm: input.dosageForm ?? null,
    unit: input.unit ?? "unit",
    sku: input.sku.toUpperCase(),
    sellingPrice: input.sellingPrice,
    costPrice: input.costPrice,
    reorderLevel: input.reorderLevel ?? 10,
    active: input.active ?? true,
  };
  const medicine = id
    ? await prisma.medicine.update({ where: { id }, data })
    : await prisma.medicine.create({ data: { tenantId, ...data } });
  await writeAudit({
    tenantId,
    userId: actorId,
    action: id ? "medicine.updated" : "medicine.created",
    entity: "medicine",
    entityId: medicine.id,
  });
  return serializeMedicine(medicine);
}

async function moveStock(
  tx: TxClient,
  input: {
    tenantId: string;
    medicineId: string;
    userId: string;
    type: StockMovementType;
    quantity: number;
    signedDelta: number;
    reference?: string | null;
    notes?: string | null;
    allowNegative?: boolean;
  },
) {
  const rows = await tx.$queryRaw<Array<{ id: string; quantityOnHand: number }>>`
    SELECT id, "quantityOnHand" FROM "Medicine" WHERE id = ${input.medicineId} AND "tenantId" = ${input.tenantId} FOR UPDATE
  `;
  const medicine = rows[0];
  if (!medicine) throw notFound("Medicine not found.");
  const previous = medicine.quantityOnHand;
  const next = previous + input.signedDelta;
  if (next < 0 && !input.allowNegative) {
    throw badRequest("Insufficient stock to complete this movement.");
  }
  await tx.medicine.update({
    where: { id: input.medicineId },
    data: { quantityOnHand: next },
  });
  return tx.stockMovement.create({
    data: {
      tenantId: input.tenantId,
      medicineId: input.medicineId,
      type: input.type,
      quantity: input.quantity,
      previousQuantity: previous,
      newQuantity: next,
      userId: input.userId,
      reference: input.reference ?? null,
      notes: input.notes ?? null,
    },
  });
}

export async function recordStockMovement(
  tenantId: string,
  actorId: string,
  role: string,
  input: z.infer<typeof stockMovementSchema>,
  ip?: string,
) {
  const inbound =
    input.type !== "DISPENSE" &&
    (input.direction === "IN" ||
      (input.direction !== "OUT" &&
        (input.type === "PURCHASE" || input.type === "RETURN" || input.type === "OPENING_BALANCE")));
  const signedDelta = inbound ? input.quantity : -input.quantity;

  const movement = await prisma.$transaction(async (tx) => {
    const created = await moveStock(tx, {
      tenantId,
      medicineId: input.medicineId,
      userId: actorId,
      type: input.type,
      quantity: input.quantity,
      signedDelta,
      reference: input.reference,
      notes: input.notes,
      allowNegative: role === "ADMIN",
    });
    await writeAudit(
      {
        tenantId,
        userId: actorId,
        action: "stock.adjusted",
        entity: "stock_movement",
        entityId: created.id,
        metadata: { type: input.type, quantity: input.quantity },
        ipAddress: ip,
      },
      tx,
    );
    return created;
  });
  return movement;
}

export async function createPrescription(
  tenantId: string,
  actorId: string,
  encounterId: string,
  input: z.infer<typeof prescriptionSchema>,
  ip?: string,
) {
  const encounter = await prisma.encounter.findFirst({ where: { id: encounterId, tenantId } });
  if (!encounter) throw notFound("Visit not found.");
  const medicines = await prisma.medicine.findMany({
    where: { tenantId, id: { in: input.items.map((i) => i.medicineId) }, active: true },
  });
  if (medicines.length !== new Set(input.items.map((i) => i.medicineId)).size) {
    throw badRequest("One or more medicines are invalid or inactive.");
  }

  const prescription = await prisma.$transaction(async (tx) => {
    const created = await tx.prescription.create({
      data: {
        tenantId,
        encounterId,
        patientId: encounter.patientId,
        doctorId: actorId,
        notes: input.notes ?? null,
        items: {
          create: input.items.map((item) => ({
            tenantId,
            medicineId: item.medicineId,
            dose: item.dose,
            frequency: item.frequency,
            duration: item.duration,
            quantity: item.quantity,
            instructions: item.instructions ?? null,
          })),
        },
      },
      include: { items: { include: { medicine: true } }, patient: true, encounter: true },
    });
    await tx.encounter.update({
      where: { id: encounterId },
      data: { status: "WAITING_PHARMACY" },
    });
    await writeAudit(
      {
        tenantId,
        userId: actorId,
        action: "prescription.created",
        entity: "prescription",
        entityId: created.id,
        ipAddress: ip,
      },
      tx,
    );
    await refreshEncounterStatus(tx, tenantId, encounterId);
    return created;
  });
  return prescription;
}

export async function pharmacyQueue(tenantId: string) {
  return prisma.prescription.findMany({
    where: { tenantId, status: { in: ["PENDING", "PARTIALLY_DISPENSED"] } },
    include: {
      patient: true,
      encounter: true,
      items: { include: { medicine: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function getPrescription(tenantId: string, id: string) {
  const rx = await prisma.prescription.findFirst({
    where: { id, tenantId },
    include: { patient: true, encounter: true, items: { include: { medicine: true } }, dispenses: { include: { items: true } } },
  });
  if (!rx) throw notFound("Prescription not found.");
  return rx;
}

export async function dispensePrescription(
  tenantId: string,
  actorId: string,
  role: string,
  prescriptionId: string,
  input: z.infer<typeof dispenseSchema>,
  ip?: string,
) {
  if (input.overrideInsufficientStock && role !== "ADMIN") {
    throw forbidden("Only an administrator can override insufficient stock.");
  }

  return prisma.$transaction(async (tx) => {
    const rx = await tx.prescription.findFirst({
      where: { id: prescriptionId, tenantId },
      include: { items: { include: { medicine: true } } },
    });
    if (!rx) throw notFound("Prescription not found.");
    if (rx.status === "DISPENSED" || rx.status === "CANCELLED") {
      throw badRequest("This prescription cannot be dispensed.");
    }

    const dispense = await tx.dispense.create({
      data: {
        tenantId,
        prescriptionId,
        encounterId: rx.encounterId,
        patientId: rx.patientId,
        pharmacistId: actorId,
      },
    });

    for (const item of input.items) {
      const rxItem = rx.items.find((i) => i.id === item.prescriptionItemId);
      if (!rxItem) throw badRequest("A prescribed item was not found on this prescription.");
      const remaining = rxItem.quantity - rxItem.dispensedQty;
      if (item.quantity > remaining) {
        throw badRequest(`Cannot dispense more than the remaining quantity for ${rxItem.medicine.name}.`);
      }

      const movement = await moveStock(tx, {
        tenantId,
        medicineId: rxItem.medicineId,
        userId: actorId,
        type: "DISPENSE",
        quantity: item.quantity,
        signedDelta: -item.quantity,
        reference: prescriptionId,
        notes: `Dispense ${rxItem.medicine.name}`,
        allowNegative: Boolean(input.overrideInsufficientStock && role === "ADMIN"),
      });

      const charge = await createChargeInTx(tx, {
        tenantId,
        encounterId: rx.encounterId,
        patientId: rx.patientId,
        medicineId: rxItem.medicineId,
        source: "PHARMACY",
        description: `${rxItem.medicine.name}${rxItem.medicine.strength ? ` ${rxItem.medicine.strength}` : ""}`,
        quantity: item.quantity,
        unitPrice: money(rxItem.medicine.sellingPrice),
      });

      await tx.dispenseItem.create({
        data: {
          tenantId,
          dispenseId: dispense.id,
          prescriptionItemId: rxItem.id,
          medicineId: rxItem.medicineId,
          quantity: item.quantity,
          chargeId: charge.id,
        },
      });
      await tx.prescriptionItem.update({
        where: { id: rxItem.id },
        data: { dispensedQty: { increment: item.quantity } },
      });
      void movement;
    }

    const updatedItems = await tx.prescriptionItem.findMany({ where: { prescriptionId } });
    const fully = updatedItems.every((i) => i.dispensedQty >= i.quantity);
    await tx.prescription.update({
      where: { id: prescriptionId },
      data: { status: fully ? "DISPENSED" : "PARTIALLY_DISPENSED" },
    });
    await writeAudit(
      {
        tenantId,
        userId: actorId,
        action: "medicine.dispensed",
        entity: "prescription",
        entityId: prescriptionId,
        ipAddress: ip,
      },
      tx,
    );
    await refreshEncounterStatus(tx, tenantId, rx.encounterId);
    return tx.prescription.findFirst({
      where: { id: prescriptionId },
      include: { items: { include: { medicine: true } }, dispenses: { include: { items: true } } },
    });
  });
}

export async function listStockMovements(tenantId: string, medicineId?: string) {
  return prisma.stockMovement.findMany({
    where: { tenantId, ...(medicineId ? { medicineId } : {}) },
    include: { medicine: true, user: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

export const otcSaleSchema = z.object({
  client: walkInClientSchema,
  items: z
    .array(
      z.object({
        medicineId: z.string().uuid(),
        quantity: z.number().int().positive(),
      }),
    )
    .min(1, "Add at least one medicine."),
  notes: z.string().optional().nullable(),
  clientRequestId: z.string().uuid().optional().nullable(),
});

export async function sellOtc(
  tenantId: string,
  actorId: string,
  role: string,
  input: z.infer<typeof otcSaleSchema>,
  ip?: string,
) {
  const uniqueIds = [...new Set(input.items.map((item) => item.medicineId))];
  const medicines = await prisma.medicine.findMany({
    where: { tenantId, id: { in: uniqueIds }, active: true },
  });
  if (medicines.length !== uniqueIds.length) {
    throw badRequest("One or more medicines are invalid or inactive.");
  }

  return prisma.$transaction(async (tx) => {
    const patient = await findOrCreateWalkInPatient(tx, tenantId, actorId, input.client);
    const encounter = await createWalkInEncounter(
      tx,
      tenantId,
      actorId,
      patient.id,
      "OTC_PHARMACY",
      input.notes ?? "Over-the-counter sale",
      input.clientRequestId,
    );
    const existingCharges = "charges" in encounter && Array.isArray(encounter.charges) ? encounter.charges : [];
    if (existingCharges.length) {
      const total = existingCharges.reduce((sum: number, charge: { total: unknown }) => sum + money(charge.total as never), 0);
      return {
        encounterId: encounter.id,
        visitNumber: encounter.visitNumber,
        visitType: encounter.visitType,
        status: encounter.status,
        replayed: true,
        patient: {
          id: patient.id,
          name: `${patient.firstName} ${patient.lastName}`,
          patientNumber: patient.patientNumber,
          phone: patient.phone,
          age: patient.ageYears,
        },
        items: [],
        total: Number(total.toFixed(2)),
      };
    }

    const merged = new Map<string, number>();
    for (const item of input.items) {
      merged.set(item.medicineId, (merged.get(item.medicineId) || 0) + item.quantity);
    }
    const saleItems = [...merged.entries()].map(([medicineId, quantity]) => ({ medicineId, quantity }));

    const prescription = await tx.prescription.create({
      data: {
        tenantId,
        encounterId: encounter.id,
        patientId: patient.id,
        doctorId: actorId,
        notes: input.notes ?? "OTC sale",
        status: "DISPENSED",
        items: {
          create: saleItems.map((item) => {
            const medicine = medicines.find((m) => m.id === item.medicineId)!;
            return {
              tenantId,
              medicineId: item.medicineId,
              dose: "OTC",
              frequency: "as directed",
              duration: "OTC",
              quantity: item.quantity,
              dispensedQty: item.quantity,
              instructions: `${medicine.name} over-the-counter`,
            };
          }),
        },
      },
      include: { items: { include: { medicine: true } } },
    });

    const dispense = await tx.dispense.create({
      data: {
        tenantId,
        prescriptionId: prescription.id,
        encounterId: encounter.id,
        patientId: patient.id,
        pharmacistId: actorId,
      },
    });

    const charges = [];
    for (const item of saleItems) {
      const rxItem = prescription.items.find((row) => row.medicineId === item.medicineId);
      if (!rxItem) throw badRequest("OTC item could not be recorded.");
      const medicine = medicines.find((m) => m.id === item.medicineId)!;
      await moveStock(tx, {
        tenantId,
        medicineId: item.medicineId,
        userId: actorId,
        type: "DISPENSE",
        quantity: item.quantity,
        signedDelta: -item.quantity,
        reference: encounter.visitNumber,
        notes: `OTC ${medicine.name}`,
        allowNegative: role === "ADMIN",
      });
      const charge = await createChargeInTx(tx, {
        tenantId,
        encounterId: encounter.id,
        patientId: patient.id,
        medicineId: item.medicineId,
        source: "PHARMACY",
        description: `${medicine.name}${medicine.strength ? ` ${medicine.strength}` : ""}`,
        quantity: item.quantity,
        unitPrice: money(medicine.sellingPrice),
      });
      charges.push(charge);
      await tx.dispenseItem.create({
        data: {
          tenantId,
          dispenseId: dispense.id,
          prescriptionItemId: rxItem.id,
          medicineId: item.medicineId,
          quantity: item.quantity,
          chargeId: charge.id,
        },
      });
    }

    await writeAudit(
      {
        tenantId,
        userId: actorId,
        action: "pharmacy.otc_sold",
        entity: "encounter",
        entityId: encounter.id,
        metadata: { visitNumber: encounter.visitNumber, items: input.items.length },
        ipAddress: ip,
      },
      tx,
    );
    await refreshEncounterStatus(tx, tenantId, encounter.id);

    const total = charges.reduce((sum, charge) => sum + money(charge.total), 0);
    return {
      encounterId: encounter.id,
      visitNumber: encounter.visitNumber,
      visitType: encounter.visitType,
      status: "WAITING_PAYMENT",
      patient: {
        id: patient.id,
        name: `${patient.firstName} ${patient.lastName}`,
        patientNumber: patient.patientNumber,
        phone: patient.phone,
        age: patient.ageYears,
      },
      items: prescription.items.map((item) => ({
        medicine: item.medicine.name,
        quantity: item.quantity,
        unitPrice: money(item.medicine.sellingPrice),
        total: Number((money(item.medicine.sellingPrice) * item.quantity).toFixed(2)),
      })),
      total: Number(total.toFixed(2)),
    };
  });
}
