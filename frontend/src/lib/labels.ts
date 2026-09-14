import type { Role } from "../auth/AuthContext";

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Administrator",
  RECEPTION: "Reception",
  DOCTOR: "Doctor",
  LAB: "Laboratory",
  PHARMACY: "Pharmacy",
  CASHIER: "Cashier",
};

export function initials(first?: string, last?: string) {
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "CF";
}

export function formatMoney(currency: string, amount: number) {
  return `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
