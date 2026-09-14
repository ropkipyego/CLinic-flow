import type { Role } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        tenantId: string;
        role: Role;
        email: string;
        firstName: string;
        lastName: string;
      };
    }
  }
}

export {};
