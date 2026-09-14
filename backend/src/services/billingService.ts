import { ChargeSource, PaymentMethod, Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma, type TxClient } from "../lib/prisma.js";
import { writeAudit } from "../lib/audit.js";
import { badRequest, notFound } from "../lib/errors.js";
import { nextReceiptNumber } from "../lib/sequences.js";
import { money } from "../lib/serialize.js";
import { refreshEncounterStatus } from "./encounterService.js";

export async function createChargeInTx(
  tx: TxClient,
  input: {
    tenantId: string;
    encounterId: string;
    patientId: string;
    serviceId?: string | null;
    medicineId?: string | null;
    source: ChargeSource;
    description: string;
    quantity: number;
    unitPrice: number;
  },
) {
  const total = Number((input.quantity * input.unitPrice).toFixed(2));
  const charge = await tx.charge.create({
    data: {
      tenantId: input.tenantId,
      encounterId: input.encounterId,
      patientId: input.patientId,
      serviceId: input.serviceId ?? null,
      medicineId: input.medicineId ?? null,
      source: input.source,
      description: input.description,
      quantity: new Prisma.Decimal(input.quantity),
      unitPrice: new Prisma.Decimal(input.unitPrice),
      total: new Prisma.Decimal(total),
      status: "UNPAID",
    },
  });
  await writeAudit(
    {
      tenantId: input.tenantId,
      action: "charge.created",
      entity: "charge",
      entityId: charge.id,
      metadata: { description: input.description, total, source: input.source },
    },
    tx,
  );
  return charge;
}

export function serializeCharge(charge: {
  id: string;
  description: string;
  quantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  total: Prisma.Decimal;
  amountPaid: Prisma.Decimal;
  status: string;
  source: ChargeSource;
  createdAt: Date;
}) {
  return {
    id: charge.id,
    description: charge.description,
    quantity: money(charge.quantity),
    unitPrice: money(charge.unitPrice),
    total: money(charge.total),
    amountPaid: money(charge.amountPaid),
    balance: Number((money(charge.total) - money(charge.amountPaid)).toFixed(2)),
    status: charge.status,
    source: charge.source,
    createdAt: charge.createdAt,
  };
}

/**
 * Cashier/admin types a hospital charge that was not auto-created.
 * It is stored like any other charge so it appears on the receipt.
 */
export const manualChargeSchema = z.object({
  description: z.string().min(1, "Describe the charge."),
  unitPrice: z.number().nonnegative(),
  quantity: z.number().positive().optional(),
  serviceId: z.string().uuid().optional().nullable(),
});

export async function addManualCharge(
  tenantId: string,
  actorId: string,
  encounterId: string,
  input: z.infer<typeof manualChargeSchema>,
  ip?: string,
) {
  return prisma.$transaction(async (tx) => {
    const encounter = await tx.encounter.findFirst({ where: { id: encounterId, tenantId } });
    if (!encounter) throw notFound("Visit not found.");

    let description = input.description.trim();
    let unitPrice = input.unitPrice;
    if (input.serviceId) {
      const service = await tx.service.findFirst({ where: { id: input.serviceId, tenantId, active: true } });
      if (!service) throw badRequest("That service is not available in this clinic.");
      description = service.name;
      unitPrice = money(service.price);
    }

    const charge = await createChargeInTx(tx, {
      tenantId,
      encounterId,
      patientId: encounter.patientId,
      serviceId: input.serviceId ?? null,
      source: "OTHER",
      description,
      quantity: input.quantity ?? 1,
      unitPrice,
    });
    await writeAudit(
      {
        tenantId,
        userId: actorId,
        action: "charge.created",
        entity: "charge",
        entityId: charge.id,
        metadata: { description, unitPrice, manual: true },
        ipAddress: ip,
      },
      tx,
    );
    await refreshEncounterStatus(tx, tenantId, encounterId);
    return serializeCharge(charge);
  });
}

export async function listCharges(tenantId: string, encounterId?: string) {
  const charges = await prisma.charge.findMany({
    where: { tenantId, ...(encounterId ? { encounterId } : {}), status: { not: "VOIDED" } },
    orderBy: { createdAt: "asc" },
  });
  return charges.map(serializeCharge);
}

