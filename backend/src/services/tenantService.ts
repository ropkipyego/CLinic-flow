import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { writeAudit } from "../lib/audit.js";
import { notFound } from "../lib/errors.js";
import { serializeTenant } from "./authService.js";

export const updateTenantSchema = z.object({
  name: z.string().min(1).optional(),
  logoUrl: z.string().url().nullable().optional(),
  primaryColor: z.string().min(4).optional(),
  secondaryColor: z.string().min(4).optional(),
  phone: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  address: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  receiptFooter: z.string().nullable().optional(),
  smsSenderId: z.string().nullable().optional(),
  timezone: z.string().min(1).optional(),
  currency: z.string().min(3).max(8).optional(),
});

export async function getTenant(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw notFound("Clinic configuration not found.");
  return serializeTenant(tenant);
}

export async function updateTenant(
  tenantId: string,
  actorId: string,
  input: z.infer<typeof updateTenantSchema>,
  ip?: string,
) {
  const tenant = await prisma.tenant.update({
    where: { id: tenantId },
    data: input,
  });
  await writeAudit({
    tenantId,
    userId: actorId,
    action: "tenant.updated",
    entity: "tenant",
    entityId: tenantId,
    metadata: input,
    ipAddress: ip,
  });
  return serializeTenant(tenant);
}
