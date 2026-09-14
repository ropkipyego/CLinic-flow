import { EncounterStatus, VisitType } from "@prisma/client";
import { z } from "zod";
import { prisma, type TxClient } from "../lib/prisma.js";
import { writeAudit } from "../lib/audit.js";
import { badRequest, notFound } from "../lib/errors.js";
import { nextVisitNumber } from "../lib/sequences.js";
import { displayName, money, patientAge } from "../lib/serialize.js";

export const createEncounterSchema = z.object({
  patientId: z.string().uuid(),
  assignedDoctorId: z.string().uuid().optional().nullable(),
  notes: z.string().optional().nullable(),
  checkInToConsultation: z.boolean().optional(),
  visitType: z.nativeEnum(VisitType).optional(),
});

const patientSelect = {
  id: true,
  patientNumber: true,
  firstName: true,
  middleName: true,
  lastName: true,
  phone: true,
  sex: true,
  dateOfBirth: true,
  ageYears: true,
};

export function serializeEncounter(encounter: {
  id: string;
  visitNumber: string;
  visitType?: VisitType;
  status: EncounterStatus;
  assignedDoctorId: string | null;
  createdById: string;
  startedAt: Date;
  completedAt: Date | null;
  notes: string | null;
  patient: {
    id: string;
    patientNumber: string;
    firstName: string;
    middleName: string | null;
    lastName: string;
    phone: string;
    sex: string;
    dateOfBirth: Date | null;
    ageYears: number | null;
  };
  assignedDoctor?: { id: string; firstName: string; lastName: string } | null;
  unpaidBalance?: number;
  chargeTotal?: number;
}) {
  return {
    id: encounter.id,
    visitNumber: encounter.visitNumber,
    visitType: encounter.visitType ?? "STANDARD",
    status: encounter.status,
    assignedDoctorId: encounter.assignedDoctorId,
    createdById: encounter.createdById,
    startedAt: encounter.startedAt,
    completedAt: encounter.completedAt,
    notes: encounter.notes,
    unpaidBalance: encounter.unpaidBalance ?? 0,
    chargeTotal: encounter.chargeTotal ?? 0,
    patient: {
      ...encounter.patient,
      name: displayName(encounter.patient),
      age: patientAge(encounter.patient.dateOfBirth, encounter.patient.ageYears),
    },
    assignedDoctor: encounter.assignedDoctor
      ? {
          id: encounter.assignedDoctor.id,
          name: `${encounter.assignedDoctor.firstName} ${encounter.assignedDoctor.lastName}`,
        }
      : null,
  };
}

export async function createEncounter(
  tenantId: string,
  actorId: string,
  input: z.infer<typeof createEncounterSchema>,
  ip?: string,
) {
  const patient = await prisma.patient.findFirst({ where: { id: input.patientId, tenantId } });
  if (!patient) throw notFound("Patient not found.");

  if (input.assignedDoctorId) {
    const doctor = await prisma.user.findFirst({
      where: { id: input.assignedDoctorId, tenantId, role: { in: ["DOCTOR", "ADMIN"] }, active: true },
    });
    if (!doctor) throw badRequest("Assigned doctor was not found in this clinic.");
  }

  const encounter = await prisma.$transaction(async (tx) => {
    const visitNumber = await nextVisitNumber(tx, tenantId);
    const created = await tx.encounter.create({
      data: {
        tenantId,
        patientId: input.patientId,
        visitNumber,
        createdById: actorId,
        assignedDoctorId: input.assignedDoctorId ?? null,
        notes: input.notes ?? null,
        visitType: input.visitType ?? "STANDARD",
        status: input.checkInToConsultation ? "WAITING_CONSULTATION" : "REGISTERED",
      },
      include: { patient: { select: patientSelect }, assignedDoctor: true },
    });
    await writeAudit(
      {
        tenantId,
        userId: actorId,
        action: "encounter.created",
        entity: "encounter",
        entityId: created.id,
        metadata: { visitNumber, patientId: input.patientId },
        ipAddress: ip,
      },
      tx,
    );
    return created;
  });
  return serializeEncounter(encounter);
}

export async function getEncounter(tenantId: string, encounterId: string) {
  const encounter = await prisma.encounter.findFirst({
    where: { id: encounterId, tenantId },
    include: { patient: { select: patientSelect }, assignedDoctor: true },
  });
  if (!encounter) throw notFound("Visit not found.");
  return serializeEncounter(encounter);
}

