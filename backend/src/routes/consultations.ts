import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { param } from "../lib/params.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { created, ok } from "../lib/response.js";
import {
  addDiagnosis,
  consultationSchema,
  diagnosisSchema,
  recordVitals,
  saveConsultation,
  vitalsSchema,
} from "../services/consultationService.js";

export const consultationsRouter = Router();
consultationsRouter.use(authenticate, authorize("ADMIN", "DOCTOR"));

consultationsRouter.put(
  "/encounters/:encounterId",
  asyncHandler(async (req, res) => {
    const body = consultationSchema.parse(req.body);
    return ok(res, await saveConsultation(req.user!.tenantId, req.user!.id, param(req, "encounterId"), body, req.ip));
  }),
);

export const vitalsRouter = Router();
vitalsRouter.use(authenticate, authorize("ADMIN", "DOCTOR"));
vitalsRouter.post(
  "/encounters/:encounterId",
  asyncHandler(async (req, res) => {
    const body = vitalsSchema.parse(req.body);
    return created(res, await recordVitals(req.user!.tenantId, req.user!.id, param(req, "encounterId"), body));
  }),
);

export const diagnosesRouter = Router();
diagnosesRouter.use(authenticate, authorize("ADMIN", "DOCTOR"));
diagnosesRouter.post(
  "/encounters/:encounterId",
  asyncHandler(async (req, res) => {
    const body = diagnosisSchema.parse(req.body);
    return created(res, await addDiagnosis(req.user!.tenantId, req.user!.id, param(req, "encounterId"), body, req.ip));
  }),
);
