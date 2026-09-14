import { EncounterStatus } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { param } from "../lib/params.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { created, ok } from "../lib/response.js";
import {
  cancelEncounter,
  checkInConsultation,
  createEncounter,
  createEncounterSchema,
  encounterTimeline,
  getEncounter,
  listTodayEncounters,
  todayStats,
  updateEncounterStatus,
} from "../services/encounterService.js";
import { getConsultationBundle } from "../services/consultationService.js";

export const encountersRouter = Router();
encountersRouter.use(authenticate);

encountersRouter.get(
  "/",
  authorize("ADMIN", "RECEPTION", "DOCTOR", "CASHIER"),
  asyncHandler(async (req, res) => ok(res, await listTodayEncounters(req.user!.tenantId))),
);

encountersRouter.get(
  "/stats/today",
  asyncHandler(async (req, res) => ok(res, await todayStats(req.user!.tenantId))),
);

encountersRouter.get(
  "/doctors",
  authorize("ADMIN", "RECEPTION", "DOCTOR"),
  asyncHandler(async (req, res) => {
    const { prisma } = await import("../lib/prisma.js");
    const doctors = await prisma.user.findMany({
      where: { tenantId: req.user!.tenantId, role: { in: ["DOCTOR", "ADMIN"] }, active: true },
      select: { id: true, firstName: true, lastName: true, role: true },
      orderBy: { lastName: "asc" },
    });
    return ok(
      res,
      doctors.map((d) => ({ id: d.id, name: `${d.firstName} ${d.lastName}`, role: d.role })),
    );
  }),
);

encountersRouter.post(
  "/",
  authorize("ADMIN", "RECEPTION"),
  asyncHandler(async (req, res) => {
    const body = createEncounterSchema.parse(req.body);
    return created(res, await createEncounter(req.user!.tenantId, req.user!.id, body, req.ip));
  }),
);

encountersRouter.get(
  "/:id",
  authorize("ADMIN", "RECEPTION", "DOCTOR", "LAB", "PHARMACY", "CASHIER"),
  asyncHandler(async (req, res) => ok(res, await getEncounter(req.user!.tenantId, param(req, "id")))),
);

encountersRouter.get(
  "/:id/clinical",
  authorize("ADMIN", "DOCTOR"),
  asyncHandler(async (req, res) => ok(res, await getConsultationBundle(req.user!.tenantId, param(req, "id")))),
);

encountersRouter.get(
  "/:id/timeline",
  authorize("ADMIN", "RECEPTION", "DOCTOR", "CASHIER"),
  asyncHandler(async (req, res) => ok(res, await encounterTimeline(req.user!.tenantId, param(req, "id")))),
);

encountersRouter.post(
  "/:id/check-in",
  authorize("ADMIN", "RECEPTION"),
  asyncHandler(async (req, res) => {
    const body = z.object({ assignedDoctorId: z.string().uuid().optional() }).parse(req.body ?? {});
    return ok(res, await checkInConsultation(req.user!.tenantId, req.user!.id, param(req, "id"), body.assignedDoctorId));
  }),
);

encountersRouter.post(
  "/:id/status",
  authorize("ADMIN", "RECEPTION", "DOCTOR"),
  asyncHandler(async (req, res) => {
    const body = z.object({ status: z.nativeEnum(EncounterStatus) }).parse(req.body);
    return ok(res, await updateEncounterStatus(req.user!.tenantId, req.user!.id, param(req, "id"), body.status));
  }),
);

encountersRouter.post(
  "/:id/cancel",
  authorize("ADMIN", "RECEPTION"),
  asyncHandler(async (req, res) => ok(res, await cancelEncounter(req.user!.tenantId, req.user!.id, param(req, "id")))),
);