export async function listTodayEncounters(tenantId: string, timezone = "Africa/Nairobi") {
  const { start, end } = todayRange(timezone);
  const encounters = await prisma.encounter.findMany({
    where: { tenantId, startedAt: { gte: start, lt: end }, status: { not: "CANCELLED" } },
    include: {
      patient: { select: patientSelect },
      assignedDoctor: true,
      charges: { where: { status: { not: "VOIDED" } } },
    },
    orderBy: { startedAt: "asc" },
  });
  return encounters.map((encounter) => {
    const chargeTotal = encounter.charges.reduce((sum, charge) => sum + money(charge.total), 0);
    const unpaidBalance = encounter.charges.reduce((sum, charge) => {
      if (charge.status !== "UNPAID" && charge.status !== "PARTIALLY_PAID") return sum;
      return sum + money(charge.total) - money(charge.amountPaid);
    }, 0);
    const { charges: _charges, ...rest } = encounter;
    void _charges;
    return serializeEncounter({
      ...rest,
      unpaidBalance: Number(unpaidBalance.toFixed(2)),
      chargeTotal: Number(chargeTotal.toFixed(2)),
    });
  });
}

export async function listPatientEncounters(tenantId: string, patientId: string) {
  const encounters = await prisma.encounter.findMany({
    where: { tenantId, patientId },
    include: { patient: { select: patientSelect }, assignedDoctor: true },
    orderBy: { startedAt: "desc" },
  });
  return encounters.map(serializeEncounter);
}

export async function updateEncounterStatus(
  tenantId: string,
  actorId: string,
  encounterId: string,
  status: EncounterStatus,
  assignedDoctorId?: string | null,
) {
  const existing = await prisma.encounter.findFirst({ where: { id: encounterId, tenantId } });
  if (!existing) throw notFound("Visit not found.");
  if (existing.status === "CANCELLED") throw badRequest("This visit has been cancelled.");

  const encounter = await prisma.encounter.update({
    where: { id: encounterId },
    data: {
      status,
      assignedDoctorId: assignedDoctorId === undefined ? undefined : assignedDoctorId,
      completedAt: status === "COMPLETED" ? new Date() : existing.completedAt,
    },
    include: { patient: { select: patientSelect }, assignedDoctor: true },
  });
  await writeAudit({
    tenantId,
    userId: actorId,
    action: "encounter.status_changed",
    entity: "encounter",
    entityId: encounterId,
    metadata: { from: existing.status, to: status },
  });
  return serializeEncounter(encounter);
}

export async function checkInConsultation(
  tenantId: string,
  actorId: string,
  encounterId: string,
  assignedDoctorId?: string,
) {
  return updateEncounterStatus(tenantId, actorId, encounterId, "WAITING_CONSULTATION", assignedDoctorId);
}

export async function cancelEncounter(tenantId: string, actorId: string, encounterId: string) {
  return updateEncounterStatus(tenantId, actorId, encounterId, "CANCELLED");
}

export async function refreshEncounterStatus(tx: TxClient, tenantId: string, encounterId: string) {
  const encounter = await tx.encounter.findFirst({
    where: { id: encounterId, tenantId },
    include: {
      consultation: true,
      labOrders: { include: { items: { include: { result: true } } } },
      prescriptions: { include: { items: true } },
      charges: true,
    },
  });
  if (!encounter || encounter.status === "CANCELLED") return encounter;

  const unpaid = encounter.charges.filter((c) => c.status === "UNPAID" || c.status === "PARTIALLY_PAID");
  const pendingLab = encounter.labOrders.filter((o) => o.status !== "COMPLETED" && o.status !== "CANCELLED");
  const processingLab = pendingLab.some((o) => o.status === "PROCESSING" || o.status === "ACCEPTED");
  const pendingRx = encounter.prescriptions.filter((p) => p.status === "PENDING" || p.status === "PARTIALLY_DISPENSED");
  const walkIn = encounter.visitType === "WALK_IN_LAB" || encounter.visitType === "OTC_PHARMACY";

  let status: EncounterStatus = encounter.status;
  if (pendingLab.length) {
    status = processingLab ? "LAB_PROCESSING" : "WAITING_LAB";
  } else if (pendingRx.length) {
    status = "WAITING_PHARMACY";
  } else if (unpaid.length) {
    status = "WAITING_PAYMENT";
  } else if (encounter.charges.length > 0 && !pendingLab.length && !pendingRx.length) {
    status = "COMPLETED";
  } else if (encounter.consultation) {
    status = "WAITING_PAYMENT";
  } else if (walkIn) {
    status = encounter.visitType === "WALK_IN_LAB" ? "WAITING_LAB" : "WAITING_PAYMENT";
  } else if (encounter.status === "REGISTERED" || encounter.status === "COMPLETED") {
    status = encounter.status === "REGISTERED" ? "WAITING_CONSULTATION" : "COMPLETED";
  }

  return tx.encounter.update({
    where: { id: encounterId },
    data: {
      status,
      completedAt: status === "COMPLETED" ? encounter.completedAt ?? new Date() : null,
    },
  });
}

