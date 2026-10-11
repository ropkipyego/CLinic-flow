import { FormEvent, useEffect, useMemo, useState } from "react";
import { get, post } from "../../api/client";
import { Alert, Button, Empty, Field, PageHeader, Table, inputClass } from "../../components/ui";
import { Icons } from "../../components/icons";
import { useUiState } from "../../lib/uiState";
import { MedicineSelect } from "../../components/MedicinePicker";
import { StockItemsPanel } from "../pharmacy/StockItemsPanel";
import { PurchaseOrderPanel } from "../pharmacy/PurchaseOrderPanel";
import { StockTakePanel } from "../pharmacy/StockTakePanel";
import { CatalogueImportPanel } from "./CatalogueImportPanel";
import { useToast } from "../../components/ToastProvider";

export function InventoryPage() {
  const toast = useToast();
  const [tab, setTab] = useUiState<"levels" | "items" | "take" | "lpo" | "csv" | "receive">("inventory.tab", "levels");
  const [meds, setMeds] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [stockQuery, setStockQuery] = useState("");
  const [formFilter, setFormFilter] = useState("ALL");
  const [move, setMove] = useState({
    medicineId: "",
    action: "IN",
    type: "PURCHASE",
    quantity: "10",
    notes: "",
  });

  async function load() {
    try {
      setMeds(await get("/pharmacy/medicines"));
      setMovements(await get("/inventory/movements"));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unable to load inventory.";
      setError(msg);
      toast.push(msg, "error");
    }
  }

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 30000);
    return () => window.clearInterval(id);
  }, []);

  async function adjust(e: FormEvent) {
    e.preventDefault();
    const qty = Number(move.quantity);
    if (!move.medicineId) {
      toast.push("Choose a medicine from the item master.", "warning");
      return;
    }
    if (!Number.isInteger(qty) || qty < 1) {
      toast.push("Quantity must be a whole number of at least 1.", "warning");
      return;
    }
    if (move.action === "OUT" && !move.notes.trim()) {
      toast.push("A reason is required when reducing stock.", "warning");
      return;
    }
    try {
      const direction = move.action === "OUT" ? "OUT" : "IN";
      const type = move.action === "OUT" ? "ADJUSTMENT" : move.type;
      await post("/inventory/movements", {
        medicineId: move.medicineId,
        type,
        direction,
        quantity: qty,
        notes: move.notes || (direction === "OUT" ? "Stock adjustment out" : "Stock received"),
      });
      const name = meds.find((m) => m.id === move.medicineId)?.name || "Item";
      const msg = direction === "OUT" ? `${name}: stock reduced by ${qty}.` : `${name}: stock increased by ${qty}.`;
      setOk(msg);
      toast.push(msg, "success");
      setMove((s) => ({ ...s, quantity: "10", notes: "" }));
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to record stock movement.";
      setError(msg);
      toast.push(msg, "error");
    }
  }

  const forms = useMemo(() => ["ALL", ...Array.from(new Set(meds.map((m) => m.dosageForm).filter(Boolean))).sort()], [meds]);
  const visibleMeds = useMemo(() => {
    const needle = stockQuery.trim().toLowerCase();
    return meds.filter((m) => {
      if (formFilter !== "ALL" && m.dosageForm !== formFilter) return false;
      if (!needle) return true;
      return [m.name, m.genericName, m.sku, m.strength].filter(Boolean).some((p: string) => p.toLowerCase().includes(needle));
    });
  }, [meds, stockQuery, formFilter]);
  const selectedMed = meds.find((m) => m.id === move.medicineId);
  const outOfStock = meds.filter((m) => m.quantityOnHand === 0).length;
  const low = meds.filter((m) => m.lowStock && m.quantityOnHand > 0).length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Stock & inventory"
        subtitle="Pharmacy dispensing stays on Pharmacy. Here: stock, catalogue, LPOs, and receiving against orders."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant={tab === "levels" ? "primary" : "secondary"} onClick={() => setTab("levels")}>Stock</Button>
            <Button variant={tab === "items" ? "primary" : "secondary"} onClick={() => setTab("items")}>Catalogue</Button>
            <Button variant={tab === "csv" ? "primary" : "secondary"} onClick={() => setTab("csv")}>CSV import</Button>
            <Button variant={tab === "take" ? "primary" : "secondary"} onClick={() => setTab("take")}>Stock take</Button>
            <Button variant={tab === "lpo" ? "primary" : "secondary"} onClick={() => setTab("lpo")}>LPOs</Button>
            <Button variant={tab === "receive" ? "primary" : "secondary"} onClick={() => setTab("receive")}>Goods receiving</Button>
          </div>
        }
      />
      <p className="text-sm text-slate-500">
        {meds.length} items · {outOfStock} at zero · {low} below reorder. Dispensing lives under Pharmacy.
      </p>
      {error ? <Alert kind="error">{error}</Alert> : null}
      {ok ? <Alert kind="success">{ok}</Alert> : null}

      {tab === "items" ? <StockItemsPanel meds={meds} onSaved={load} onError={setError} onOk={setOk} /> : null}
      {tab === "csv" ? <CatalogueImportPanel onSaved={load} /> : null}
      {tab === "lpo" || tab === "receive" ? <PurchaseOrderPanel meds={meds} onStockChanged={load} /> : null}
      {tab === "take" ? <StockTakePanel onStockChanged={load} /> : null}

      {tab === "levels" ? (
        <>
          <form onSubmit={adjust} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-800">Receive or adjust stock</h2>
            <p className="text-sm text-slate-500">
              Catalogue edits never change quantity. Receive purchases here. Zero on hand items stay on this list.
              {selectedMed ? ` Selected: ${selectedMed.name} · ${selectedMed.quantityOnHand} on hand.` : ""}
            </p>
            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-5">
              <Field label="Medicine">
                <MedicineSelect medicines={meds} value={move.medicineId} onChange={(id) => setMove((s) => ({ ...s, medicineId: id }))} required />
              </Field>
              <Field label="Action">
                <select className={inputClass} value={move.action} onChange={(e) => setMove((s) => ({ ...s, action: e.target.value, type: e.target.value === "OUT" ? "ADJUSTMENT" : "PURCHASE" }))}>
                  <option value="IN">Receive / add</option>
                  <option value="OUT">Reduce / adjust down</option>
                </select>
              </Field>
              {move.action === "IN" ? (
                <Field label="Reason">
                  <select className={inputClass} value={move.type} onChange={(e) => setMove((s) => ({ ...s, type: e.target.value }))}>
                    <option value="PURCHASE">Purchase received</option>
                    <option value="OPENING_BALANCE">Opening balance</option>
                    <option value="RETURN">Return to stock</option>
                    <option value="ADJUSTMENT">Adjustment in</option>
                  </select>
                </Field>
              ) : (
                <Field label="Reason">
                  <select className={inputClass} value="ADJUSTMENT" disabled>
                    <option>Adjustment out</option>
                  </select>
                </Field>
              )}
              <Field label="Quantity">
                <input className={inputClass} value={move.quantity} onChange={(e) => setMove((s) => ({ ...s, quantity: e.target.value }))} required inputMode="numeric" />
              </Field>
              <Field label={move.action === "OUT" ? "Why (required)" : "Notes"}>
                <input className={inputClass} value={move.notes} onChange={(e) => setMove((s) => ({ ...s, notes: e.target.value }))} placeholder={move.action === "OUT" ? "Damaged, expired, count correction…" : "Supplier or batch"} />
              </Field>
            </div>
            <Button type="submit"><Icons.check /> Save stock movement</Button>
          </form>

          <div className="flex flex-wrap gap-2">
            <input className={`${inputClass} max-w-sm`} value={stockQuery} onChange={(e) => setStockQuery(e.target.value)} placeholder="Search item master…" />
            <select className={`${inputClass} max-w-[12rem]`} value={formFilter} onChange={(e) => setFormFilter(e.target.value)}>
              {forms.map((f) => <option key={f} value={f}>{f === "ALL" ? "All forms" : f}</option>)}
            </select>
            <span className="self-center text-xs text-slate-500">{visibleMeds.length} shown</span>
          </div>
          {visibleMeds.length === 0 ? (
            <Empty title="No medicines in the item master yet." body="Add items at zero stock, or run an approved catalogue import after dry-run review." />
          ) : (
            <Table headers={["Medicine", "Form", "ATEN / SKU", "On hand", "Status", "Cost", "Selling"]}>
              {visibleMeds.map((m) => (
                <tr
                  key={m.id}
                  className={`cursor-pointer ${m.id === move.medicineId ? "bg-sky-50" : "hover:bg-slate-50"}`}
                  onClick={() => setMove((s) => ({ ...s, medicineId: m.id }))}
                >
                  <td className="px-3 py-2">
                    <div className="font-medium">{m.name} {m.strength}</div>
                    <div className="text-xs text-slate-500">{m.genericName}</div>
                  </td>
                  <td className="px-3 py-2">{m.dosageForm}</td>
                  <td className="px-3 py-2">{m.sku}</td>
                  <td className="px-3 py-2 font-medium">{m.quantityOnHand}</td>
                  <td className="px-3 py-2 text-xs">
                    {m.quantityOnHand === 0 ? "Zero stock" : m.lowStock ? "Low" : "In stock"}
                  </td>
                  <td className="px-3 py-2">{m.costPrice}</td>
                  <td className="px-3 py-2">{m.needsSellingPrice ? "Needs price" : m.sellingPrice}</td>
                </tr>
              ))}
            </Table>
          )}
          <h3 className="pt-2 text-sm font-semibold text-slate-800">Movement history</h3>
          {movements.length === 0 ? <Empty title="No stock movements yet." /> : (
            <Table headers={["When", "Medicine", "Type", "Qty", "From → to", "By"]}>
              {movements.slice(0, 40).map((m) => (
                <tr key={m.id}>
                  <td className="px-3 py-2">{new Date(m.createdAt).toLocaleString()}</td>
                  <td className="px-3 py-2">{m.medicine?.name}</td>
                  <td className="px-3 py-2">{m.type}</td>
                  <td className="px-3 py-2">{m.quantity}</td>
                  <td className="px-3 py-2">{m.previousQuantity} → {m.newQuantity}</td>
                  <td className="px-3 py-2">{m.user?.firstName} {m.user?.lastName}</td>
                </tr>
              ))}
            </Table>
          )}
        </>
      ) : null}
    </div>
  );
}
