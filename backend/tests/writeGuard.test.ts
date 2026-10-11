import { describe, expect, it } from "vitest";
import { catalogueWritesBlocked } from "../src/lib/catalogueWriteGuard.js";
import { isUniqueConstraintError } from "../src/lib/prismaErrors.js";

describe("production catalogue/stock write policy", () => {
  it("never allows writes when NODE_ENV would be production, even with the write flag", () => {
    expect(catalogueWritesBlocked({ isProduction: true, writeEnabled: true, nodeEnv: "production" })).toBe(true);
  });

  it("allows non-production writes only with the explicit flag", () => {
    expect(catalogueWritesBlocked({ isProduction: false, writeEnabled: true, nodeEnv: "development" })).toBe(false);
    expect(catalogueWritesBlocked({ isProduction: false, writeEnabled: false, nodeEnv: "development" })).toBe(true);
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
