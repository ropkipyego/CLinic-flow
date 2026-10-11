/** Keep exact aliases in sync with backend/src/lib/catalogueHeaders.ts. No substring matching. */
export const CATALOGUE_FIELD_ALIASES = {
  name: ["drug name", "name", "item", "medicine", "product", "drug"],
  quantity: ["quantity", "qty", "quantity on hand", "qoh", "qty on hand"],
  aten: ["aten", "aten number", "aten no", "aten no.", "sku", "code", "item code", "item no", "item number"],
  costPrice: ["cost price", "cost", "unit cost", "buying price", "purchase price"],
  sellingPrice: ["selling price", "price", "sale price", "retail price"],
  description: ["description", "category hint"],
  unit: ["unit", "u/m", "um", "uom", "unit of measure"],
  genericName: ["generic name", "generic"],
  strength: ["strength"],
  dosageForm: ["dosage form", "form"],
  category: ["category"],
  manufacturer: ["manufacturer", "brand"],
} as const;

export type CatalogueField = keyof typeof CATALOGUE_FIELD_ALIASES;
export type HeaderMapping = Partial<Record<CatalogueField, string>>;

export function normalizeHeader(h: string) {
  return h.trim().toLowerCase().replace(/\s+/g, " ");
}

export function suggestHeaderMapping(headers: string[]): HeaderMapping {
  const mapping: HeaderMapping = {};
  const used = new Set<string>();
  for (const [field, aliases] of Object.entries(CATALOGUE_FIELD_ALIASES) as Array<[CatalogueField, readonly string[]]>) {
    const hit = headers.find((h) => aliases.includes(normalizeHeader(h)) && !used.has(h));
    if (hit) {
      mapping[field] = hit;
      used.add(hit);
    }
  }
  return mapping;
}

export function resolveHeaderMapping(headers: string[], client?: HeaderMapping | null): HeaderMapping {
  const suggested = suggestHeaderMapping(headers);
  if (!client) return suggested;
  const headerSet = new Set(headers);
  const resolved: HeaderMapping = { ...suggested };
  for (const [field, header] of Object.entries(client) as Array<[CatalogueField, string | undefined]>) {
    if (!header || !headerSet.has(header)) continue;
    const aliases = CATALOGUE_FIELD_ALIASES[field] as readonly string[] | undefined;
    if (!aliases) continue;
    const n = normalizeHeader(header);
    if (!aliases.includes(n)) continue;
    if (field === "sellingPrice" && (CATALOGUE_FIELD_ALIASES.costPrice as readonly string[]).includes(n)) continue;
    resolved[field] = header;
  }
  return resolved;
}
