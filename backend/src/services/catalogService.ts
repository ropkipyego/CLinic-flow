import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { writeAudit } from "../lib/audit.js";
import { conflict, notFound } from "../lib/errors.js";
import { money } from "../lib/serialize.js";
import { SERVICE_CATEGORIES } from "../data/serviceCategories.js";
import { MANUAL_CHARGE_SERVICES } from "../data/labCatalog.js";

export const serviceSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  category: z.string().min(1),
  price: z.number().nonnegative(),
  active: z.boolean().optional(),
});

export const pricePatchSchema = z.object({
  price: z.number().nonnegative(),
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
    name: input.name.trim(),
    code: input.code.trim().toUpperCase(),
    category: input.category.trim().toUpperCase(),
    price: input.price,
    active: input.active ?? true,
  };
  const clash = await prisma.service.findFirst({
    where: { tenantId, code: data.code, ...(id ? { NOT: { id } } : {}) },
  });
  if (clash) throw conflict("Another service already uses that code.");

  const service = id
    ? await prisma.service.findFirst({ where: { id, tenantId } }).then(async (existing) => {
        if (!existing) throw notFound("Service not found.");
        return prisma.service.update({ where: { id }, data });
      })
    : await prisma.service.create({ data: { tenantId, ...data } });
  await writeAudit({
    tenantId,
    userId: actorId,
    action: id ? "service.updated" : "service.created",
    entity: "service",
    entityId: service.id,
    metadata: { price: input.price, category: data.category },
  });
  return serializeService(service);
}

export async function getService(tenantId: string, id: string) {
  const service = await prisma.service.findFirst({ where: { id, tenantId } });
  if (!service) throw notFound("Service not found.");
  return serializeService(service);
}

export function listServiceCategories() {
  return [...SERVICE_CATEGORIES];
}

export async function updateServicePrice(
  tenantId: string,
  actorId: string,
  id: string,
  price: number,
) {
  const existing = await prisma.service.findFirst({ where: { id, tenantId } });
  if (!existing) throw notFound("Service not found.");
  const service = await prisma.service.update({ where: { id }, data: { price } });
  const lab = await prisma.labTest.findFirst({ where: { tenantId, OR: [{ serviceId: id }, { code: existing.code }] } });
  if (lab) {
    await prisma.labTest.update({ where: { id: lab.id }, data: { price } });
  }
  await writeAudit({
    tenantId,
    userId: actorId,
    action: "service.price_updated",
    entity: "service",
    entityId: service.id,
    metadata: { code: existing.code, from: money(existing.price), to: price },
  });
  return serializeService(service);
}

export async function applyHospitalCatalog(tenantId: string, actorId: string) {
  let created = 0;
  let updated = 0;
  for (const s of MANUAL_CHARGE_SERVICES) {
    const existing = await prisma.service.findFirst({ where: { tenantId, code: s.code } });
    if (existing) {
      await prisma.service.update({
        where: { id: existing.id },
        data: { name: s.name, category: s.category, price: s.price, active: true },
      });
      updated += 1;
    } else {
      await prisma.service.create({ data: { tenantId, ...s, active: true } });
      created += 1;
    }
  }
  await writeAudit({
    tenantId,
    userId: actorId,
    action: "services.catalog_applied",
    entity: "service",
    metadata: { created, updated, total: MANUAL_CHARGE_SERVICES.length },
  });
  return { created, updated, total: MANUAL_CHARGE_SERVICES.length };
}
