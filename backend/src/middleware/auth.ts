import type { NextFunction, Request, Response } from "express";
import type { Role } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { verifyToken } from "../lib/jwt.js";
import { forbidden, unauthorized } from "../lib/errors.js";

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw unauthorized();
    }
    const token = header.slice(7);
    const payload = verifyToken(token);
    const user = await prisma.user.findFirst({
      where: { id: payload.sub, tenantId: payload.tenantId, active: true },
    });
    if (!user) throw unauthorized("Account is inactive or no longer exists.");
    req.user = {
      id: user.id,
      tenantId: user.tenantId,
      role: user.role,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    };
    next();
  } catch (error) {
    next(error instanceof Error && "status" in error ? error : unauthorized("Invalid or expired session. Please sign in again."));
  }
}

export function authorize(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    if (req.user.role === "ADMIN") return next();
    if (!roles.includes(req.user.role)) {
      return next(forbidden("Your role is not permitted to access this resource."));
    }
    next();
  };
}

export function requireSelfTenant(tenantId: string, userTenantId: string) {
  if (tenantId !== userTenantId) {
    throw forbidden("You cannot access another clinic's data.");
  }
}
