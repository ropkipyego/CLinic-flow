import type { Role } from "../auth/AuthContext";

export function isClinicAdmin(role?: Role | string | null) {
  return role === "SUPER_ADMIN" || role === "ADMIN";
}

export function isSuperAdmin(role?: Role | string | null) {
  return role === "SUPER_ADMIN";
}

export function homePath(role?: Role | string | null) {
  if (role === "DOCTOR") return "/consultation";
  if (role === "LAB") return "/laboratory";
  if (role === "PHARMACY") return "/pharmacy";
  if (role === "CASHIER") return "/cashier";
  if (role === "RECEPTION") return "/visits";
  return "/";
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
