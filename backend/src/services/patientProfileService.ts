import { prisma } from "../lib/prisma.js";
import { notFound } from "../lib/errors.js";
import { serializePatient } from "./patientService.js";
import { money, toNumber } from "../lib/serialize.js";

export async function getPatientProfile(tenantId: string, patientId: string, canSeeFinance: boolean) {
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, tenantId },
    include: {
      encounters: {
        orderBy: { startedAt: "desc" },
        include: {
          assignedDoctor: true,
          consultation: true,
          diagnoses: true,
        },
      },
      vitals: { orderBy: { createdAt: "desc" }, take: 20 },
      diagnoses: { orderBy: { createdAt: "desc" } },
      labResults: { include: { labTest: true, encounter: true }, orderBy: { createdAt: "desc" } },
      prescriptions: { include: { items: { include: { medicine: true } }, encounter: true }, orderBy: { createdAt: "desc" } },
      payments: { include: { receipt: true, encounter: true }, orderBy: { createdAt: "desc" } },
      charges: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!patient) throw notFound("Patient not found.");

  const timeline = [
    ...patient.encounters.map((e) => ({ type: "VISIT", at: e.startedAt, label: `Visit ${e.visitNumber}`, ref: e.id })),
    ...patient.labResults.map((r) => ({
      type: "LAB",
      at: r.createdAt,
      label: `${r.labTest.name}: ${r.valueText ?? r.valueNumeric ?? ""}`,
      ref: r.id,
    })),
    ...patient.prescriptions.map((p) => ({ type: "RX", at: p.createdAt, label: "Prescription", ref: p.id })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  return {
    patient: serializePatient(patient),
    encounters: patient.encounters.map((e) => ({
      id: e.id,
      visitNumber: e.visitNumber,
      status: e.status,
      startedAt: e.startedAt,
      doctor: e.assignedDoctor ? `${e.assignedDoctor.firstName} ${e.assignedDoctor.lastName}` : null,
      assessment: e.consultation?.assessment ?? null,
      diagnoses: e.diagnoses.map((d) => d.name),
    })),
    vitals: patient.vitals.map((v) => ({
      ...v,
      temperature: toNumber(v.temperature),
      weightKg: toNumber(v.weightKg),
      heightCm: toNumber(v.heightCm),
    })),
    diagnoses: patient.diagnoses,
    labResults: patient.labResults.map((r) => ({
      id: r.id,
      test: r.labTest.name,
      value: r.valueText ?? (r.valueNumeric !== null ? String(r.valueNumeric) : ""),
      visitNumber: r.encounter.visitNumber,
      createdAt: r.createdAt,
    })),
    prescriptions: patient.prescriptions.map((p) => ({
      id: p.id,
      visitNumber: p.encounter.visitNumber,
      status: p.status,
      createdAt: p.createdAt,
      items: p.items.map((i) => ({
        medicine: i.medicine.name,
        dose: i.dose,
        frequency: i.frequency,
        duration: i.duration,
        quantity: i.quantity,
      })),
    })),
    payments: canSeeFinance
      ? (patient.payments || []).map((p) => ({
          id: p.id,
          amount: money(p.amount),
          method: p.method,
          receiptNumber: p.receipt.receiptNumber,
          visitNumber: p.encounter.visitNumber,
          createdAt: p.createdAt,
        }))
      : undefined,
    timeline,
  };
}
