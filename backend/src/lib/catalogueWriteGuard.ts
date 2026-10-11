import { env } from "../config/env.js";
import { badRequest, forbidden } from "./errors.js";
import { isClinicAdmin } from "./roles.js";

export const CATALOGUE_WRITE_BLOCKED_MESSAGE =
  "Catalogue master-data import requires a clinic administrator (ADMIN or SUPER_ADMIN) signed in through the application. Quantities in a catalogue file never change stock.";

export const OPENING_STOCK_WRITE_BLOCKED_MESSAGE =
  "Opening-stock posting is blocked in production. Use Stock take to change shelf quantities. Non-production opening-stock writes require CATALOGUE_IMPORT_WRITE=true after a dry-run review.";

/** Catalogue master data: role is the authorization. Env flags never enable this in place of an admin session. */
export function assertCatalogueMasterDataImportAllowed(role: string): void {
  if (!isClinicAdmin(role)) {
    throw forbidden(CATALOGUE_WRITE_BLOCKED_MESSAGE);
  }
}

export function openingStockWritesBlocked(opts?: {
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

/** Opening stock / stock-changing imports. Production is always blocked. */
export function assertOpeningStockWritesAllowed(): void {
  if (openingStockWritesBlocked()) {
    throw badRequest(OPENING_STOCK_WRITE_BLOCKED_MESSAGE);
  }
}

/** @deprecated Use assertCatalogueMasterDataImportAllowed or assertOpeningStockWritesAllowed. */
export function catalogueWritesBlocked(opts?: {
  isProduction?: boolean;
  writeEnabled?: boolean;
  nodeEnv?: string;
}): boolean {
  return openingStockWritesBlocked(opts);
}

/** @deprecated */
export function assertCatalogueWritesAllowed(): void {
  assertOpeningStockWritesAllowed();
}
