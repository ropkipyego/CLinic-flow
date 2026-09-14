import type { TxClient } from "./prisma.js";

export async function nextSequence(tx: TxClient, tenantId: string, name: string, dateKey = ""): Promise<number> {
  const existing = await tx.sequence.findUnique({
    where: { tenantId_name_dateKey: { tenantId, name, dateKey } },
  });

  if (!existing) {
    const created = await tx.sequence.create({
      data: { tenantId, name, dateKey, value: 1 },
    });
    return created.value;
  }

  const updated = await tx.sequence.update({
    where: { id: existing.id },
    data: { value: { increment: 1 } },
  });
  return updated.value;
}

export function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

export async function nextPatientNumber(tx: TxClient, tenantId: string): Promise<string> {
  const n = await nextSequence(tx, tenantId, "patient");
  return `CLF-${pad(n, 6)}`;
}

export async function nextVisitNumber(tx: TxClient, tenantId: string, date = new Date()): Promise<string> {
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1, 2);
  const d = pad(date.getDate(), 2);
  const dateKey = `${y}${m}${d}`;
  const n = await nextSequence(tx, tenantId, "encounter", dateKey);
  return `VIS-${dateKey}-${pad(n, 3)}`;
}

export async function nextReceiptNumber(tx: TxClient, tenantId: string): Promise<string> {
  const n = await nextSequence(tx, tenantId, "receipt");
  return `RCP-${pad(n, 6)}`;
}
