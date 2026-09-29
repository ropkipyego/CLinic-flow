import type { Role } from "@prisma/client";

export function isClinicAdmin(role: Role | string) {
  return role === "SUPER_ADMIN" || role === "ADMIN";
}

export function isSuperAdmin(role: Role | string) {
  return role === "SUPER_ADMIN";
}

export const STAFF_ROLES: Role[] = ["RECEPTION", "DOCTOR", "LAB", "PHARMACY", "CASHIER"];

export const CLINIC_ADMIN_ROLES: Role[] = ["SUPER_ADMIN", "ADMIN"];

export function rolesAssignableBy(actorRole: Role): Role[] {
  if (actorRole === "SUPER_ADMIN") return ["SUPER_ADMIN", "ADMIN", ...STAFF_ROLES];
  if (actorRole === "ADMIN") return ["ADMIN", ...STAFF_ROLES];
  return [];
}

export const ROLE_RIGHTS = [
  { area: "Register and edit patients", SUPER_ADMIN: true, ADMIN: true, RECEPTION: true, DOCTOR: false, LAB: false, PHARMACY: false, CASHIER: false },
  { area: "Search patient registry", SUPER_ADMIN: true, ADMIN: true, RECEPTION: true, DOCTOR: true, LAB: true, PHARMACY: true, CASHIER: true },
  { area: "Start a clinic visit", SUPER_ADMIN: true, ADMIN: true, RECEPTION: true, DOCTOR: false, LAB: false, PHARMACY: false, CASHIER: false },
  { area: "Consultation and prescribe", SUPER_ADMIN: true, ADMIN: true, RECEPTION: false, DOCTOR: true, LAB: false, PHARMACY: false, CASHIER: false },
  { area: "Laboratory queue and results", SUPER_ADMIN: true, ADMIN: true, RECEPTION: false, DOCTOR: false, LAB: true, PHARMACY: false, CASHIER: false },
  { area: "Add / edit lab tests", SUPER_ADMIN: true, ADMIN: true, RECEPTION: false, DOCTOR: false, LAB: true, PHARMACY: false, CASHIER: false },
  { area: "Walk-in lab", SUPER_ADMIN: true, ADMIN: true, RECEPTION: true, DOCTOR: false, LAB: true, PHARMACY: false, CASHIER: false },
  { area: "Pharmacy dispense and OTC", SUPER_ADMIN: true, ADMIN: true, RECEPTION: false, DOCTOR: false, LAB: false, PHARMACY: true, CASHIER: false },
  { area: "Pharmacy stock items and import", SUPER_ADMIN: true, ADMIN: true, RECEPTION: false, DOCTOR: false, LAB: false, PHARMACY: true, CASHIER: false },
  { area: "Issue LPO and receive GRN", SUPER_ADMIN: true, ADMIN: true, RECEPTION: false, DOCTOR: false, LAB: false, PHARMACY: true, CASHIER: false },
  { area: "Stock take", SUPER_ADMIN: true, ADMIN: true, RECEPTION: false, DOCTOR: false, LAB: false, PHARMACY: true, CASHIER: false },
  { area: "Collect payment", SUPER_ADMIN: true, ADMIN: true, RECEPTION: true, DOCTOR: false, LAB: false, PHARMACY: false, CASHIER: true },
  { area: "Search and change prices", SUPER_ADMIN: true, ADMIN: true, RECEPTION: false, DOCTOR: false, LAB: false, PHARMACY: false, CASHIER: false },
  { area: "Apply printed price lists", SUPER_ADMIN: true, ADMIN: true, RECEPTION: false, DOCTOR: false, LAB: false, PHARMACY: false, CASHIER: false },
  { area: "Services catalog (add hospital charges)", SUPER_ADMIN: true, ADMIN: true, RECEPTION: false, DOCTOR: false, LAB: false, PHARMACY: false, CASHIER: false },
  { area: "Create station staff", SUPER_ADMIN: true, ADMIN: true, RECEPTION: false, DOCTOR: false, LAB: false, PHARMACY: false, CASHIER: false },
  { area: "Create clinic Admin", SUPER_ADMIN: true, ADMIN: true, RECEPTION: false, DOCTOR: false, LAB: false, PHARMACY: false, CASHIER: false },
  { area: "Create or demote Super Admin", SUPER_ADMIN: true, ADMIN: false, RECEPTION: false, DOCTOR: false, LAB: false, PHARMACY: false, CASHIER: false },
  { area: "Clinic settings, reports, SMS, audit", SUPER_ADMIN: true, ADMIN: true, RECEPTION: false, DOCTOR: false, LAB: false, PHARMACY: false, CASHIER: false },
] as const;
