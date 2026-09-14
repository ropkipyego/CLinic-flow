import type { Role } from "../auth/AuthContext";

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Super Admin",
  RECEPTION: "Reception",
  DOCTOR: "Doctor",
  LAB: "Laboratory",
  PHARMACY: "Pharmacy",
  CASHIER: "Cashier",
};

export const VISIT_TYPE_LABEL: Record<string, string> = {
  STANDARD: "Clinic visit",
  WALK_IN_LAB: "Walk-in lab",
  OTC_PHARMACY: "OTC pharmacy",
};

export function initials(first?: string, last?: string) {
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "CF";
}

export function formatMoney(currency: string, amount: number) {
  return `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