export async function todayStats(tenantId: string, timezone = "Africa/Nairobi") {
  const { start, end } = todayRange(timezone);
  const encounters = await prisma.encounter.findMany({
    where: { tenantId, startedAt: { gte: start, lt: end }, status: { not: "CANCELLED" } },
    include: { charges: true, payments: true },
  });

  const count = (status: EncounterStatus) => encounters.filter((e) => e.status === status).length;
  const revenue = encounters.reduce(
    (sum, e) => sum + e.payments.reduce((p, pay) => p + money(pay.amount), 0),
    0,
  );
  const unpaidEncounters = encounters.filter((e) =>
    e.charges.some((c) => c.status === "UNPAID" || c.status === "PARTIALLY_PAID"),
  ).length;

  const unpaidAmount = encounters.reduce((sum, e) => {
    return (
      sum +
      e.charges.reduce((chargeSum, charge) => {
        if (charge.status !== "UNPAID" && charge.status !== "PARTIALLY_PAID") return chargeSum;
        return chargeSum + money(charge.total) - money(charge.amountPaid);
      }, 0)
    );
  }, 0);
  const revenueByMethod: Record<string, number> = {};
  for (const encounter of encounters) {
    for (const payment of encounter.payments) {
      revenueByMethod[payment.method] = (revenueByMethod[payment.method] || 0) + money(payment.amount);
    }
  }

  return {
    todaysPatients: encounters.length,
    waitingConsultation: count("WAITING_CONSULTATION") + count("REGISTERED"),
    inConsultation: count("IN_CONSULTATION"),
    waitingLab: count("WAITING_LAB") + count("LAB_PROCESSING"),
    waitingPharmacy: count("WAITING_PHARMACY"),
    waitingPayment: count("WAITING_PAYMENT"),
    completed: count("COMPLETED"),
    unpaidEncounters,
    unpaidAmount: Number(unpaidAmount.toFixed(2)),
    todaysRevenue: revenue,
    walkInLab: encounters.filter((e) => e.visitType === "WALK_IN_LAB").length,
    otcPharmacy: encounters.filter((e) => e.visitType === "OTC_PHARMACY").length,
    revenueByMethod,
  };
}

export function todayRange(timezone: string) {
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
  return { start, end, dateKey: local.replace(/-/g, "") };
}

export async function encounterTimeline(tenantId: string, encounterId: string) {
  const encounter = await prisma.encounter.findFirst({
    where: { id: encounterId, tenantId },
    include: {
      consultation: true,
      vitals: { orderBy: { createdAt: "asc" } },
      diagnoses: { orderBy: { createdAt: "asc" } },
      labOrders: { include: { items: { include: { labTest: true, result: true } } }, orderBy: { createdAt: "asc" } },
      prescriptions: { include: { items: { include: { medicine: true } } }, orderBy: { createdAt: "asc" } },
      dispenses: { orderBy: { createdAt: "asc" } },
      charges: { orderBy: { createdAt: "asc" } },
      payments: { include: { receipt: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!encounter) throw notFound("Visit not found.");

  const events: { type: string; label: string; at: Date }[] = [
    { type: "REGISTERED", label: "Registered", at: encounter.startedAt },
  ];
  if (encounter.consultation) events.push({ type: "CONSULTATION", label: "Consultation", at: encounter.consultation.createdAt });
  if (encounter.labOrders.length) events.push({ type: "LAB", label: "Laboratory", at: encounter.labOrders[0].createdAt });
  if (encounter.prescriptions.length) events.push({ type: "PRESCRIPTION", label: "Prescription", at: encounter.prescriptions[0].createdAt });
  if (encounter.dispenses.length) events.push({ type: "PHARMACY", label: "Pharmacy", at: encounter.dispenses[0].createdAt });
  if (encounter.payments.length) events.push({ type: "PAYMENT", label: "Payment", at: encounter.payments[0].createdAt });
  if (encounter.status === "COMPLETED" && encounter.completedAt) {
    events.push({ type: "COMPLETED", label: "Completed", at: encounter.completedAt });
  }
  return { encounterId, status: encounter.status, events };
}
