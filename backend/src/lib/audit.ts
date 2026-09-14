import { prisma, type TxClient } from "./prisma.js";

const SENSITIVE_KEYS = ["password", "passwordHash", "token", "apiKey", "secret", "authorization"];

function scrub(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(scrub);
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.some((s) => key.toLowerCase().includes(s.toLowerCase()))) {
      out[key] = "[redacted]";
    } else {
      out[key] = scrub(val);
    }
  }
  return out;
}

export async function writeAudit(
  input: {
    tenantId: string;
    userId?: string | null;
    action: string;
    entity: string;
    entityId?: string | null;
    metadata?: unknown;
    ipAddress?: string | null;
  },
  client: TxClient | typeof prisma = prisma,
) {
  await client.auditLog.create({
    data: {
      tenantId: input.tenantId,
      userId: input.userId ?? null,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      metadata: (input.metadata ? scrub(input.metadata) : undefined) as object | undefined,
      ipAddress: input.ipAddress ?? null,
    },
  });
}