export async function encounterBilling(tenantId: string, encounterId: string) {
  const encounter = await prisma.encounter.findFirst({
    where: { id: encounterId, tenantId },
    include: {
      patient: true,
      charges: { where: { status: { not: "VOIDED" } }, orderBy: { createdAt: "asc" } },
      payments: { include: { receipt: true }, orderBy: { createdAt: "asc" } },
      receipts: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!encounter) throw notFound("Visit not found.");

  const charges = encounter.charges.map(serializeCharge);
  const total = charges.reduce((s, c) => s + c.total, 0);
  const amountPaid = charges.reduce((s, c) => s + c.amountPaid, 0);
  return {
    encounterId: encounter.id,
    visitNumber: encounter.visitNumber,
    status: encounter.status,
    patient: {
      id: encounter.patient.id,
      name: [encounter.patient.firstName, encounter.patient.middleName, encounter.patient.lastName]
        .filter(Boolean)
        .join(" "),
      patientNumber: encounter.patient.patientNumber,
    },
    charges,
    payments: encounter.payments.map((p) => ({
      id: p.id,
      amount: money(p.amount),
      method: p.method,
      reference: p.reference,
      receiptNumber: p.receipt.receiptNumber,
      createdAt: p.createdAt,
    })),
    receipts: encounter.receipts.map((r) => ({
      id: r.id,
      receiptNumber: r.receiptNumber,
      amountPaid: money(r.amountPaid),
      balance: money(r.balance),
      method: r.method,
      createdAt: r.createdAt,
    })),
    total: Number(total.toFixed(2)),
    amountPaid: Number(amountPaid.toFixed(2)),
    balance: Number((total - amountPaid).toFixed(2)),
  };
}

export const receivePaymentSchema = z.object({
  amount: z.number().positive(),
  method: z.nativeEnum(PaymentMethod),
  reference: z.string().optional().nullable(),
});

export async function receivePayment(
  tenantId: string,
  actorId: string,
  encounterId: string,
  input: z.infer<typeof receivePaymentSchema>,
  ip?: string,
) {
  return prisma.$transaction(async (tx) => {
    const encounter = await tx.encounter.findFirst({
      where: { id: encounterId, tenantId },
      include: {
        patient: true,
        charges: { where: { status: { in: ["UNPAID", "PARTIALLY_PAID"] } }, orderBy: { createdAt: "asc" } },
      },
    });
    if (!encounter) throw notFound("Visit not found.");

    const outstanding = encounter.charges.reduce((s, c) => s + money(c.total) - money(c.amountPaid), 0);
    if (outstanding <= 0) throw badRequest("There is no outstanding balance on this visit.");
    if (input.amount - outstanding > 0.009) {
      throw badRequest(`Payment exceeds the outstanding balance of ${outstanding.toFixed(2)}.`);
    }

    let remaining = Number(input.amount.toFixed(2));
    for (const charge of encounter.charges) {
      if (remaining <= 0) break;
      const due = Number((money(charge.total) - money(charge.amountPaid)).toFixed(2));
      if (due <= 0) continue;
      const apply = Math.min(due, remaining);
      const newPaid = Number((money(charge.amountPaid) + apply).toFixed(2));
      const status = newPaid >= money(charge.total) - 0.001 ? "PAID" : "PARTIALLY_PAID";
      await tx.charge.update({
        where: { id: charge.id },
        data: { amountPaid: new Prisma.Decimal(newPaid), status },
      });
      remaining = Number((remaining - apply).toFixed(2));
    }

    const allCharges = await tx.charge.findMany({
      where: { tenantId, encounterId, status: { not: "VOIDED" } },
    });
    const total = allCharges.reduce((s, c) => s + money(c.total), 0);
    const paid = allCharges.reduce((s, c) => s + money(c.amountPaid), 0);
    const balance = Number((total - paid).toFixed(2));

    const receiptNumber = await nextReceiptNumber(tx, tenantId);
    const receipt = await tx.receipt.create({
      data: {
        tenantId,
        receiptNumber,
        patientId: encounter.patientId,
        encounterId,
        issuedById: actorId,
        totalAmount: new Prisma.Decimal(total.toFixed(2)),
        amountPaid: new Prisma.Decimal(input.amount.toFixed(2)),
        balance: new Prisma.Decimal(balance),
        method: input.method,
      },
    });

    const payment = await tx.payment.create({
      data: {
        tenantId,
        patientId: encounter.patientId,
        encounterId,
        receiptId: receipt.id,
        amount: new Prisma.Decimal(input.amount.toFixed(2)),
        method: input.method,
        reference: input.reference ?? null,
        receivedById: actorId,
      },
    });

    await writeAudit(
      {
        tenantId,
        userId: actorId,
        action: "payment.received",
        entity: "payment",
        entityId: payment.id,
        metadata: { amount: input.amount, method: input.method, receiptNumber },
        ipAddress: ip,
      },
      tx,
    );
    await writeAudit(
      {
        tenantId,
        userId: actorId,
        action: "receipt.created",
        entity: "receipt",
        entityId: receipt.id,
        metadata: { receiptNumber },
        ipAddress: ip,
      },
      tx,
    );

    await refreshEncounterStatus(tx, tenantId, encounterId);
    return { payment, receipt };
  });
}

export async function getReceipt(tenantId: string, receiptId: string) {
  const receipt = await prisma.receipt.findFirst({
    where: { id: receiptId, tenantId },
    include: {
      patient: true,
      encounter: true,
      issuedBy: true,
      payments: true,
      tenant: true,
    },
  });
  if (!receipt) throw notFound("Receipt not found.");

  const charges = await prisma.charge.findMany({
    where: { tenantId, encounterId: receipt.encounterId, status: { not: "VOIDED" } },
    orderBy: { createdAt: "asc" },
  });

  return {
    receiptNumber: receipt.receiptNumber,
    createdAt: receipt.createdAt,
    clinic: {
      name: receipt.tenant.name,
      phone: receipt.tenant.phone,
      email: receipt.tenant.email,
      address: receipt.tenant.address,
      receiptFooter: receipt.tenant.receiptFooter,
      currency: receipt.tenant.currency,
      logoUrl: receipt.tenant.logoUrl,
      primaryColor: receipt.tenant.primaryColor,
    },
    patient: {
      name: [receipt.patient.firstName, receipt.patient.middleName, receipt.patient.lastName].filter(Boolean).join(" "),
      patientNumber: receipt.patient.patientNumber,
    },
    visitNumber: receipt.encounter.visitNumber,
    items: charges.map(serializeCharge),
    total: money(receipt.totalAmount),
    amountPaid: money(receipt.amountPaid),
    balance: money(receipt.balance),
    method: receipt.method,
    reference: receipt.payments[0]?.reference ?? null,
    cashier: `${receipt.issuedBy.firstName} ${receipt.issuedBy.lastName}`,
  };
}

export async function cashierToday(tenantId: string, timezone = "Africa/Nairobi") {
  const { start, end } = dayRange(timezone);
  const [pending, payments] = await Promise.all([
    prisma.encounter.findMany({
      where: {
        tenantId,
        status: { in: ["WAITING_PAYMENT", "WAITING_PHARMACY", "COMPLETED", "IN_CONSULTATION", "WAITING_LAB", "LAB_PROCESSING"] },
        charges: { some: { status: { in: ["UNPAID", "PARTIALLY_PAID"] } } },
      },
      include: { patient: true, charges: true },
      orderBy: { startedAt: "asc" },
    }),
    prisma.payment.findMany({
      where: { tenantId, createdAt: { gte: start, lt: end } },
      include: { receipt: true, encounter: true, patient: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const pendingRows = pending.map((e) => {
    const total = e.charges.reduce((s, c) => s + money(c.total), 0);
    const paid = e.charges.reduce((s, c) => s + money(c.amountPaid), 0);
    return {
      encounterId: e.id,
      visitNumber: e.visitNumber,
      patientName: [e.patient.firstName, e.patient.lastName].join(" "),
      patientNumber: e.patient.patientNumber,
      total: Number(total.toFixed(2)),
      amountPaid: Number(paid.toFixed(2)),
      balance: Number((total - paid).toFixed(2)),
      status: e.status,
    };
  });

  return {
    pending: pendingRows,
    completed: payments.map((p) => ({
      id: p.id,
      encounterId: p.encounterId,
      visitNumber: p.encounter.visitNumber,
      patientName: [p.patient.firstName, p.patient.lastName].join(" "),
      amount: money(p.amount),
      method: p.method,
      receiptNumber: p.receipt.receiptNumber,
      createdAt: p.createdAt,
    })),
    dailyTotal: Number(payments.reduce((s, p) => s + money(p.amount), 0).toFixed(2)),
  };
}

function dayRange(timezone: string) {
  const now = new Date();
  const local = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const start = new Date(`${local}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}
