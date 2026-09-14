import { Sex, VisitType } from "@prisma/client";
import { z } from "zod";
import type { TxClient } from "../lib/prisma.js";
import { writeAudit } from "../lib/audit.js";
import { badRequest } from "../lib/errors.js";
import { nextPatientNumber, nextVisitNumber } from "../lib/sequences.js";
import { patientAge } from "../lib/serialize.js";

export const MINOR_AGE_YEARS = 18;

export const walkInClientSchema = z
  .object({
    name: z.string().trim().min(2, "Enter the customer's name."),
    phone: z.string().trim().min(7, "Enter a phone number."),
    ageYears: z.number().int().min(0).max(130).optional().nullable(),
    sex: z.nativeEnum(Sex).optional(),
    guardianName: z.string().trim().min(1).optional().nullable(),
    guardianPhone: z.string().trim().min(7).optional().nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.ageYears != null && value.ageYears < MINOR_AGE_YEARS) {
      if (!value.guardianName) {
        ctx.addIssue({
          code: "custom",
          path: ["guardianName"],
          message: "A child under 18 needs a parent or guardian name.",
        });
      }
      if (!value.guardianPhone) {
        ctx.addIssue({
          code: "custom",
          path: ["guardianPhone"],
          message: "A child under 18 needs a parent or guardian phone number.",
        });
      }
    }
  });

export type WalkInClient = z.infer<typeof walkInClientSchema>;

export function splitPersonName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "Customer", lastName: "Walk-in" };
  if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export function digitsPhone(phone: string) {
  return phone.replace(/\D/g, "");
}

export function isMinor(ageYears?: number | null, dateOfBirth?: Date | null) {
  const age = patientAge(dateOfBirth, ageYears);
  return age !== null && age < MINOR_AGE_YEARS;
}

export async function findOrCreateWalkInPatient(
  tx: TxClient,
  tenantId: string,
  actorId: string,
  client: WalkInClient,
) {
  const phone = client.phone.trim();
  const digits = digitsPhone(phone);
  const { firstName, lastName } = splitPersonName(client.name);
  const sex = client.sex ?? "OTHER";
  const nextOfKin = client.guardianName?.trim() || null;
  const nextOfKinPhone = client.guardianPhone?.trim() || null;

  const existing = await tx.patient.findFirst({
    where: {
      tenantId,
      OR: [
        { phone },
        ...(digits.length >= 9 ? [{ phone: { contains: digits.slice(-9) } }] : []),
      ],
    },
    orderBy: { createdAt: "desc" },
  });

  if (existing) {
    const age = client.ageYears ?? existing.ageYears;
    if (isMinor(age, existing.dateOfBirth) && !nextOfKin && !existing.nextOfKin) {
      throw badRequest("This customer is under 18. Record a parent or guardian before continuing.");
    }
    const updated = await tx.patient.update({
      where: { id: existing.id },
      data: {
        ageYears: existing.dateOfBirth ? existing.ageYears : (client.ageYears ?? existing.ageYears),
        nextOfKin: existing.nextOfKin || nextOfKin,
        nextOfKinPhone: existing.nextOfKinPhone || nextOfKinPhone,
        alternativePhone: existing.alternativePhone || (existing.phone !== phone ? phone : null),
      },
    });
    return updated;
  }

  if (isMinor(client.ageYears ?? null, null) && !nextOfKin) {
    throw badRequest("A child under 18 needs a parent or guardian name and phone.");
  }

  const patientNumber = await nextPatientNumber(tx, tenantId);
  const created = await tx.patient.create({
    data: {
      tenantId,
      patientNumber,
      firstName,
      lastName,
      phone,
      sex,
      ageYears: client.ageYears ?? null,
      nextOfKin,
      nextOfKinPhone,
      paymentMethod: "CASH",
    },
  });
  await writeAudit(
    {
      tenantId,
      userId: actorId,
      action: "patient.created",
      entity: "patient",
      entityId: created.id,
      metadata: { patientNumber, walkIn: true },
    },
    tx,
  );
  return created;
}

export async function createWalkInEncounter(
  tx: TxClient,
  tenantId: string,
  actorId: string,
  patientId: string,
  visitType: VisitType,
  notes?: string | null,
  clientRequestId?: string | null,
) {
  if (clientRequestId) {
    const existing = await tx.encounter.findFirst({
      where: { tenantId, clientRequestId },
      include: { patient: true, charges: true, labOrders: true },
    });
    if (existing) return existing;
  }
  const visitNumber = await nextVisitNumber(tx, tenantId);
  const status = visitType === "WALK_IN_LAB" ? "WAITING_LAB" : visitType === "OTC_PHARMACY" ? "WAITING_PAYMENT" : "REGISTERED";
  return tx.encounter.create({
    data: {
      tenantId,
      patientId,
      visitNumber,
      visitType,
      createdById: actorId,
      notes: notes ?? null,
      status,
      clientRequestId: clientRequestId ?? null,
    },
  });
}
