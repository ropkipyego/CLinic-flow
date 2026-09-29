import { useMemo, useState } from "react";
import { inputClass } from "./ui";

export type MedicineOption = {
  id: string;
  name: string;
  genericName?: string | null;
  strength?: string | null;
  dosageForm?: string | null;
  sku?: string;
  sellingPrice?: number;
  quantityOnHand?: number;
  active?: boolean;
  lowStock?: boolean;
};

export function MedicineSelect({
  medicines,
  value,
  onChange,
  required,
  inStockOnly,
}: {
  medicines: MedicineOption[];
  value: string;
  onChange: (id: string) => void;
  required?: boolean;
  inStockOnly?: boolean;
}) {
  const [q, setQ] = useState("");
  const options = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return medicines.filter((m) => {
      if (m.active === false) return false;
      if (inStockOnly && (m.quantityOnHand ?? 0) <= 0) return false;
      if (!needle) return true;
      return [m.name, m.genericName, m.sku, m.strength, m.dosageForm]
        .filter(Boolean)
        .some((part) => String(part).toLowerCase().includes(needle));
    });
  }, [medicines, q, inStockOnly]);

  return (
    <div className="space-y-1.5">
      <input
        className={inputClass}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search name, generic, or SKU"
      />
      <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)} required={required}>
        <option value="">{options.length ? "Select medicine" : "No match in the clinic list"}</option>
        {options.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
            {m.strength ? ` ${m.strength}` : ""}
            {m.dosageForm ? ` · ${m.dosageForm}` : ""} — {m.sellingPrice ?? ""} ({m.quantityOnHand ?? 0} on hand)
          </option>
        ))}
      </select>
    </div>
  );
}
