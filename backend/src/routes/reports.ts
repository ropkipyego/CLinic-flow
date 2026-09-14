import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { ok } from "../lib/response.js";
import {
  dailyRevenue,
  dailyVisits,
  doctorConsultations,
  encounterSummary,
  labReport,
  lowStock,
  pharmacySales,
  toCsv,
} from "../services/reportService.js";

export const reportsRouter = Router();
reportsRouter.use(authenticate, authorize("ADMIN"));

function range(req: { query: Record<string, unknown> }) {
  return {
    from: typeof req.query.from === "string" ? req.query.from : undefined,
    to: typeof req.query.to === "string" ? req.query.to : undefined,
  };
}

reportsRouter.get(
  "/visits",
  asyncHandler(async (req, res) => {
    const { from, to } = range(req);
    const rows = await dailyVisits(req.user!.tenantId, from, to);
    if (req.query.format === "csv") {
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=visits.csv");
      return res.send(toCsv(rows));
    }
    return ok(res, rows);
  }),
);

reportsRouter.get(
  "/revenue",
  asyncHandler(async (req, res) => {
    const { from, to } = range(req);
    return ok(res, await dailyRevenue(req.user!.tenantId, from, to));
  }),
);

reportsRouter.get(
  "/lab",
  asyncHandler(async (req, res) => {
    const { from, to } = range(req);
    return ok(res, await labReport(req.user!.tenantId, from, to));
  }),
);

reportsRouter.get(
  "/pharmacy",
  asyncHandler(async (req, res) => {
    const { from, to } = range(req);
    return ok(res, await pharmacySales(req.user!.tenantId, from, to));
  }),
);

reportsRouter.get(
  "/low-stock",
  asyncHandler(async (req, res) => ok(res, await lowStock(req.user!.tenantId))),
);

reportsRouter.get(
  "/doctors",
  asyncHandler(async (req, res) => {
    const { from, to } = range(req);
    return ok(res, await doctorConsultations(req.user!.tenantId, from, to));
  }),
);

reportsRouter.get(
  "/encounters",
  asyncHandler(async (req, res) => {
    const { from, to } = range(req);
    return ok(res, await encounterSummary(req.user!.tenantId, from, to));
  }),
);
