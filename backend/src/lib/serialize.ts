import { Prisma } from "@prisma/client";

export function toNumber(value: Prisma.Decimal | number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return Number(value);
}

export function money(value: Prisma.Decimal | number | string | null | undefined): number {
  return toNumber(value) ?? 0;
}

export function patientAge(dateOfBirth: Date | null | undefined, ageYears: number | null | undefined): number | null {
  if (dateOfBirth) {
    const today = new Date();
    let age = today.getFullYear() - dateOfBirth.getFullYear();
    const monthDiff = today.getMonth() - dateOfBirth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dateOfBirth.getDate())) age -= 1;
    return age;
  }
  return ageYears ?? null;
}

export function displayName(person: { firstName: string; middleName?: string | null; lastName: string }): string {
  return [person.firstName, person.middleName, person.lastName].filter(Boolean).join(" ");
}
