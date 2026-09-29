import { FormEvent, useEffect, useState } from "react";
import { get, post } from "../../api/client";
import { Button, Empty, Field, StatusBadge, Table, inputClass } from "../../components/ui";
import { MedicineSelect } from "../../components/MedicinePicker";

export function PurchaseOrderPanel({
  meds,
  onError,
  onOk,
  onStockChanged,
}: {
  meds: any[];
  onError: (m: string) => void;
  onOk: (m: string) => void;
  onStockChanged: () => Promise<void>;
}) {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [supplierForm, setSupplierForm] = useState({ name: "", phone: "", location: "" });
  const [lpo, setLpo] = useState({ supplierId: "", notes: "", expectedDate: "" });
  const [lines, setLines] = useState([{ medicineId: "", quantityOrdered: "10", unitCost: "" }]);
  const [receive, setReceive] = useState<Record<string, { qty: string; rejected: string; batch: string; expiry: string }>>({});
  const [deliveryNote, setDeliveryNote] = useState("");

  async function load() {
    try {
      setSuppliers(await get("/procurement/suppliers"));
      setOrders(await get("/procurement/purchase-orders"));
    } catch (e) {
      onError(e instanceof Error ? e.message : "Unable to load purchase orders.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function addSupplier(e: FormEvent) {
    e.preventDefault();
    try {
      const created = await post<any>("/procurement/suppliers", supplierForm);
      setSupplierForm({ name: "", phone: "", location: "" });
      onOk(`Supplier ${created.name} saved.`);
      await load();
      setLpo((s) => ({ ...s, supplierId: created.id }));
    } catch (err) {
      onError(err instanceof Error ? err.message : "Unable to save supplier.");
    }
  }

  async function createLpo(e: FormEvent) {
    e.preventDefault();
    const poLines = lines
      .filter((l) => l.medicineId)
      .map((l) => ({ medicineId: l.medicineId, quantityOrdered: Number(l.quantityOrdered), unitCost: Number(l.unitCost || 0) }));
    if (!lpo.supplierId || !poLines.length) {
      onError("Choose a supplier and at least one stock item.");
      return;
    }
    try {
      const created = await post<any>("/procurement/purchase-orders", { ...lpo, expectedDate: lpo.expectedDate || null, lines: poLines });
      onOk(`LPO ${created.lpoNumber} issued. Receive against it when the goods arrive.`);
      setLines([{ medicineId: "", quantityOrdered: "10", unitCost: "" }]);
      await load();
      setSelected(created);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Unable to create the LPO.");
    }
  }

  async function openPo(id: string) {
    try {
      const po = await get<any>(`/procurement/purchase-orders/${id}`);
      setSelected(po);
      const next: typeof receive = {};
      for (const line of po.lines) {
        next[line.id] = { qty: String(line.outstanding || 0), rejected: "0", batch: "", expiry: "" };
      }
      setReceive(next);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Unable to open that LPO.");
    }
  }

  async function receiveGoods(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    try {
      const updated = await post<any>(`/procurement/purchase-orders/${selected.id}/receive`, {
        deliveryNote: deliveryNote || null,
        lines: selected.lines.map((line: any) => ({
          purchaseOrderLineId: line.id,
          quantityReceived: Number(receive[line.id]?.qty || 0),
          quantityRejected: Number(receive[line.id]?.rejected || 0),
          batchNumber: receive[line.id]?.batch || null,
          expiryDate: receive[line.id]?.expiry || null,
        })),
      });
      onOk(`GRN posted against ${updated.lpoNumber}. Shelf quantities updated.`);
      setDeliveryNote("");
      await load();
      await onStockChanged();
      setSelected(updated);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Unable to receive this LPO.");
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={addSupplier} className="grid gap-2 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-4">
        <Field label="New supplier"><input className={inputClass} value={supplierForm.name} onChange={(e) => setSupplierForm((s) => ({ ...s, name: e.target.value }))} required /></Field>
        <Field label="Phone"><input className={inputClass} value={supplierForm.phone} onChange={(e) => setSupplierForm((s) => ({ ...s, phone: e.target.value }))} /></Field>
        <Field label="Location"><input className={inputClass} value={supplierForm.location} onChange={(e) => setSupplierForm((s) => ({ ...s, location: e.target.value }))} /></Field>
        <div className="self-end"><Button type="submit">Save supplier</Button></div>
      </form>

      <form onSubmit={(e) => void createLpo(e)} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold">Create local purchase order</h2>
        <p className="text-sm text-slate-500">Issue an LPO, then receive a GRN against it. Stock only increases when goods are received.</p>
        <div className="grid gap-2 md:grid-cols-3">
          <Field label="Supplier">
            <select className={inputClass} value={lpo.supplierId} onChange={(e) => setLpo((s) => ({ ...s, supplierId: e.target.value }))} required>
              <option value="">Select</option>
              {suppliers.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Expected"><input className={inputClass} type="date" value={lpo.expectedDate} onChange={(e) => setLpo((s) => ({ ...s, expectedDate: e.target.value }))} /></Field>
          <Field label="Notes"><input className={inputClass} value={lpo.notes} onChange={(e) => setLpo((s) => ({ ...s, notes: e.target.value }))} /></Field>
        </div>
        {lines.map((line, idx) => (
          <div key={idx} className="grid gap-2 md:grid-cols-[1fr_100px_120px_auto]">
            <Field label={idx === 0 ? "Item" : ""}>
              <MedicineSelect medicines={meds} value={line.medicineId} onChange={(id) => setLines((rows) => rows.map((r, i) => i === idx ? { ...r, medicineId: id } : r))} />
            </Field>
            <Field label={idx === 0 ? "Qty" : ""}>
              <input className={inputClass} value={line.quantityOrdered} onChange={(e) => setLines((rows) => rows.map((r, i) => i === idx ? { ...r, quantityOrdered: e.target.value } : r))} />
            </Field>
            <Field label={idx === 0 ? "Unit cost" : ""}>
              <input className={inputClass} value={line.unitCost} onChange={(e) => setLines((rows) => rows.map((r, i) => i === idx ? { ...r, unitCost: e.target.value } : r))} />
            </Field>
            <div className={idx === 0 ? "self-end" : ""}>
              {lines.length > 1 ? <Button variant="ghost" onClick={() => setLines((rows) => rows.filter((_, i) => i !== idx))}>Remove</Button> : null}
            </div>
          </div>
        ))}
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setLines((rows) => [...rows, { medicineId: "", quantityOrdered: "10", unitCost: "" }])}>Another item</Button>
          <Button type="submit">Issue LPO</Button>
        </div>
      </form>

      {orders.length === 0 ? <Empty title="No purchase orders yet." body="Create an LPO, then receive the delivery." /> : (
        <Table headers={["LPO", "Supplier", "Status", "Items", ""]}>
          {orders.map((o) => (
            <tr key={o.id} className="hover:bg-slate-50">
              <td className="px-3 py-2 font-medium">{o.lpoNumber}</td>
              <td className="px-3 py-2">{o.supplier?.name}</td>
              <td className="px-3 py-2"><StatusBadge status={o.status} /></td>
              <td className="px-3 py-2">{o.lines?.length}</td>
              <td className="px-3 py-2"><Button variant="secondary" onClick={() => void openPo(o.id)}>Open</Button></td>
            </tr>
          ))}
        </Table>
      )}

      {selected ? (
        <form onSubmit={(e) => void receiveGoods(e)} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold">Receive {selected.lpoNumber} · {selected.supplier?.name}</h2>
          <Field label="Delivery note / invoice">
            <input className={inputClass} value={deliveryNote} onChange={(e) => setDeliveryNote(e.target.value)} placeholder="DN or invoice number" />
          </Field>
          <Table headers={["Item", "Ordered", "Already in", "Receive now", "Reject", "Batch / expiry"]}>
            {selected.lines.map((line: any) => (
              <tr key={line.id}>
                <td className="px-3 py-2">{line.medicine?.name}</td>
                <td className="px-3 py-2">{line.quantityOrdered}</td>
                <td className="px-3 py-2">{line.quantityReceived}</td>
                <td className="px-3 py-2">
                  <input className={inputClass} value={receive[line.id]?.qty || "0"} onChange={(e) => setReceive((s) => ({ ...s, [line.id]: { ...(s[line.id] || { rejected: "0", batch: "", expiry: "" }), qty: e.target.value } }))} disabled={selected.status === "RECEIVED" || selected.status === "CANCELLED"} />
                </td>
                <td className="px-3 py-2">
                  <input className={inputClass} value={receive[line.id]?.rejected || "0"} onChange={(e) => setReceive((s) => ({ ...s, [line.id]: { ...(s[line.id] || { qty: "0", batch: "", expiry: "" }), rejected: e.target.value } }))} />
                </td>
                <td className="px-3 py-2">
                  <div className="grid gap-1">
                    <input className={inputClass} placeholder="Batch" value={receive[line.id]?.batch || ""} onChange={(e) => setReceive((s) => ({ ...s, [line.id]: { ...(s[line.id] || { qty: "0", rejected: "0", expiry: "" }), batch: e.target.value } }))} />
                    <input className={inputClass} type="date" value={receive[line.id]?.expiry || ""} onChange={(e) => setReceive((s) => ({ ...s, [line.id]: { ...(s[line.id] || { qty: "0", rejected: "0", batch: "" }), expiry: e.target.value } }))} />
                  </div>
                </td>
              </tr>
            ))}
          </Table>
          {selected.status === "ISSUED" || selected.status === "PARTIAL" ? <Button type="submit">Post GRN and update stock</Button> : <p className="text-sm text-slate-500">This LPO is {selected.status.toLowerCase()}.</p>}
        </form>
      ) : null}
    </div>
  );
}
