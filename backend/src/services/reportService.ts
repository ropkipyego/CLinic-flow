import { prisma } from "../lib/prisma.js";
import { money } from "../lib/serialize.js";

export function parseRange(from?: string, to?: string) {
  const start = from ? new Date(`${from}T00:00:00`) : new Date(new Date().toISOString().slice(0, 10) + "T00:00:00");
  const end = to ? new Date(`${to}T00:00:00`) : new Date(start);
  if (to) {
    end.setDate(end.getDate() + 1);
  } else {
    end.setDate(start.getDate() + 1);
  }
  return { start, end, from: from ?? start.toISOString().slice(0, 10), to: to ?? start.toISOString().slice(0, 10) };
}

export async function dailyVisits(tenantId: string, from?: string, to?: string) {
  const { start, end } = parseRange(from, to);
  const encounters = await prisma.encounter.findMany({
    where: { tenantId, startedAt: { gte: start, lt: end } },
    include: { patient: true, assignedDoctor: true },
    orderBy: { startedAt: "asc" },
  });
  return encounters.map((e) => ({
    visitNumber: e.visitNumber,
    visitType: e.visitType,
    patientNumber: e.patient.patientNumber,
    patient: `${e.patient.firstName} ${e.patient.lastName}`,
    status: e.status,
    doctor: e.assignedDoctor ? `${e.assignedDoctor.firstName} ${e.assignedDoctor.lastName}` : "",
    startedAt: e.startedAt.toISOString(),
  }));
}

export async function dailyRevenue(tenantId: string, from?: string, to?: string) {
  const { start, end } = parseRange(from, to);
  const payments = await prisma.payment.findMany({
    where: { tenantId, createdAt: { gte: start, lt: end } },
  });
  const total = payments.reduce((s, p) => s + money(p.amount), 0);
  const byMethod: Record<string, number> = {};
  for (const p of payments) {
    byMethod[p.method] = (byMethod[p.method] || 0) + money(p.amount);
  }
  return {
    total: Number(total.toFixed(2)),
    count: payments.length,
    byMethod,
  };
}

export async function labReport(tenantId: string, from?: string, to?: string) {
  const { start, end } = parseRange(from, to);
  const results = await prisma.labResult.findMany({
    where: { tenantId, createdAt: { gte: start, lt: end } },
    include: { labTest: true },
  });
  const charges = await prisma.charge.findMany({
    where: { tenantId, source: "LABORATORY", createdAt: { gte: start, lt: end }, status: { not: "VOIDED" } },
  });
  const byTest: Record<string, { count: number; revenue: number }> = {};
  for (const r of results) {
    const key = r.labTest.name;
    byTest[key] ??= { count: 0, revenue: 0 };
    byTest[key].count += 1;
  }
  for (const c of charges) {
    const key = c.description;
    byTest[key] ??= { count: 0, revenue: 0 };
    byTest[key].revenue += money(c.total);
  }
  return {
    testsPerformed: results.length,
    revenue: Number(charges.reduce((s, c) => s + money(c.total), 0).toFixed(2)),
    byTest,
  };
}

export async function pharmacySales(tenantId: string, from?: string, to?: string) {
  const { start, end } = parseRange(from, to);
  const charges = await prisma.charge.findMany({
    where: { tenantId, source: "PHARMACY", createdAt: { gte: start, lt: end }, status: { not: "VOIDED" } },
    include: { medicine: true },
  });
  return {
    revenue: Number(charges.reduce((s, c) => s + money(c.total), 0).toFixed(2)),
    items: charges.map((c) => ({
      medicine: c.medicine?.name ?? c.description,
      quantity: money(c.quantity),
      total: money(c.total),
      createdAt: c.createdAt.toISOString(),
    })),
  };
}

export async function lowStock(tenantId: string) {
  const medicines = await prisma.medicine.findMany({
    where: { tenantId, active: true },
    orderBy: { quantityOnHand: "asc" },
  });
  return medicines
    .filter((m) => m.quantityOnHand <= m.reorderLevel)
    .map((m) => ({
      name: m.name,
      sku: m.sku,
      quantityOnHand: m.quantityOnHand,
      reorderLevel: m.reorderLevel,
    }));
}

export async function doctorConsultations(tenantId: string, from?: string, to?: string) {
  const { start, end } = parseRange(from, to);
  const consultations = await prisma.consultation.findMany({
    where: { tenantId, createdAt: { gte: start, lt: end } },
    include: { doctor: true },
  });
  const byDoctor: Record<string, number> = {};
  for (const c of consultations) {
    const name = `${c.doctor.firstName} ${c.doctor.lastName}`;
    byDoctor[name] = (byDoctor[name] || 0) + 1;
  }
  return { total: consultations.length, byDoctor };
}

export async function encounterSummary(tenantId: string, from?: string, to?: string) {
  const { start, end } = parseRange(from, to);
  const encounters = await prisma.encounter.findMany({
    where: { tenantId, startedAt: { gte: start, lt: end } },
  });
  const byStatus: Record<string, number> = {};
  const byType: Record<string, number> = {};
  for (const e of encounters) {
    byStatus[e.status] = (byStatus[e.status] || 0) + 1;
    byType[e.visitType] = (byType[e.visitType] || 0) + 1;
  }
  return { total: encounters.length, byStatus, byVisitType: byType };
}

export function toCsv(rows: Array<Record<string, unknown>>): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
}
