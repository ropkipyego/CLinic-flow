import { describe, expect, it } from "vitest";
import { parseCsv, parseCsvRecords } from "../src/lib/csv.js";
import { databaseNameFromUrl, assertIsolatedTestDatabase } from "../src/lib/testDatabase.js";
import { catalogueWritesBlocked } from "../src/lib/catalogueWriteGuard.js";
import { resolveHeaderMapping, suggestHeaderMapping } from "../src/lib/catalogueHeaders.js";
import { parseCatalogueRows } from "../src/services/pharmacyCatalogueImport.js";

describe("CSV parser", () => {
  it("keeps quoted commas, escaped quotes, and quoted newlines", () => {
    const text = [
      "name,quantity,aten,costPrice",
      '"Amox, 500mg",10,ATEN-1,12.50',
      '"Say ""hello""",0,"ATEN,2",0',
      '"Line',
      'break",1,ATEN-3,4',
    ].join("\n");
    const { headers, rows } = parseCsv(text);
    expect(headers).toEqual(["name", "quantity", "aten", "costPrice"]);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({ name: "Amox, 500mg", quantity: "10", aten: "ATEN-1", costPrice: "12.50" });
    expect(rows[1]!.name).toBe('Say "hello"');
    expect(rows[1]!.aten).toBe("ATEN,2");
    expect(rows[2]!.name).toBe("Line\nbreak");
  });

  it("rejects unclosed quotes", () => {
    expect(() => parseCsvRecords('"open,1')).toThrow(/unclosed/i);
  });
});

describe("catalogue write guard", () => {
  it("blocks production even when CATALOGUE_IMPORT_WRITE is true", () => {
    expect(catalogueWritesBlocked({ isProduction: true, writeEnabled: true, nodeEnv: "production" })).toBe(true);
    expect(catalogueWritesBlocked({ isProduction: true, writeEnabled: false, nodeEnv: "production" })).toBe(true);
    expect(catalogueWritesBlocked({ isProduction: false, writeEnabled: false, nodeEnv: "development" })).toBe(true);
    expect(catalogueWritesBlocked({ isProduction: false, writeEnabled: true, nodeEnv: "development" })).toBe(false);
    expect(catalogueWritesBlocked({ isProduction: false, writeEnabled: false, nodeEnv: "test" })).toBe(false);
  });
});

describe("exact CSV header mapping", () => {
  it("maps ATEN/sku/code to aten and never uses substring name matches", () => {
    const headers = ["generic name", "name", "ATEN", "Cost", "PRICE", "patient name"];
    const suggested = suggestHeaderMapping(headers);
    expect(suggested.name).toBe("name");
    expect(suggested.aten).toBe("ATEN");
    expect(suggested.costPrice).toBe("Cost");
    expect(suggested.sellingPrice).toBe("PRICE");
    expect(suggested.genericName).toBe("generic name");
    expect(Object.values(suggested)).not.toContain("patient name");
  });

  it("ignores client mapping that would copy cost into selling price or map genericName to name", () => {
    const headers = ["generic name", "name", "Cost", "PRICE"];
    const resolved = resolveHeaderMapping(headers, {
      name: "generic name",
      sellingPrice: "Cost",
      costPrice: "Cost",
    });
    expect(resolved.name).toBe("name");
    expect(resolved.sellingPrice).toBe("PRICE");
    expect(resolved.costPrice).toBe("Cost");
  });

  it("does not copy Cost into selling price when parsing catalogue rows", () => {
    const rows = parseCatalogueRows(
      [{ Item: "ZYRTEC", Cost: "26", PRICE: "" }],
      { sellingPrice: "Cost", costPrice: "Cost", name: "Item" },
    );
    expect(rows[0]!.costPrice).toBe(26);
    expect(rows[0]!.sellingPrice).toBeNull();
  });
});

describe("test database guard", () => {
  it("accepts only the exact clinicflow_test name", () => {
    expect(databaseNameFromUrl("postgresql://clinicflow:clinicflow@localhost:5434/clinicflow_test")).toBe("clinicflow_test");
    expect(databaseNameFromUrl("postgresql://x:y@localhost:5434/clinicflow")).toBe("clinicflow");
    expect(() => assertIsolatedTestDatabase("postgresql://x:y@localhost:5434/clinicflow")).toThrow(/clinicflow_test/);
    expect(() => assertIsolatedTestDatabase("postgresql://x:y@localhost:5434/my_test_clinic")).toThrow(/clinicflow_test/);
    expect(() => assertIsolatedTestDatabase("postgresql://x:y@localhost:5434/test")).toThrow(/clinicflow_test/);
  });
});
