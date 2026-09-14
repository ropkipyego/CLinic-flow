import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { writeAudit } from "../lib/audit.js";
import { notFound } from "../lib/errors.js";
import { money, toNumber } from "../lib/serialize.js";
import { refreshEncounterStatus } from "./encounterService.js";
import { createChargeInTx } from "./billingService.js";

export const consultationSchema = z.object({
  chiefComplaint: z.string().optional().nullable(),
  historyOfPresentingComplaint: z.string().optional().nullable(),
  examination: z.string().optional().nullable(),
  assessment: z.string().optional().nullable(),
  plan: z.string().optional().nullable(),
});

export const vitalsSchema = z.object({
  systolicBp: z.number().int().optional().nullable(),
  diastolicBp: z.number().int().optional().nullable(),
  pulse: z.number().int().optional().nullable(),
  temperature: z.number().optional().nullable(),
  spo2: z.number().int().min(0).max(100).optional().nullable(),
  respiratoryRate: z.number().int().optional().nullable(),
  weightKg: z.number().optional().nullable(),
  heightCm: z.number().optional().nullable(),
});

export const diagnosisSchema = z.object({
  name: z.string().min(1),
  icd10Code: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function saveConsultation(
  tenantId: string,
  actorId: string,
  encounterId: string,
  input: z.infer<typeof consultationSchema>,
  ip?: string,
) {
  const encounter = await prisma.encounter.findFirst({ where: { id: encounterId, tenantId } });
  if (!encounter) throw notFound("Visit not found.");

  const consultation = await prisma.$transaction(async (tx) => {
    const saved = await tx.consultation.upsert({
      where: { encounterId },
      create: {
        tenantId,
        encounterId,
        patientId: encounter.patientId,
        doctorId: actorId,
        ...input,
      },
      update: input,
    });

    await tx.encounter.update({
      where: { id: encounterId },
      data: { status: "IN_CONSULTATION", assignedDoctorId: encounter.assignedDoctorId ?? actorId },
    });

    const existingCharge = await tx.charge.findFirst({
      where: { tenantId, encounterId, source: "CONSULTATION", status: { not: "VOIDED" } },
    });
    if (!existingCharge) {
      const service = await tx.service.findFirst({
        where: { tenantId, category: "CONSULTATION", active: true },
        orderBy: { createdAt: "asc" },
      });
      if (service) {
        await createChargeInTx(tx, {
          tenantId,
          encounterId,
          patientId: encounter.patientId,
          serviceId: service.id,
          source: "CONSULTATION",
          description: service.name,
          quantity: 1,
          unitPrice: money(service.price),
        });
      }
    }

    await writeAudit(
      {
        tenantId,
        userId: actorId,
        action: "consultation.saved",
        entity: "consultation",
        entityId: saved.id,
        metadata: { encounterId },
        ipAddress: ip,
      },
      tx,
    );
    await refreshEncounterStatus(tx, tenantId, encounterId);
    return saved;
  });

  return consultation;
}

export async function recordVitals(
  tenantId: string,
  actorId: string,
  encounterId: string,
  input: z.infer<typeof vitalsSchema>,
) {
  const encounter = await prisma.encounter.findFirst({ where: { id: encounterId, tenantId } });
  if (!encounter) throw notFound("Visit not found.");
  const vitals = await prisma.vitals.create({
    data: {
      tenantId,
      encounterId,
      patientId: encounter.patientId,
      recordedById: actorId,
      ...input,
    },
  });
  return {
    ...vitals,
    temperature: toNumber(vitals.temperature),
    weightKg: toNumber(vitals.weightKg),
    heightCm: toNumber(vitals.heightCm),
  };
}

export async function addDiagnosis(
  tenantId: string,
  actorId: string,
  encounterId: string,
  input: z.infer<typeof diagnosisSchema>,
  ip?: string,
) {
  const encounter = await prisma.encounter.findFirst({ where: { id: encounterId, tenantId } });
  if (!encounter) throw notFound("Visit not found.");
  const diagnosis = await prisma.diagnosis.create({
    data: {
      tenantId,
      encounterId,
      patientId: encounter.patientId,
      doctorId: actorId,
      name: input.name.trim(),
      icd10Code: input.icd10Code?.trim() || null,
      notes: input.notes?.trim() || null,
    },
  });
  await writeAudit({
    tenantId,
    userId: actorId,
    action: "diagnosis.entered",
    entity: "diagnosis",
    entityId: diagnosis.id,
    metadata: { name: diagnosis.name, icd10Code: diagnosis.icd10Code },
    ipAddress: ip,
  });
  return diagnosis;
}

export async function getConsultationBundle(tenantId: string, encounterId: string) {
  const encounter = await prisma.encounter.findFirst({
    where: { id: encounterId, tenantId },
    include: {
      patient: true,
      assignedDoctor: true,
      consultation: true,
      vitals: { orderBy: { createdAt: "desc" } },
      diagnoses: { orderBy: { createdAt: "asc" } },
      labOrders: {
        include: { items: { include: { labTest: true, result: { include: { performedBy: true } } } } },
        orderBy: { createdAt: "desc" },
      },
      prescriptions: { include: { items: { include: { medicine: true } } }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!encounter) throw notFound("Visit not found.");

  const history = await prisma.encounter.findMany({
    where: { tenantId, patientId: encounter.patientId, id: { not: encounterId } },
    include: {
      consultation: true,
      diagnoses: true,
      labResults: { include: { labTest: true } },
      prescriptions: { include: { items: { include: { medicine: true } } } },
    },
    orderBy: { startedAt: "desc" },
    take: 10,
  });

  return { encounter, history };
}
