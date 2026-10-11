import { PaymentPreference, Sex } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { writeAudit } from "../lib/audit.js";
import { badRequest, conflict, notFound } from "../lib/errors.js";
import { isUniqueConstraintError } from "../lib/prismaErrors.js";
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

export const createPatientSchema = z
  .object({
    ...patientFields,
    confirmDuplicate: z.boolean().optional(),
    clientRequestId: z.string().uuid().optional().nullable(),
  })
  .refine(
  (v) => Boolean(v.dateOfBirth) || (v.ageYears !== undefined && v.ageYears !== null),
  { message: "Provide a date of birth or an age." },
).superRefine((v, ctx) => {
  let age = v.ageYears ?? null;
  if (v.dateOfBirth) {
    const dob = new Date(v.dateOfBirth);
    age = new Date().getFullYear() - dob.getFullYear();
  }
  if (age !== null && age < 18 && (!v.nextOfKin?.trim() || !v.nextOfKinPhone?.trim())) {
    ctx.addIssue({
      code: "custom",
      message: "A child under 18 needs a parent or guardian name and phone.",
      path: ["nextOfKin"],
    });
  }
});

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

export function phoneDigits(phone?: string | null) {
  return (phone || "").replace(/\D/g, "");
}

export function normalizePhoneKey(phone?: string | null) {
  const digits = phoneDigits(phone);
  if (digits.length >= 9) return digits.slice(-9);
  return digits;
}

function patientSearchWhere(tenantId: string, q?: string, sex?: string) {
  const query = q?.trim();
  const digits = normalizePhoneKey(query);
  const tokens = (query || "").split(/\s+/).filter((t) => t.length > 1);
  const or: object[] = [];
  if (query) {
    or.push(
      { patientNumber: { contains: query, mode: "insensitive" as const } },
      { phone: { contains: query } },
      { alternativePhone: { contains: query } },
      { firstName: { contains: query, mode: "insensitive" as const } },
      { lastName: { contains: query, mode: "insensitive" as const } },
      { middleName: { contains: query, mode: "insensitive" as const } },
    );
    if (digits.length >= 7) {
      or.push({ phoneNormalized: { contains: digits } }, { phone: { contains: digits } }, { alternativePhone: { contains: digits } });
    }
    if (tokens.length >= 2) {
      or.push({
        AND: [
          { firstName: { contains: tokens[0], mode: "insensitive" as const } },
          { lastName: { contains: tokens[tokens.length - 1], mode: "insensitive" as const } },
        ],
      });
    }
  }
  return {
    tenantId,
    ...(sex ? { sex: sex as never } : {}),
    ...(or.length ? { OR: or } : {}),
  };
}

export async function findPossibleDuplicates(
  tenantId: string,
  input: { phone?: string | null; firstName?: string | null; lastName?: string | null; dateOfBirth?: string | null; excludeId?: string },
) {
  const last9 = normalizePhoneKey(input.phone);
  const or: object[] = [];
  if (last9.length >= 9) {
    or.push(
      { phoneNormalized: last9 },
      { phone: { contains: last9 } },
      { alternativePhone: { contains: last9 } },
    );
  }
  if (input.firstName?.trim() && input.lastName?.trim()) {
    const nameMatch: Record<string, unknown> = {
      firstName: { equals: input.firstName.trim(), mode: "insensitive" },
      lastName: { equals: input.lastName.trim(), mode: "insensitive" },
    };
    if (input.dateOfBirth) nameMatch.dateOfBirth = new Date(input.dateOfBirth);
    or.push(nameMatch);
  }
  if (!or.length) return [];
  const rows = await prisma.patient.findMany({
    where: {
      tenantId,
      ...(input.excludeId ? { NOT: { id: input.excludeId } } : {}),
      OR: or,
    },
    include: {
      encounters: { orderBy: { startedAt: "desc" }, take: 1, select: { visitNumber: true, startedAt: true, status: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 8,
  });
  return rows.map((row) => ({
    ...serializePatient(row),
    lastEncounter: row.encounters[0]
      ? {
          visitNumber: row.encounters[0].visitNumber,
          startedAt: row.encounters[0].startedAt,
          status: row.encounters[0].status,
        }
      : null,
  }));
}

export async function listPatientRegistry(
  tenantId: string,
  opts: { q?: string; sex?: string; page?: number; take?: number },
) {
  const page = Math.max(1, opts.page ?? 1);
  const take = Math.min(100, Math.max(10, opts.take ?? 30));
  const where = patientSearchWhere(tenantId, opts.q, opts.sex);
  const [total, rows] = await Promise.all([
    prisma.patient.count({ where }),
    prisma.patient.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * take,
      take,
    }),
  ]);
  return { items: rows.map(serializePatient), total, page, take, pages: Math.max(1, Math.ceil(total / take)) };
}

export async function createPatient(
  tenantId: string,
  actorId: string,
  input: z.infer<typeof createPatientSchema>,
  ip?: string,
) {
  if (input.clientRequestId) {
    const existing = await prisma.patient.findFirst({ where: { tenantId, clientRequestId: input.clientRequestId } });
    if (existing) return serializePatient(existing);
  }
  const duplicates = await findPossibleDuplicates(tenantId, input);
  if (duplicates.length && !input.confirmDuplicate) {
    throw conflict(
      "A matching patient is already registered. Open their chart instead of creating a second file.",
      { duplicates },
    );
  }
  try {
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
        phoneNormalized: normalizePhoneKey(input.phone),
        clientRequestId: input.clientRequestId ?? null,
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
  } catch (err) {
    if (input.clientRequestId && isUniqueConstraintError(err)) {
      const existing = await prisma.patient.findFirst({ where: { tenantId, clientRequestId: input.clientRequestId } });
      if (existing) return serializePatient(existing);
    }
    throw err;
  }
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
  if (input.phone || (input.firstName && input.lastName)) {
    const duplicates = await findPossibleDuplicates(tenantId, {
      phone: input.phone ?? existing.phone,
      firstName: input.firstName ?? existing.firstName,
      lastName: input.lastName ?? existing.lastName,
      dateOfBirth: input.dateOfBirth ?? existing.dateOfBirth?.toISOString().slice(0, 10),
      excludeId: patientId,
    });
    if (duplicates.length) {
      throw conflict("Those details match another patient. Check the registry before saving.", { duplicates });
    }
  }
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
      phoneNormalized: input.phone ? normalizePhoneKey(input.phone) : undefined,
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
  const patients = await prisma.patient.findMany({
    where: patientSearchWhere(tenantId, query),
    include: {
      encounters: { orderBy: { startedAt: "desc" }, take: 1, select: { visitNumber: true, startedAt: true, status: true } },
    },
    orderBy: { createdAt: "desc" },
    take,
  });
  return patients.map((row) => ({
    ...serializePatient(row),
    lastEncounter: row.encounters[0]
      ? { visitNumber: row.encounters[0].visitNumber, startedAt: row.encounters[0].startedAt, status: row.encounters[0].status }
      : null,
  }));
}
