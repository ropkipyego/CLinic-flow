import type { Request } from "express";
import { badRequest } from "./errors.js";

export function param(req: Request, name: string): string {
  const value = req.params[name];
  const resolved = Array.isArray(value) ? value[0] : value;
  if (!resolved) throw badRequest(`Missing path parameter: ${name}`);
  return resolved;
}
