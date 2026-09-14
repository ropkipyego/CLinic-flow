import { Role } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { hashPassword } from "../lib/password.js";
import { writeAudit } from "../lib/audit.js";
import { badRequest, conflict, notFound } from "../lib/errors.js";

export const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
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
  };
}

export async function listUsers(tenantId: string) {
  const users = await prisma.user.findMany({
    where: { tenantId },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  return users.map(publicUser);
}

export async function createUser(
  tenantId: string,
  actorId: string,
  input: z.infer<typeof createUserSchema>,
  ip?: string,
) {
  const email = input.email.toLowerCase();
  const exists = await prisma.user.findFirst({ where: { tenantId, email } });
  if (exists) throw conflict("A user with this email already exists in this clinic.");

  const user = await prisma.user.create({
    data: {
      tenantId,
      email,
      passwordHash: await hashPassword(input.password),
      firstName: input.firstName,
      lastName: input.lastName,
      role: input.role,
      active: input.active ?? true,
    },
  });
  await writeAudit({
    tenantId,
    userId: actorId,
    action: "user.created",
    entity: "user",
    entityId: user.id,
    metadata: { role: user.role, email: user.email },
    ipAddress: ip,
  });
  return publicUser(user);
}

export async function updateUser(
  tenantId: string,
  actorId: string,
  userId: string,
  input: z.infer<typeof updateUserSchema>,
  ip?: string,
) {
  const existing = await prisma.user.findFirst({ where: { id: userId, tenantId } });
  if (!existing) throw notFound("User not found.");
  if (input.email && input.email.toLowerCase() !== existing.email) {
    const clash = await prisma.user.findFirst({
      where: { tenantId, email: input.email.toLowerCase(), NOT: { id: userId } },
    });
    if (clash) throw conflict("A user with this email already exists in this clinic.");
  }
  if (existing.id === actorId && input.active === false) {
    throw badRequest("You cannot deactivate your own account.");
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
    userId: actorId,
    action: input.role && input.role !== existing.role ? "user.permissions_changed" : "user.updated",
    entity: "user",
    entityId: user.id,
    metadata: { previousRole: existing.role, role: user.role, active: user.active },
    ipAddress: ip,
  });
  return publicUser(user);
}
