import { LabOrderStatus, LabResultType } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { writeAudit } from "../lib/audit.js";
import { badRequest, notFound } from "../lib/errors.js";
import { money, toNumber } from "../lib/serialize.js";
import { createChargeInTx } from "./billingService.js";
import { refreshEncounterStatus } from "./encounterService.js";

export const labTestSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  category: z.string().optional(),
  price: z.number().nonnegative(),
  resultType: z.nativeEnum(LabResultType),
  referenceRange: z.string().optional().nullable(),
  turnaroundTime: z.string().optional().nullable(),
  selectOptions: z.array(z.string()).optional().nullable(),
  active: z.boolean().optional(),
});

export const createLabOrderSchema = z.object({
  labTestIds: z.array(z.string().uuid()).min(1),
  notes: z.string().optional().nullable(),
});

export const labResultSchema = z.object({
  valueText: z.string().optional().nullable(),
  valueNumeric: z.number().optional().nullable(),
  flag: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function listLabTests(tenantId: string, activeOnly = false) {
  return prisma.labTest.findMany({
    where: { tenantId, ...(activeOnly ? { active: true } : {}) },
    orderBy: { name: "asc" },
  });
}

export async function upsertLabTest(
  tenantId: string,
  actorId: string,
  input: z.infer<typeof labTestSchema>,
  id?: string,
) {
  const data = {
    name: input.name,
    code: input.code.toUpperCase(),
    category: input.category ?? "RAPID",
    price: input.price,
    resultType: input.resultType,
    referenceRange: input.referenceRange ?? null,
    turnaroundTime: input.turnaroundTime ?? null,
    selectOptions: input.selectOptions ?? undefined,
    active: input.active ?? true,
  };

  const test = id
    ? await prisma.labTest.update({ where: { id }, data })
    : await prisma.labTest.create({ data: { tenantId, ...data } });

  const existingService = await prisma.service.findFirst({
    where: { tenantId, code: test.code },
  });
  if (existingService) {
    await prisma.service.update({
      where: { id: existingService.id },
      data: { name: test.name, price: test.price, active: test.active, category: "LABORATORY" },
    });
    if (!test.serviceId) {
      await prisma.labTest.update({ where: { id: test.id }, data: { serviceId: existingService.id } });
    }
  } else {
    const service = await prisma.service.create({
      data: {
        tenantId,
        name: test.name,
        code: test.code,
        category: "LABORATORY",
        price: test.price,
        active: test.active,
      },
    });
    await prisma.labTest.update({ where: { id: test.id }, data: { serviceId: service.id } });
  }

  await writeAudit({
    tenantId,
    userId: actorId,
    action: id ? "lab_test.updated" : "lab_test.created",
    entity: "lab_test",
    entityId: test.id,
  });
  return prisma.labTest.findFirst({ where: { id: test.id, tenantId } });
}

export async function createLabOrder(
  tenantId: string,
  actorId: string,
  encounterId: string,
  input: z.infer<typeof createLabOrderSchema>,
  ip?: string,
) {
  const encounter = await prisma.encounter.findFirst({ where: { id: encounterId, tenantId } });
  if (!encounter) throw notFound("Visit not found.");

  const tests = await prisma.labTest.findMany({
    where: { tenantId, id: { in: input.labTestIds }, active: true },
  });
  if (tests.length !== input.labTestIds.length) {
    throw badRequest("One or more laboratory tests are invalid or inactive.");
  }

  return prisma.$transaction(async (tx) => {
    const order = await tx.labOrder.create({
      data: {
        tenantId,
        encounterId,
        patientId: encounter.patientId,
        orderedById: actorId,
        notes: input.notes ?? null,
        status: "REQUESTED",
      },
    });

    for (const test of tests) {
      const charge = await createChargeInTx(tx, {
        tenantId,
        encounterId,
        patientId: encounter.patientId,
        serviceId: test.serviceId,
        source: "LABORATORY",
        description: test.name,
        quantity: 1,
        unitPrice: money(test.price),
      });
      await tx.labOrderItem.create({
        data: {
          tenantId,
          labOrderId: order.id,
          labTestId: test.id,
          chargeId: charge.id,
        },
      });
    }

    await tx.encounter.update({
      where: { id: encounterId },
      data: { status: "WAITING_LAB" },
    });
    await writeAudit(
      {
        tenantId,
        userId: actorId,
        action: "lab_order.created",
        entity: "lab_order",
        entityId: order.id,
        metadata: { tests: tests.map((t) => t.code) },
        ipAddress: ip,
      },
      tx,
    );
    await refreshEncounterStatus(tx, tenantId, encounterId);
    return tx.labOrder.findFirst({
      where: { id: order.id },
      include: { items: { include: { labTest: true } }, patient: true, encounter: true },
    });
  });
}

export async function labQueue(tenantId: string, status?: LabOrderStatus) {
  return prisma.labOrder.findMany({
    where: {
      tenantId,
      status: status ?? { in: ["REQUESTED", "ACCEPTED", "PROCESSING"] },
    },
    include: {
      patient: true,
      encounter: true,
      items: { include: { labTest: true, result: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function getLabOrder(tenantId: string, orderId: string) {
  const order = await prisma.labOrder.findFirst({
    where: { id: orderId, tenantId },
    include: {
      patient: true,
      encounter: true,
      items: { include: { labTest: true, result: true } },
    },
  });
  if (!order) throw notFound("Laboratory request not found.");
  return order;
}

export async function updateLabOrderStatus(
  tenantId: string,
  actorId: string,
  orderId: string,
  status: LabOrderStatus,
) {
  const existing = await prisma.labOrder.findFirst({ where: { id: orderId, tenantId } });
  if (!existing) throw notFound("Laboratory request not found.");
  const order = await prisma.$transaction(async (tx) => {
    const updated = await tx.labOrder.update({
      where: { id: orderId },
      data: { status },
      include: { items: { include: { labTest: true, result: true } }, patient: true, encounter: true },
    });
    await refreshEncounterStatus(tx, tenantId, existing.encounterId);
    return updated;
  });
  await writeAudit({
    tenantId,
    userId: actorId,
    action: "lab_order.status_changed",
    entity: "lab_order",
    entityId: orderId,
    metadata: { status },
  });
  return order;
}

export async function saveLabResult(
  tenantId: string,
  actorId: string,
  itemId: string,
  input: z.infer<typeof labResultSchema>,
  ip?: string,
) {
  const item = await prisma.labOrderItem.findFirst({
    where: { id: itemId, tenantId },
    include: { labOrder: true, labTest: true },
  });
  if (!item) throw notFound("Laboratory order item not found.");

  if (item.labTest.resultType === "NUMERIC" && input.valueNumeric === undefined) {
    throw badRequest("A numeric result is required for this test.");
  }
  if (item.labTest.resultType !== "NUMERIC" && !input.valueText) {
    throw badRequest("A result value is required for this test.");
  }

  const result = await prisma.$transaction(async (tx) => {
    const saved = await tx.labResult.upsert({
      where: { labOrderItemId: itemId },
      create: {
        tenantId,
        patientId: item.labOrder.patientId,
        encounterId: item.labOrder.encounterId,
        labOrderId: item.labOrderId,
        labOrderItemId: itemId,
        labTestId: item.labTestId,
        performedById: actorId,
        valueText: input.valueText ?? null,
        valueNumeric: input.valueNumeric ?? null,
        flag: input.flag ?? null,
        notes: input.notes ?? null,
      },
      update: {
        valueText: input.valueText ?? null,
        valueNumeric: input.valueNumeric ?? null,
        flag: input.flag ?? null,
        notes: input.notes ?? null,
        performedById: actorId,
      },
    });
    await tx.labOrderItem.update({ where: { id: itemId }, data: { status: "COMPLETED" } });
    const remaining = await tx.labOrderItem.count({
      where: { labOrderId: item.labOrderId, result: { is: null } },
    });
    await tx.labOrder.update({
      where: { id: item.labOrderId },
      data: { status: remaining === 0 ? "COMPLETED" : "PROCESSING" },
    });
    await writeAudit(
      {
        tenantId,
        userId: actorId,
        action: "lab_result.entered",
        entity: "lab_result",
        entityId: saved.id,
        metadata: { labTestId: item.labTestId },
        ipAddress: ip,
      },
      tx,
    );
    await refreshEncounterStatus(tx, tenantId, item.labOrder.encounterId);
    return saved;
  });

  return { ...result, valueNumeric: toNumber(result.valueNumeric) };
}

export async function patientLabResults(tenantId: string, patientId: string) {
  return prisma.labResult.findMany({
    where: { tenantId, patientId },
    include: { labTest: true, encounter: true, performedBy: true },
    orderBy: { createdAt: "desc" },
  });
}
