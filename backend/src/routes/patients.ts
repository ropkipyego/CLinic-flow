import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { param } from "../lib/params.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { created, ok } from "../lib/response.js";
import {
  createPatient,
  createPatientSchema,
  getPatient,
  searchPatients,
  updatePatient,
  updatePatientSchema,
} from "../services/patientService.js";
import { getPatientProfile } from "../services/patientProfileService.js";
import { listPatientEncounters } from "../services/encounterService.js";

export const patientsRouter = Router();
patientsRouter.use(authenticate);

patientsRouter.get(
  "/",
  authorize("ADMIN", "RECEPTION", "DOCTOR", "CASHIER"),
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q : undefined;
    return ok(res, await searchPatients(req.user!.tenantId, q));
  }),
);

patientsRouter.post(
  "/",
  authorize("ADMIN", "RECEPTION"),
  asyncHandler(async (req, res) => {
    const body = createPatientSchema.parse(req.body);
    return created(res, await createPatient(req.user!.tenantId, req.user!.id, body, req.ip));
  }),
);

patientsRouter.get(
  "/:id",
  authorize("ADMIN", "RECEPTION", "DOCTOR", "CASHIER", "LAB", "PHARMACY"),
  asyncHandler(async (req, res) => ok(res, await getPatient(req.user!.tenantId, param(req, "id")))),
);

patientsRouter.get(
  "/:id/profile",
  authorize("ADMIN", "RECEPTION", "DOCTOR", "CASHIER", "LAB", "PHARMACY"),
  asyncHandler(async (req, res) => {
    const canSeeFinance = ["ADMIN", "CASHIER"].includes(req.user!.role);
    return ok(res, await getPatientProfile(req.user!.tenantId, param(req, "id"), canSeeFinance));
  }),
);

patientsRouter.get(
  "/:id/encounters",
  authorize("ADMIN", "RECEPTION", "DOCTOR", "CASHIER"),
  asyncHandler(async (req, res) => ok(res, await listPatientEncounters(req.user!.tenantId, param(req, "id")))),
);

patientsRouter.patch(
  "/:id",
  authorize("ADMIN", "RECEPTION"),
  asyncHandler(async (req, res) => {
    const body = updatePatientSchema.parse(req.body);
    return ok(res, await updatePatient(req.user!.tenantId, req.user!.id, param(req, "id"), body, req.ip));
  }),
);
