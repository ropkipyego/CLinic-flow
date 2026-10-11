import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../lib/errors.js";
import { fail } from "../lib/response.js";

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const code = err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : "";
  const type = err && typeof err === "object" && "type" in err ? String((err as { type: unknown }).type) : "";
  if (code === "LIMIT_FILE_SIZE" || type === "entity.too.large") {
    return fail(
      res,
      413,
      "PAYLOAD_TOO_LARGE",
      "That catalogue file is too large to send as form text. Upload the Excel/CSV file instead (up to 20 MB).",
    );
  }
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
