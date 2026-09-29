import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { param } from "../lib/params.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { created, ok } from "../lib/response.js";
import { createUser, createUserSchema, listRoleRights, listUsers, updateUser, updateUserSchema } from "../services/userService.js";

export const usersRouter = Router();
usersRouter.use(authenticate, authorize("ADMIN"));

usersRouter.get(
  "/",
  asyncHandler(async (req, res) => ok(res, await listUsers(req.user!.tenantId))),
);

usersRouter.get(
  "/rights",
  asyncHandler(async (req, res) => ok(res, listRoleRights(req.user!.role))),
);

usersRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = createUserSchema.parse(req.body);
    return created(res, await createUser(req.user!.tenantId, { id: req.user!.id, role: req.user!.role }, body, req.ip));
  }),
);

usersRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const body = updateUserSchema.parse(req.body);
    return ok(res, await updateUser(req.user!.tenantId, { id: req.user!.id, role: req.user!.role }, param(req, "id"), body, req.ip));
  }),
);
