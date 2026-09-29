import { FormEvent, useState } from "react";
import { post } from "../../api/client";
import { Button, Field, inputClass } from "../../components/ui";

function parseCsv(text: string) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cols = line.split(",").map((c) => c.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = cols[i] || ""; });
    return {
      sku: row.sku || row.code,
      name: row.name,
      genericName: row.genericname || row.generic || null,
      strength: row.strength || null,
      dosageForm: row.dosageform || row.form || null,
      unit: row.unit || "unit",
      sellingPrice: Number(row.sellingprice || row.price || 0),
      costPrice: Number(row.costprice || row.cost || 0),
      reorderLevel: Number(row.reorderlevel || row.reorder || 10),
      quantity: row.quantity || row.qty ? Number(row.quantity || row.qty) : undefined,
    };
  }).filter((r) => r.sku && r.name);
}

const TEMPLATE = "sku,name,genericName,strength,dosageForm,unit,sellingPrice,costPrice,reorderLevel,quantity\nPARA500,Paracetamol,Paracetamol,500mg,Tablet,tab,10,4,20,100\n";

export function StockImportPanel({
  onSaved,
  onError,
  onOk,
}: {
  onSaved: () => Promise<void>;
  onError: (m: string) => void;
  onOk: (m: string) => void;
}) {
  const [text, setText] = useState(TEMPLATE);
  const [receiveOpening, setReceiveOpening] = useState(true);

  function downloadTemplate() {
    const blob = new Blob([TEMPLATE], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "clinicflow-stock-import.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onFile(file: File) {
    setText(await file.text());
  }

  async function importRows(e: FormEvent) {
    e.preventDefault();
    const rows = parseCsv(text);
    if (!rows.length) {
      onError("No valid rows. Need a header and sku + name on each line.");
      return;
    }
    try {
      const result = await post<{ created: number; updated: number; received: number; total: number }>("/pharmacy/medicines/import", {
        rows,
        receiveOpening,
      });
      onOk(`Imported ${result.total} rows · ${result.created} new · ${result.updated} updated · ${result.received} received onto the shelf.`);
      await onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Unable to import stock.");
    }
  }

  return (
    <form onSubmit={(e) => void importRows(e)} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold">Import stock items</h2>
      <p className="text-sm text-slate-500">
        CSV columns: sku, name, genericName, strength, dosageForm, unit, sellingPrice, costPrice, reorderLevel, quantity.
        Matching SKUs update the item. Quantity is received as opening stock only if you tick the box.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={downloadTemplate}>Download template</Button>
        <label className="inline-flex cursor-pointer items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
          Upload CSV
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])} />
        </label>
      </div>
      <Field label="CSV">
        <textarea className={`${inputClass} min-h-[180px] font-mono text-xs`} value={text} onChange={(e) => setText(e.target.value)} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={receiveOpening} onChange={(e) => setReceiveOpening(e.target.checked)} />
        Receive quantity column as opening stock
      </label>
      <Button type="submit">Import</Button>
    </form>
  );
}
