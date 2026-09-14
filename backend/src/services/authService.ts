import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { signToken } from "../lib/jwt.js";
import { writeAudit } from "../lib/audit.js";
import { badRequest, unauthorized } from "../lib/errors.js";
import { env } from "../config/env.js";
import { sendEmail } from "./email/index.js";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  tenantSlug: z.string().optional(),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
  tenantSlug: z.string().optional(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export async function login(input: z.infer<typeof loginSchema>, ip?: string) {
  const user = await prisma.user.findFirst({
    where: {
      email: input.email.toLowerCase(),
      active: true,
      ...(input.tenantSlug ? { tenant: { slug: input.tenantSlug } } : {}),
    },
    include: { tenant: true },
  });
  if (!user) throw unauthorized("Invalid email or password.");
  const matches = await verifyPassword(input.password, user.passwordHash);
  if (!matches) throw unauthorized("Invalid email or password.");

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await writeAudit({
    tenantId: user.tenantId,
    userId: user.id,
    action: "user.login",
    entity: "user",
    entityId: user.id,
    ipAddress: ip,
  });

  const token = signToken({
    sub: user.id,
    tenantId: user.tenantId,
    role: user.role,
    email: user.email,
  });

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
    },
    tenant: serializeTenant(user.tenant),
  };
}

export async function requestPasswordReset(input: z.infer<typeof forgotPasswordSchema>) {
  const user = await prisma.user.findFirst({
    where: {
      email: input.email.toLowerCase(),
      active: true,
      ...(input.tenantSlug ? { tenant: { slug: input.tenantSlug } } : {}),
    },
  });
  if (!user) return { queued: true };

  const raw = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(raw).digest("hex");
  const expiresAt = new Date(Date.now() + env.passwordResetMinutes * 60 * 1000);
  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash, expiresAt },
  });

  const resetUrl = `${env.frontendUrl}/reset-password?token=${raw}`;
  await sendEmail({
    tenantId: user.tenantId,
    to: user.email,
    subject: "Reset your ClinicFlow password",
    body: `Use this link to reset your password. It expires in ${env.passwordResetMinutes} minutes.\n\n${resetUrl}`,
    purpose: "password_reset",
  });

  return { queued: true, ...(env.isDevelopment ? { devResetToken: raw } : {}) };
}

export async function resetPassword(input: z.infer<typeof resetPasswordSchema>) {
  const tokenHash = crypto.createHash("sha256").update(input.token).digest("hex");
  const record = await prisma.passwordResetToken.findFirst({
    where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
    include: { user: true },
  });
  if (!record) throw badRequest("This reset link is invalid or has expired.");

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: record.userId },
      data: { passwordHash: await hashPassword(input.password) },
    });
    await tx.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });
    await writeAudit(
      {
        tenantId: record.user.tenantId,
        userId: record.userId,
        action: "user.password_reset",
        entity: "user",
        entityId: record.userId,
      },
      tx,
    );
  });

  return { reset: true };
}

export function serializeTenant(tenant: {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  website: string | null;
  receiptFooter: string | null;
  smsSenderId: string | null;
  timezone: string;
  currency: string;
}) {
  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    logoUrl: tenant.logoUrl,
    primaryColor: tenant.primaryColor,
    secondaryColor: tenant.secondaryColor,
    phone: tenant.phone,
    email: tenant.email,
    address: tenant.address,
    website: tenant.website,
    receiptFooter: tenant.receiptFooter,
    smsSenderId: tenant.smsSenderId,
    timezone: tenant.timezone,
    currency: tenant.currency,
  };
}
