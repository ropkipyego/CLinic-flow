import { FormEvent, useEffect, useState } from "react";
import { get, patch, post } from "../../api/client";
import { Button, Empty, Field, StatusBadge, Table, inputClass } from "../../components/ui";
import { MedicineSelect } from "../../components/MedicinePicker";
import { useToast } from "../../components/ToastProvider";
import { useAuth } from "../../auth/AuthContext";
import { isClinicAdmin } from "../../lib/roles";
import { LpoDocument } from "./LpoDocument";

const emptyLine = () => ({ medicineId: "", quantityOrdered: "10", unitCost: "" });

export function PurchaseOrderPanel({
  meds,
  onStockChanged,
}: {
  meds: any[];
  onError?: (m: string) => void;
  onOk?: (m: string) => void;
  onStockChanged: () => Promise<void>;
}) {
  const toast = useToast();
  const { user } = useAuth();
  const canApprove = isClinicAdmin(user?.role);
  const [tenant, setTenant] = useState<any>(null);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [filters, setFilters] = useState({ q: "", status: "", supplierId: "", from: "", to: "" });
  const [supplierForm, setSupplierForm] = useState({ name: "", phone: "", location: "", contactName: "", address: "", taxPin: "" });
  const [lpo, setLpo] = useState({
    supplierId: "",
    notes: "",
    expectedDate: "",
    orderDate: new Date().toISOString().slice(0, 10),
    deliveryLocation: "",
    paymentTerms: "",
    quotationNumber: "",
    deliveryInstructions: "",
    taxPercent: "0",
    deliveryCharge: "0",
  });
  const [lines, setLines] = useState([emptyLine()]);
  const [receive, setReceive] = useState<Record<string, { qty: string; rejected: string; batch: string; expiry: string }>>({});
  const [deliveryNote, setDeliveryNote] = useState("");
  const [print, setPrint] = useState(false);

  async function load(nextFilters = filters) {
    try {
      setTenant(await get("/tenants/current"));
      setSuppliers(await get("/procurement/suppliers"));
      const qs = new URLSearchParams();
      if (nextFilters.q) qs.set("q", nextFilters.q);
      if (nextFilters.status) qs.set("status", nextFilters.status);
      if (nextFilters.supplierId) qs.set("supplierId", nextFilters.supplierId);
      if (nextFilters.from) qs.set("from", nextFilters.from);
      if (nextFilters.to) qs.set("to", nextFilters.to);
      setOrders(await get(`/procurement/purchase-orders${qs.toString() ? `?${qs}` : ""}`));
    } catch (e) {
      toast.push(e instanceof Error ? e.message : "Unable to load purchase orders.", "error");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function payload() {
    return {
      ...lpo,
      expectedDate: lpo.expectedDate || null,
      taxPercent: Number(lpo.taxPercent || 0),
      deliveryCharge: Number(lpo.deliveryCharge || 0),
      lines: lines.filter((l) => l.medicineId).map((l) => ({
        medicineId: l.medicineId,
        quantityOrdered: Number(l.quantityOrdered),
        unitCost: Number(l.unitCost || 0),
      })),
    };
  }

  async function addSupplier(e: FormEvent) {
    e.preventDefault();
    try {
      const created = await post<any>("/procurement/suppliers", supplierForm);
      setSupplierForm({ name: "", phone: "", location: "", contactName: "", address: "", taxPin: "" });
      toast.push(`Supplier ${created.name} saved.`, "success");
      await load();
      setLpo((s) => ({ ...s, supplierId: created.id }));
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Unable to save supplier.", "error");
    }
  }

  async function saveDraft(e: FormEvent) {
    e.preventDefault();
    const body = payload();
    if (!body.supplierId || !body.lines.length) {
      toast.push("Choose a supplier and at least one stock item.", "warning");
      return;
    }
    try {
      const created = selected?.status === "DRAFT"
        ? await patch<any>(`/procurement/purchase-orders/${selected.id}`, body)
        : await post<any>("/procurement/purchase-orders", body);
      toast.push(`LPO ${created.lpoNumber} saved as draft. Stock is unchanged.`, "success");
      setLines([emptyLine()]);
      await load();
      setSelected(created);
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Unable to save the LPO.", "error");
    }
  }

  async function act(path: string, okMsg: string) {
    if (!selected) return;
    try {
      const updated = await post<any>(path, {});
      toast.push(okMsg.replace("{n}", updated.lpoNumber), "success");
      await load();
      setSelected(updated);
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Unable to update that LPO.", "error");
    }
  }

  async function openPo(id: string) {
    try {
      const po = await get<any>(`/procurement/purchase-orders/${id}`);
      setSelected(po);
      setPrint(false);
      const next: typeof receive = {};
      for (const line of po.lines) {
        next[line.id] = { qty: String(line.outstanding || 0), rejected: "0", batch: "", expiry: "" };
      }
      setReceive(next);
      if (po.status === "DRAFT") {
        setLpo({
          supplierId: po.supplierId,
          notes: po.notes || "",
          expectedDate: po.expectedDate || "",
          orderDate: po.orderDate || "",
          deliveryLocation: po.deliveryLocation || "",
          paymentTerms: po.paymentTerms || "",
          quotationNumber: po.quotationNumber || "",
          deliveryInstructions: po.deliveryInstructions || "",
          taxPercent: String(po.taxPercent ?? 0),
          deliveryCharge: String(po.deliveryCharge ?? 0),
        });
        setLines(po.lines.map((l: any) => ({ medicineId: l.medicineId, quantityOrdered: String(l.quantityOrdered), unitCost: String(l.unitCost) })));
      }
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Unable to open that LPO.", "error");
    }
  }

  async function receiveGoods(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    try {
      const updated = await post<any>(`/procurement/purchase-orders/${selected.id}/receive`, {
        deliveryNote: deliveryNote || null,
        clientRequestId: crypto.randomUUID(),
        lines: selected.lines.map((line: any) => ({
          purchaseOrderLineId: line.id,
          quantityReceived: Number(receive[line.id]?.qty || 0),
          quantityRejected: Number(receive[line.id]?.rejected || 0),
          batchNumber: receive[line.id]?.batch || null,
          expiryDate: receive[line.id]?.expiry || null,
        })),
      });
      toast.push(`GRN posted against ${updated.lpoNumber}. Received quantities updated the shelf; outstanding remains ${updated.lines.map((l: any) => l.outstanding).join("/")}.`, "success");
      setDeliveryNote("");
      await load();
      await onStockChanged();
      setSelected(updated);
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Unable to receive this LPO.", "error");
    }
  }

  async function printLpo() {
    if (!selected) return;
    if ((selected.reprintCount || 0) > 0 || print) {
      await post(`/procurement/purchase-orders/${selected.id}/reprint`, {});
    }
    setPrint(true);
    window.setTimeout(() => window.print(), 50);
  }

  const canReceive = selected && ["APPROVED", "ISSUED", "PARTIAL"].includes(selected.status);

  return (
    <div className="space-y-4">
      <form onSubmit={addSupplier} className="grid gap-2 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-3">
        <Field label="Supplier name"><input className={inputClass} value={supplierForm.name} onChange={(e) => setSupplierForm((s) => ({ ...s, name: e.target.value }))} required /></Field>
        <Field label="Contact"><input className={inputClass} value={supplierForm.contactName} onChange={(e) => setSupplierForm((s) => ({ ...s, contactName: e.target.value }))} /></Field>
        <Field label="Phone"><input className={inputClass} value={supplierForm.phone} onChange={(e) => setSupplierForm((s) => ({ ...s, phone: e.target.value }))} /></Field>
        <Field label="Address"><input className={inputClass} value={supplierForm.address} onChange={(e) => setSupplierForm((s) => ({ ...s, address: e.target.value }))} /></Field>
        <Field label="Location"><input className={inputClass} value={supplierForm.location} onChange={(e) => setSupplierForm((s) => ({ ...s, location: e.target.value }))} /></Field>
        <Field label="Tax PIN"><input className={inputClass} value={supplierForm.taxPin} onChange={(e) => setSupplierForm((s) => ({ ...s, taxPin: e.target.value }))} /></Field>
        <div className="self-end"><Button type="submit">Save supplier</Button></div>
      </form>

      <form onSubmit={(e) => void saveDraft(e)} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold">Local purchase order</h2>
        <p className="text-sm text-slate-500">Save a draft, submit for approval, then issue. Stock increases only when you receive against remaining ordered quantity.</p>
        <div className="grid gap-2 md:grid-cols-3">
          <Field label="Supplier">
            <select className={inputClass} value={lpo.supplierId} onChange={(e) => setLpo((s) => ({ ...s, supplierId: e.target.value }))} required>
              <option value="">Select</option>
              {suppliers.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Order date"><input className={inputClass} type="date" value={lpo.orderDate} onChange={(e) => setLpo((s) => ({ ...s, orderDate: e.target.value }))} /></Field>
          <Field label="Expected delivery"><input className={inputClass} type="date" value={lpo.expectedDate} onChange={(e) => setLpo((s) => ({ ...s, expectedDate: e.target.value }))} /></Field>
          <Field label="Delivery location"><input className={inputClass} value={lpo.deliveryLocation} onChange={(e) => setLpo((s) => ({ ...s, deliveryLocation: e.target.value }))} placeholder={tenant?.lpoDeliveryLocation || tenant?.address || ""} /></Field>
          <Field label="Payment terms"><input className={inputClass} value={lpo.paymentTerms} onChange={(e) => setLpo((s) => ({ ...s, paymentTerms: e.target.value }))} placeholder={tenant?.lpoPaymentTerms || ""} /></Field>
          <Field label="Quotation / reference"><input className={inputClass} value={lpo.quotationNumber} onChange={(e) => setLpo((s) => ({ ...s, quotationNumber: e.target.value }))} /></Field>
          <Field label="Tax %"><input className={inputClass} value={lpo.taxPercent} onChange={(e) => setLpo((s) => ({ ...s, taxPercent: e.target.value }))} /></Field>
          <Field label="Delivery charge"><input className={inputClass} value={lpo.deliveryCharge} onChange={(e) => setLpo((s) => ({ ...s, deliveryCharge: e.target.value }))} /></Field>
          <Field label="Instructions"><input className={inputClass} value={lpo.deliveryInstructions} onChange={(e) => setLpo((s) => ({ ...s, deliveryInstructions: e.target.value }))} /></Field>
        </div>
        {lines.map((line, idx) => (
          <div key={idx} className="grid gap-2 md:grid-cols-[1fr_100px_120px_auto]">
            <Field label={idx === 0 ? "Item (search catalogue)" : ""}>
              <MedicineSelect medicines={meds} value={line.medicineId} onChange={(id) => setLines((rows) => rows.map((r, i) => i === idx ? { ...r, medicineId: id, unitCost: r.unitCost || String(meds.find((m) => m.id === id)?.costPrice ?? "") } : r))} />
            </Field>
            <Field label={idx === 0 ? "Qty ordered" : ""}>
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
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setLines((rows) => [...rows, emptyLine()])}>Another item</Button>
          <Button type="submit">Save draft</Button>
        </div>
      </form>

      <div className="grid gap-2 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-5">
        <Field label="Search"><input className={inputClass} value={filters.q} onChange={(e) => setFilters((s) => ({ ...s, q: e.target.value }))} placeholder="LPO number or supplier" /></Field>
        <Field label="Status">
          <select className={inputClass} value={filters.status} onChange={(e) => setFilters((s) => ({ ...s, status: e.target.value }))}>
            <option value="">All</option>
            {["DRAFT", "PENDING_APPROVAL", "APPROVED", "ISSUED", "PARTIAL", "RECEIVED", "CANCELLED"].map((s) => <option key={s} value={s}>{s.replaceAll("_", " ")}</option>)}
          </select>
        </Field>
        <Field label="Supplier">
          <select className={inputClass} value={filters.supplierId} onChange={(e) => setFilters((s) => ({ ...s, supplierId: e.target.value }))}>
            <option value="">All</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="From"><input className={inputClass} type="date" value={filters.from} onChange={(e) => setFilters((s) => ({ ...s, from: e.target.value }))} /></Field>
        <div className="self-end"><Button variant="secondary" onClick={() => void load(filters)}>Filter</Button></div>
      </div>

      {orders.length === 0 ? <Empty title="No purchase orders yet." body="Create a draft LPO, then receive the delivery against remaining quantity." /> : (
        <Table headers={["LPO", "Supplier", "Date", "Status", "Ordered / received", "Total", ""]}>
          {orders.map((o) => (
            <tr key={o.id} className="hover:bg-slate-50">
              <td className="px-3 py-2 font-medium">{o.lpoNumber}{o.duplicated ? <span className="ml-1 text-xs text-amber-700">copy</span> : null}</td>
              <td className="px-3 py-2">{o.supplier?.name}</td>
              <td className="px-3 py-2">{o.orderDate}</td>
              <td className="px-3 py-2"><StatusBadge status={o.status} /></td>
              <td className="px-3 py-2">{o.lines?.reduce((s: number, l: any) => s + l.quantityOrdered, 0)} / {o.lines?.reduce((s: number, l: any) => s + l.quantityReceived, 0)}</td>
              <td className="px-3 py-2">{o.totals?.grandTotal}</td>
              <td className="px-3 py-2"><Button variant="secondary" onClick={() => void openPo(o.id)}>Open</Button></td>
            </tr>
          ))}
        </Table>
      )}

      {selected ? (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap gap-2">
            {selected.status === "DRAFT" ? <Button onClick={() => void act(`/procurement/purchase-orders/${selected.id}/submit`, "LPO {n} submitted for approval.")}>Submit</Button> : null}
            {selected.status === "PENDING_APPROVAL" && canApprove ? <Button onClick={() => void act(`/procurement/purchase-orders/${selected.id}/approve`, "LPO {n} approved. Stock is still unchanged.")}>Approve</Button> : null}
            {selected.status === "APPROVED" ? <Button onClick={() => void act(`/procurement/purchase-orders/${selected.id}/issue`, "LPO {n} issued / sent.")}>Mark sent</Button> : null}
            <Button variant="secondary" onClick={() => void act(`/procurement/purchase-orders/${selected.id}/duplicate`, "Draft copy of {n} created.")}>Duplicate as draft</Button>
            <Button variant="secondary" onClick={() => void printLpo()}>Print</Button>
            {selected.status !== "RECEIVED" && selected.status !== "CANCELLED" ? <Button variant="ghost" onClick={() => void act(`/procurement/purchase-orders/${selected.id}/cancel`, "LPO {n} cancelled.")}>Cancel</Button> : null}
          </div>

          {canReceive ? (
            <form onSubmit={(e) => void receiveGoods(e)} className="space-y-3">
              <h2 className="text-sm font-semibold">Receive against {selected.lpoNumber}</h2>
              <p className="text-sm text-slate-500">Like QuickBooks bill vs PO: enter the quantity accepted on this delivery. You cannot receive more than outstanding. Rejected units do not increase stock.</p>
              <Field label="Delivery note / invoice">
                <input className={inputClass} value={deliveryNote} onChange={(e) => setDeliveryNote(e.target.value)} placeholder="DN or invoice number" />
              </Field>
              <Table headers={["Item", "ATEN", "Ordered", "Already received", "Outstanding", "Receive now", "Reject", "Batch / expiry"]}>
                {selected.lines.map((line: any) => (
                  <tr key={line.id}>
                    <td className="px-3 py-2">{line.medicine?.name}</td>
                    <td className="px-3 py-2">{line.medicine?.sku}</td>
                    <td className="px-3 py-2">{line.quantityOrdered}</td>
                    <td className="px-3 py-2">{line.quantityReceived}</td>
                    <td className="px-3 py-2 font-medium">{line.outstanding}</td>
                    <td className="px-3 py-2">
                      <input className={inputClass} value={receive[line.id]?.qty || "0"} onChange={(e) => setReceive((s) => ({ ...s, [line.id]: { ...(s[line.id] || { rejected: "0", batch: "", expiry: "" }), qty: e.target.value } }))} />
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
              <Button type="submit">Post GRN for this delivery</Button>
            </form>
          ) : <p className="text-sm text-slate-500">Receive is available after the LPO is approved or issued.</p>}

          <div className="hidden print:block">
            <LpoDocument tenant={tenant} po={selected} reprint={print} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
