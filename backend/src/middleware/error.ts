import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../lib/errors.js";
import { fail } from "../lib/response.js";

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    const message = err.issues[0]?.message || "Validation failed.";
    return fail(res, 400, "VALIDATION_ERROR", message, err.issues);
  }

  if (err instanceof AppError) {
    if (err.status >= 500) {
      console.error("[clinicflow]", req.method, req.path, err);
    }
    return fail(res, err.status, err.code, err.message, err.details);
  }

  console.error("[clinicflow] unhandled", req.method, req.path, err);
  return fail(res, 500, "INTERNAL_ERROR", "The server encountered an unexpected error. Please try again.");
}

export function notFoundHandler(req: Request, res: Response) {
  return fail(res, 404, "NOT_FOUND", `No route matches ${req.method} ${req.path}`);
}
