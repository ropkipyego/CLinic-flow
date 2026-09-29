import type { Role } from "../auth/AuthContext";

export function isClinicAdmin(role?: Role | string | null) {
  return role === "SUPER_ADMIN" || role === "ADMIN";
}

export function isSuperAdmin(role?: Role | string | null) {
  return role === "SUPER_ADMIN";
}

export const SERVICE_CATEGORIES = [
  "CONSULTATION",
  "REGISTRATION",
  "PROCEDURE",
  "DRESSING",
  "INJECTION",
  "OBSERVATION",
  "FAMILY_PLANNING",
  "LABORATORY",
  "PHARMACY",
  "OTHER",
] as const;

export const LAB_TEST_CATEGORIES = [
  "RAPID",
  "HAEMATOLOGY",
  "CHEMISTRY",
  "SEROLOGY",
  "MICROBIOLOGY",
  "STOOL",
  "URINE",
  "OTHER",
] as const;
