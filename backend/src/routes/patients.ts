import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { param } from "../lib/params.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { created, ok } from "../lib/response.js";
import {
  createPatient,
  createPatientSchema,
  findPossibleDuplicates,
  getPatient,
  listPatientRegistry,
  searchPatients,
  updatePatient,
  updatePatientSchema,
} from "../services/patientService.js";
import { isClinicAdmin } from "../lib/roles.js";
import { getPatientProfile } from "../services/patientProfileService.js";
import { listPatientEncounters } from "../services/encounterService.js";

export const patientsRouter = Router();
patientsRouter.use(authenticate);

patientsRouter.get(
  "/",
  authorize("ADMIN", "RECEPTION", "DOCTOR", "CASHIER", "LAB", "PHARMACY"),
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q : undefined;
    return ok(res, await searchPatients(req.user!.tenantId, q, 50));
  }),
);

patientsRouter.get(
  "/registry",
  authorize("ADMIN", "RECEPTION", "DOCTOR", "CASHIER", "LAB", "PHARMACY"),
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q : undefined;
    const sex = typeof req.query.sex === "string" ? req.query.sex : undefined;
    const page = req.query.page ? Number(req.query.page) : 1;
    const take = req.query.take ? Number(req.query.take) : 30;
    return ok(res, await listPatientRegistry(req.user!.tenantId, { q, sex, page, take }));
  }),
);

patientsRouter.get(
  "/matches",
  authorize("ADMIN", "RECEPTION"),
  asyncHandler(async (req, res) => {
    return ok(
      res,
      await findPossibleDuplicates(req.user!.tenantId, {
        phone: typeof req.query.phone === "string" ? req.query.phone : undefined,
        firstName: typeof req.query.firstName === "string" ? req.query.firstName : undefined,
        lastName: typeof req.query.lastName === "string" ? req.query.lastName : undefined,
        dateOfBirth: typeof req.query.dateOfBirth === "string" ? req.query.dateOfBirth : undefined,
      }),
    );
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
    const canSeeFinance = isClinicAdmin(req.user!.role) || ["CASHIER", "RECEPTION"].includes(req.user!.role);
    return ok(res, await getPatientProfile(req.user!.tenantId, param(req, "id"), canSeeFinance));
  }),
);

patientsRouter.get(
  "/:id/encounters",
  authorize("ADMIN", "RECEPTION", "DOCTOR", "CASHIER", "LAB", "PHARMACY"),
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
