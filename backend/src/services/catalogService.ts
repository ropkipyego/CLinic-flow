import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { writeAudit } from "../lib/audit.js";
import { notFound } from "../lib/errors.js";
import { money } from "../lib/serialize.js";

export const serviceSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  category: z.string().min(1),
  price: z.number().nonnegative(),
  active: z.boolean().optional(),
});

export function serializeService(service: {
  id: string;
  name: string;
  code: string;
  category: string;
  price: { toString(): string } | number;
  active: boolean;
}) {
  return { ...service, price: money(service.price as never) };
}

export async function listServices(tenantId: string, activeOnly = false) {
  const rows = await prisma.service.findMany({
    where: { tenantId, ...(activeOnly ? { active: true } : {}) },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  return rows.map(serializeService);
}

export async function upsertService(
  tenantId: string,
  actorId: string,
  input: z.infer<typeof serviceSchema>,
  id?: string,
) {
  const data = {
    name: input.name,
    code: input.code.toUpperCase(),
    category: input.category.toUpperCase(),
    price: input.price,
    active: input.active ?? true,
  };
  const service = id
    ? await prisma.service.update({ where: { id }, data })
    : await prisma.service.create({ data: { tenantId, ...data } });
  await writeAudit({
    tenantId,
    userId: actorId,
    action: id ? "service.updated" : "service.created",
    entity: "service",
    entityId: service.id,
    metadata: { price: input.price },
  });
  return serializeService(service);
}

export async function getService(tenantId: string, id: string) {
  const service = await prisma.service.findFirst({ where: { id, tenantId } });
  if (!service) throw notFound("Service not found.");
  return serializeService(service);
}
