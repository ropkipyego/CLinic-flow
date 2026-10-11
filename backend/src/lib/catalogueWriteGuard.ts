import { env } from "../config/env.js";
import { badRequest } from "./errors.js";

export const CATALOGUE_WRITE_BLOCKED_MESSAGE =
  "Catalogue and opening-stock writes are blocked. Production never allows them. Non-production writes require CATALOGUE_IMPORT_WRITE=true after a dry-run review. Quantities in a catalogue file never change stock.";

export function catalogueWritesBlocked(opts?: {
  isProduction?: boolean;
  writeEnabled?: boolean;
  nodeEnv?: string;
}): boolean {
  const isProduction = opts?.isProduction ?? env.isProduction;
  const writeEnabled = opts?.writeEnabled ?? env.catalogueImportWrite;
  const nodeEnv = opts?.nodeEnv ?? env.nodeEnv;
  if (isProduction || nodeEnv === "production") return true;
  if (nodeEnv === "test") return false;
  return !writeEnabled;
}

export function assertCatalogueWritesAllowed(): void {
  if (catalogueWritesBlocked()) {
    throw badRequest(CATALOGUE_WRITE_BLOCKED_MESSAGE);
  }
}
