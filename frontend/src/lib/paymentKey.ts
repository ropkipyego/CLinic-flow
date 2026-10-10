const prefix = "clinicflow.pay.";

export function getOrCreatePaymentKey(encounterId: string) {
  const key = `${prefix}${encounterId}`;
  const existing = sessionStorage.getItem(key);
  if (existing) return existing;
  const id = crypto.randomUUID();
  sessionStorage.setItem(key, id);
  return id;
}

export function clearPaymentKey(encounterId: string) {
  sessionStorage.removeItem(`${prefix}${encounterId}`);
}
