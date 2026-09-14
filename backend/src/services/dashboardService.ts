import { listTodayEncounters, todayStats } from "./encounterService.js";
import { cashierToday } from "./billingService.js";
import { labQueue } from "./labService.js";
import { listMedicines, pharmacyQueue } from "./pharmacyService.js";

export async function operationalDashboard(tenantId: string, timezone = "Africa/Nairobi") {
  const [stats, visits, cashier, lab, pharmacy, medicines] = await Promise.all([
    todayStats(tenantId, timezone),
    listTodayEncounters(tenantId, timezone),
    cashierToday(tenantId, timezone),
    labQueue(tenantId),
    pharmacyQueue(tenantId),
    listMedicines(tenantId, { lowStock: true, activeOnly: true }),
  ]);

  const byStatus: Record<string, number> = {};
  const byVisitType: Record<string, number> = {};
  for (const visit of visits) {
    byStatus[visit.status] = (byStatus[visit.status] || 0) + 1;
    byVisitType[visit.visitType] = (byVisitType[visit.visitType] || 0) + 1;
  }

  return {
    generatedAt: new Date().toISOString(),
    stats,
    byStatus,
    byVisitType,
    visits,
    cashier: {
      pending: cashier.pending,
      dailyTotal: cashier.dailyTotal,
      completedCount: cashier.completed.length,
    },
    labPending: lab.length,
    pharmacyPending: pharmacy.length,
    lowStock: medicines,
  };
}
