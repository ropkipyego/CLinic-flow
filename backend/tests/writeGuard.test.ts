import { describe, expect, it } from "vitest";
import { openingStockWritesBlocked, assertCatalogueMasterDataImportAllowed } from "../src/lib/catalogueWriteGuard.js";
import { isUniqueConstraintError } from "../src/lib/prismaErrors.js";

describe("opening-stock write policy", () => {
  it("never allows opening-stock writes in production, even with the write flag", () => {
    expect(openingStockWritesBlocked({ isProduction: true, writeEnabled: true, nodeEnv: "production" })).toBe(true);
  });

  it("allows non-production opening-stock writes only with the explicit flag", () => {
    expect(openingStockWritesBlocked({ isProduction: false, writeEnabled: true, nodeEnv: "development" })).toBe(false);
    expect(openingStockWritesBlocked({ isProduction: false, writeEnabled: false, nodeEnv: "development" })).toBe(true);
  });
});

describe("catalogue master-data authorization", () => {
  it("allows clinic administrators and rejects other roles", () => {
    expect(() => assertCatalogueMasterDataImportAllowed("ADMIN")).not.toThrow();
    expect(() => assertCatalogueMasterDataImportAllowed("SUPER_ADMIN")).not.toThrow();
    expect(() => assertCatalogueMasterDataImportAllowed("PHARMACY")).toThrow(/administrator/i);
    expect(() => assertCatalogueMasterDataImportAllowed("CASHIER")).toThrow(/administrator/i);
  });
});

describe("opening-stock and GRN uniqueness conflict mapping", () => {
  it("recognises PostgreSQL unique violations including the posted opening-stock index", () => {
    expect(isUniqueConstraintError({ code: "23505" })).toBe(true);
    expect(
      isUniqueConstraintError(
        new Error('duplicate key value violates unique constraint "ImportBatch_opening_stock_posted_uniq"'),
      ),
    ).toBe(true);
    expect(
      isUniqueConstraintError(
        new Error('duplicate key value violates unique constraint "GoodsReceipt_tenantId_clientRequestId_key"'),
      ),
    ).toBe(true);
  });
});
