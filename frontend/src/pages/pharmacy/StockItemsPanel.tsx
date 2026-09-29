import { FormEvent, useState } from "react";
import { patch, post } from "../../api/client";
import { Button, Field, Table, inputClass } from "../../components/ui";

export function StockItemsPanel({
  meds,
  onSaved,
  onError,
  onOk,
}: {
  meds: any[];
  onSaved: () => Promise<void>;
  onError: (m: string) => void;
  onOk: (m: string) => void;
}) {
  const [form, setForm] = useState({
    name: "",
    genericName: "",
    strength: "",
    dosageForm: "Tablet",
    unit: "tab",
    sku: "",
    sellingPrice: "",
    costPrice: "",
    reorderLevel: "10",
  });
  const [editing, setEditing] = useState<string | null>(null);
  const [q, setQ] = useState("");

  async function save(e?: FormEvent, existing?: any) {
    e?.preventDefault();
    const body = existing
      ? {
          name: existing.name,
          genericName: existing.genericName,
          strength: existing.strength,
          dosageForm: existing.dosageForm,
          unit: existing.unit,
          sku: existing.sku,
          sellingPrice: Number(existing.sellingPrice),
          costPrice: Number(existing.costPrice),
          reorderLevel: Number(existing.reorderLevel),
          active: existing.active,
        }
      : {
          ...form,
          sellingPrice: Number(form.sellingPrice),
          costPrice: Number(form.costPrice || 0),
          reorderLevel: Number(form.reorderLevel || 10),
          sku: form.sku.toUpperCase(),
        };
    if (!body.name || !body.sku || Number.isNaN(body.sellingPrice)) {
      onError("Name, SKU, and selling price are required.");
      return;
    }
    try {
      if (existing?.id) await patch(`/pharmacy/medicines/${existing.id}`, body);
      else await post("/pharmacy/medicines", body);
      onOk(existing?.id ? "Stock item updated." : "Stock item added at 0 on hand. Receive or import quantity next.");
      setForm({ name: "", genericName: "", strength: "", dosageForm: "Tablet", unit: "tab", sku: "", sellingPrice: "", costPrice: "", reorderLevel: "10" });
      setEditing(null);
      await onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Unable to save stock item.");
    }
  }

  const rows = meds.filter((m) => {
    const n = q.trim().toLowerCase();
    if (!n) return true;
    return [m.name, m.genericName, m.sku].filter(Boolean).some((p: string) => p.toLowerCase().includes(n));
  });

  return (
    <div className="space-y-4">
      <form onSubmit={(e) => void save(e)} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold">Add a stock item</h2>
        <div className="grid gap-2 md:grid-cols-4">
          <Field label="Name"><input className={inputClass} value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} required /></Field>
          <Field label="Generic"><input className={inputClass} value={form.genericName} onChange={(e) => setForm((s) => ({ ...s, genericName: e.target.value }))} /></Field>
          <Field label="Strength"><input className={inputClass} value={form.strength} onChange={(e) => setForm((s) => ({ ...s, strength: e.target.value }))} /></Field>
          <Field label="SKU"><input className={inputClass} value={form.sku} onChange={(e) => setForm((s) => ({ ...s, sku: e.target.value }))} required /></Field>
          <Field label="Form"><input className={inputClass} value={form.dosageForm} onChange={(e) => setForm((s) => ({ ...s, dosageForm: e.target.value }))} /></Field>
          <Field label="Unit"><input className={inputClass} value={form.unit} onChange={(e) => setForm((s) => ({ ...s, unit: e.target.value }))} /></Field>
          <Field label="Selling price"><input className={inputClass} value={form.sellingPrice} onChange={(e) => setForm((s) => ({ ...s, sellingPrice: e.target.value }))} required /></Field>
          <Field label="Cost price"><input className={inputClass} value={form.costPrice} onChange={(e) => setForm((s) => ({ ...s, costPrice: e.target.value }))} /></Field>
        </div>
        <Button type="submit">Add item</Button>
      </form>
      <input className={`${inputClass} max-w-sm`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter items…" />
      <Table headers={["Item", "SKU", "On hand", "Sell", "Cost", ""]}>
        {rows.map((m) => (
          <tr key={m.id}>
            {editing === m.id ? (
              <>
                <td className="px-3 py-2"><input className={inputClass} defaultValue={m.name} onChange={(e) => { m.name = e.target.value; }} /></td>
                <td className="px-3 py-2"><input className={inputClass} defaultValue={m.sku} onChange={(e) => { m.sku = e.target.value; }} /></td>
                <td className="px-3 py-2">{m.quantityOnHand}</td>
                <td className="px-3 py-2"><input className={inputClass} defaultValue={m.sellingPrice} onChange={(e) => { m.sellingPrice = e.target.value; }} /></td>
                <td className="px-3 py-2"><input className={inputClass} defaultValue={m.costPrice} onChange={(e) => { m.costPrice = e.target.value; }} /></td>
                <td className="px-3 py-2"><Button onClick={() => void save(undefined, m)}>Save</Button></td>
              </>
            ) : (
              <>
                <td className="px-3 py-2">{m.name} {m.strength}<div className="text-xs text-slate-500">{m.genericName}</div></td>
                <td className="px-3 py-2">{m.sku}</td>
                <td className="px-3 py-2">{m.quantityOnHand}</td>
                <td className="px-3 py-2">{m.sellingPrice}</td>
                <td className="px-3 py-2">{m.costPrice}</td>
                <td className="px-3 py-2"><Button variant="secondary" onClick={() => setEditing(m.id)}>Edit</Button></td>
              </>
            )}
          </tr>
        ))}
      </Table>
    </div>
  );
}
