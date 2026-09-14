import { PaymentPreference, Sex } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { writeAudit } from "../lib/audit.js";
import { badRequest, notFound } from "../lib/errors.js";
import { nextPatientNumber } from "../lib/sequences.js";
import { displayName, patientAge } from "../lib/serialize.js";

const patientFields = {
  firstName: z.string().min(1),
  middleName: z.string().optional().nullable(),
  lastName: z.string().min(1),
  phone: z.string().min(7),
  alternativePhone: z.string().optional().nullable(),
  dateOfBirth: z.string().optional().nullable(),
  ageYears: z.number().int().min(0).max(130).optional().nullable(),
  sex: z.nativeEnum(Sex),
  address: z.string().optional().nullable(),
  nextOfKin: z.string().optional().nullable(),
  nextOfKinPhone: z.string().optional().nullable(),
  paymentMethod: z.nativeEnum(PaymentPreference).optional(),
  insuranceProvider: z.string().optional().nullable(),
};

export const createPatientSchema = z.object(patientFields).refine(
  (v) => Boolean(v.dateOfBirth) || (v.ageYears !== undefined && v.ageYears !== null),
  { message: "Provide a date of birth or an age." },
);

export const updatePatientSchema = z.object({
  firstName: patientFields.firstName.optional(),
  middleName: patientFields.middleName,
  lastName: patientFields.lastName.optional(),
  phone: patientFields.phone.optional(),
  alternativePhone: patientFields.alternativePhone,
  dateOfBirth: patientFields.dateOfBirth,
  ageYears: patientFields.ageYears,
  sex: patientFields.sex.optional(),
  address: patientFields.address,
  nextOfKin: patientFields.nextOfKin,
  nextOfKinPhone: patientFields.nextOfKinPhone,
  paymentMethod: patientFields.paymentMethod,
  insuranceProvider: patientFields.insuranceProvider,
});

export function serializePatient(patient: {
  id: string;
  patientNumber: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  phone: string;
  alternativePhone: string | null;
  dateOfBirth: Date | null;
  ageYears: number | null;
  sex: Sex;
  address: string | null;
  nextOfKin: string | null;
  nextOfKinPhone: string | null;
  paymentMethod: PaymentPreference;
  insuranceProvider: string | null;
  createdAt: Date;
}) {
  return {
    ...patient,
    name: displayName(patient),
    age: patientAge(patient.dateOfBirth, patient.ageYears),
  };
}

export async function createPatient(
  tenantId: string,
  actorId: string,
  input: z.infer<typeof createPatientSchema>,
  ip?: string,
) {
  const patient = await prisma.$transaction(async (tx) => {
    const patientNumber = await nextPatientNumber(tx, tenantId);
    const created = await tx.patient.create({
      data: {
        tenantId,
        patientNumber,
        firstName: input.firstName.trim(),
        middleName: input.middleName?.trim() || null,
        lastName: input.lastName.trim(),
        phone: input.phone.trim(),
        alternativePhone: input.alternativePhone?.trim() || null,
        dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : null,
        ageYears: input.dateOfBirth ? null : input.ageYears ?? null,
        sex: input.sex,
        address: input.address?.trim() || null,
        nextOfKin: input.nextOfKin?.trim() || null,
        nextOfKinPhone: input.nextOfKinPhone?.trim() || null,
        paymentMethod: input.paymentMethod ?? "CASH",
        insuranceProvider: input.insuranceProvider?.trim() || null,
      },
    });
    await writeAudit(
      {
        tenantId,
        userId: actorId,
        action: "patient.created",
        entity: "patient",
        entityId: created.id,
        metadata: { patientNumber },
        ipAddress: ip,
      },
      tx,
    );
    return created;
  });
  return serializePatient(patient);
}

export async function updatePatient(
  tenantId: string,
  actorId: string,
  patientId: string,
  input: z.infer<typeof updatePatientSchema>,
  ip?: string,
) {
  const existing = await prisma.patient.findFirst({ where: { id: patientId, tenantId } });
  if (!existing) throw notFound("Patient not found.");
  if (input.dateOfBirth === null && input.ageYears === null) {
    throw badRequest("Provide a date of birth or an age.");
  }
  const patient = await prisma.patient.update({
    where: { id: patientId },
    data: {
      firstName: input.firstName?.trim(),
      middleName: input.middleName === undefined ? undefined : input.middleName?.trim() || null,
      lastName: input.lastName?.trim(),
      phone: input.phone?.trim(),
      alternativePhone: input.alternativePhone === undefined ? undefined : input.alternativePhone?.trim() || null,
      dateOfBirth: input.dateOfBirth === undefined ? undefined : input.dateOfBirth ? new Date(input.dateOfBirth) : null,
      ageYears: input.dateOfBirth ? null : input.ageYears,
      sex: input.sex,
      address: input.address === undefined ? undefined : input.address?.trim() || null,
      nextOfKin: input.nextOfKin === undefined ? undefined : input.nextOfKin?.trim() || null,
      nextOfKinPhone: input.nextOfKinPhone === undefined ? undefined : input.nextOfKinPhone?.trim() || null,
      paymentMethod: input.paymentMethod,
      insuranceProvider: input.insuranceProvider === undefined ? undefined : input.insuranceProvider?.trim() || null,
    },
  });
  await writeAudit({
    tenantId,
    userId: actorId,
    action: "patient.updated",
    entity: "patient",
    entityId: patient.id,
    ipAddress: ip,
  });
  return serializePatient(patient);
}

export async function getPatient(tenantId: string, patientId: string) {
  const patient = await prisma.patient.findFirst({ where: { id: patientId, tenantId } });
  if (!patient) throw notFound("Patient not found.");
  return serializePatient(patient);
}

export async function searchPatients(tenantId: string, query?: string, take = 30) {
  const q = query?.trim();
  const patients = await prisma.patient.findMany({
    where: q
      ? {
          tenantId,
          OR: [
            { patientNumber: { contains: q, mode: "insensitive" } },
            { phone: { contains: q } },
            { alternativePhone: { contains: q } },
            { firstName: { contains: q, mode: "insensitive" } },
            { lastName: { contains: q, mode: "insensitive" } },
            { middleName: { contains: q, mode: "insensitive" } },
          ],
        }
      : { tenantId },
    orderBy: { createdAt: "desc" },
    take,
  });
  return patients.map(serializePatient);
}
