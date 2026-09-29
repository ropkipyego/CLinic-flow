import { Role } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { generateStaffPassword, hashPassword } from "../lib/password.js";
import { writeAudit } from "../lib/audit.js";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors.js";
import { env } from "../config/env.js";
import { sendEmail } from "./email/index.js";
import { isSuperAdmin, ROLE_RIGHTS, rolesAssignableBy, STAFF_ROLES } from "../lib/roles.js";

export { STAFF_ROLES };

export const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).optional(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: z.nativeEnum(Role),
  active: z.boolean().optional(),
});

export const updateUserSchema = z.object({
  email: z.string().email().optional(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  role: z.nativeEnum(Role).optional(),
  active: z.boolean().optional(),
  password: z.string().min(8).optional(),
});

function publicUser(user: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  active: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    active: user.active,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    isSuperAdmin: user.role === "SUPER_ADMIN",
    isClinicAdmin: user.role === "SUPER_ADMIN" || user.role === "ADMIN",
  };
}

function roleLabel(role: Role) {
  if (role === "SUPER_ADMIN") return "Super Admin";
  if (role === "ADMIN") return "Admin";
  return role.toLowerCase();
}

async function countActiveSuperAdmins(tenantId: string, exceptUserId?: string) {
  return prisma.user.count({
    where: {
      tenantId,
      role: "SUPER_ADMIN",
      active: true,
      ...(exceptUserId ? { NOT: { id: exceptUserId } } : {}),
    },
  });
}

function assertCanAssign(actorRole: Role, targetRole: Role) {
  if (!rolesAssignableBy(actorRole).includes(targetRole)) {
    throw forbidden(
      actorRole === "ADMIN"
        ? "Only the Super Admin can create or change Super Admin accounts."
        : "Your role cannot assign that permission.",
    );
  }
}

export async function listUsers(tenantId: string) {
  const users = await prisma.user.findMany({
    where: { tenantId },
    orderBy: [{ role: "asc" }, { lastName: "asc" }, { firstName: "asc" }],
  });
  return users.map(publicUser);
}

export function listRoleRights(actorRole: Role) {
  return {
    actorRole,
    assignableRoles: rolesAssignableBy(actorRole),
    rights: ROLE_RIGHTS,
  };
}

export async function createUser(
  tenantId: string,
  actor: { id: string; role: Role },
  input: z.infer<typeof createUserSchema>,
  ip?: string,
) {
  assertCanAssign(actor.role, input.role);
  const email = input.email.toLowerCase();
  const exists = await prisma.user.findFirst({ where: { tenantId, email } });
  if (exists) throw conflict("A user with this email already exists in this clinic.");

  const generatedPassword = input.password ? null : generateStaffPassword();
  const password = input.password || generatedPassword!;

  const tenant = await prisma.tenant.findFirst({ where: { id: tenantId } });
  const user = await prisma.user.create({
    data: {
      tenantId,
      email,
      passwordHash: await hashPassword(password),
      firstName: input.firstName,
      lastName: input.lastName,
      role: input.role,
      active: input.active ?? true,
    },
  });
  await writeAudit({
    tenantId,
    userId: actor.id,
    action: "user.created",
    entity: "user",
    entityId: user.id,
    metadata: { role: user.role, email: user.email, superAdmin: user.role === "SUPER_ADMIN" },
    ipAddress: ip,
  });

  await sendEmail({
    tenantId,
    to: user.email,
    purpose: "staff.welcome",
    subject: `${tenant?.name || "Clinic"} — your ClinicFlow account`,
    body: [
      `Hello ${user.firstName},`,
      "",
      `A ${roleLabel(user.role)} account was created for you at ${tenant?.name || "the clinic"}.`,
      "",
      `Sign in: ${env.frontendUrl}/login`,
      `Email: ${user.email}`,
      generatedPassword ? `Temporary password: ${password}` : "Use the password you were given, then change it after sign-in if needed.",
      "",
      "Keep this email private. Do not share your password.",
    ].join("\n"),
  });

  return {
    ...publicUser(user),
    temporaryPassword: generatedPassword ?? undefined,
    emailQueued: true,
  };
}

export async function updateUser(
  tenantId: string,
  actor: { id: string; role: Role },
  userId: string,
  input: z.infer<typeof updateUserSchema>,
  ip?: string,
) {
  const existing = await prisma.user.findFirst({ where: { id: userId, tenantId } });
  if (!existing) throw notFound("User not found.");
  if (existing.role === "SUPER_ADMIN" && !isSuperAdmin(actor.role)) {
    throw forbidden("Only a Super Admin can change a Super Admin account.");
  }
  if (input.role) assertCanAssign(actor.role, input.role);
  if (input.email && input.email.toLowerCase() !== existing.email) {
    const clash = await prisma.user.findFirst({
      where: { tenantId, email: input.email.toLowerCase(), NOT: { id: userId } },
    });
    if (clash) throw conflict("A user with this email already exists in this clinic.");
  }
  if (existing.id === actor.id && input.active === false) {
    throw badRequest("You cannot deactivate your own account.");
  }
  if (existing.role === "SUPER_ADMIN" && (input.active === false || (input.role && input.role !== "SUPER_ADMIN"))) {
    const others = await countActiveSuperAdmins(tenantId, userId);
    if (others === 0) {
      throw badRequest("This clinic must keep at least one Super Admin.");
    }
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      email: input.email?.toLowerCase(),
      firstName: input.firstName,
      lastName: input.lastName,
      role: input.role,
      active: input.active,
      ...(input.password ? { passwordHash: await hashPassword(input.password) } : {}),
    },
  });

  await writeAudit({
    tenantId,
    userId: actor.id,
    action: input.role && input.role !== existing.role ? "user.permissions_changed" : "user.updated",
    entity: "user",
    entityId: user.id,
    metadata: { previousRole: existing.role, role: user.role, active: user.active },
    ipAddress: ip,
  });
  return publicUser(user);
}
