import { FormEvent, useEffect, useMemo, useState } from "react";
import { get, post } from "../../api/client";
import { Alert, Button, Empty, Field, PageHeader, StatusBadge, Table, inputClass } from "../../components/ui";
import { Icons } from "../../components/icons";
import { useAuth } from "../../auth/AuthContext";
import { useUiState } from "../../lib/uiState";
import { emptyWalkInClient, WalkInClientFields, walkInPayload } from "../../components/WalkInClientFields";
import { MedicineSelect } from "../../components/MedicinePicker";
import { ApiRequestError } from "../../api/client";
import { isClinicAdmin } from "../../lib/roles";
import { StockItemsPanel } from "./StockItemsPanel";
import { StockImportPanel } from "./StockImportPanel";
import { PurchaseOrderPanel } from "./PurchaseOrderPanel";
import { StockTakePanel } from "./StockTakePanel";

export function PharmacyPage() {
  const { user } = useAuth();
  const [tab, setTab] = useUiState<"queue" | "otc" | "stock" | "items" | "import" | "lpo" | "take">("pharmacy.tab", "stock");
  const [queue, setQueue] = useState<any[]>([]);
  const [meds, setMeds] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [selected, setSelected] = useState<any>(null);
  const [client, setClient] = useState(emptyWalkInClient());
  const [otcItems, setOtcItems] = useState<{ medicineId: string; quantity: string }[]>([{ medicineId: "", quantity: "1" }]);
  const [lastOtc, setLastOtc] = useState<any>(null);
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
      setQueue(await get("/pharmacy/queue"));
      setMeds(await get("/pharmacy/medicines"));
      setMovements(await get("/inventory/movements"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load pharmacy data.");
    }
  }

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 30000);
    return () => window.clearInterval(id);
  }, []);

  async function dispense(rx: any) {
    try {
      await post(`/pharmacy/prescriptions/${rx.id}/dispense`, {
        items: rx.items
          .filter((i: any) => i.quantity - i.dispensedQty > 0)
          .map((i: any) => ({ prescriptionItemId: i.id, quantity: i.quantity - i.dispensedQty })),
      });
      setSelected(null);
      setOk("Medicine dispensed. Stock and the pharmacy charge were updated. Cashier can collect.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to dispense. Check stock and try again.");
    }
  }

  async function sellOtc(e: FormEvent) {
    e.preventDefault();
    const items = otcItems
      .filter((i) => i.medicineId)
      .map((i) => ({ medicineId: i.medicineId, quantity: Number(i.quantity || 1) }));
    if (!items.length) {
      setError("Add at least one medicine.");
      return;
    }
    try {
      const result = await post<any>("/pharmacy/otc", { client: walkInPayload(client), items });
      setLastOtc(result);
      setOk(`OTC sale ${result.visitNumber} · ${result.total}. Send the customer to cashier.`);
      setClient(emptyWalkInClient());
      setOtcItems([{ medicineId: "", quantity: "1" }]);
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Unable to complete the OTC sale.");
    }
  }

  async function adjust(e: FormEvent) {
    e.preventDefault();
    const qty = Number(move.quantity);
    if (!move.medicineId) {
      setError("Choose a medicine from the clinic list.");
      return;
    }
    if (!Number.isInteger(qty) || qty < 1) {
      setError("Quantity must be a whole number of at least 1.");
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
      setOk(direction === "OUT" ? `${name}: stock reduced by ${qty}.` : `${name}: stock increased by ${qty}.`);
      setMove((s) => ({ ...s, quantity: "10", notes: "" }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to record stock movement.");
    }
  }

  async function applyCatalog() {
    try {
      const result = await post<{ created: number; updated: number; total: number }>("/pharmacy/catalog/apply", {});
      setOk(`Clinic drug list applied: ${result.total} items (${result.created} new, ${result.updated} updated). Receive stock next.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to apply the clinic drug list.");
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

  return (
    <div className="space-y-4">
      <PageHeader
        title="Pharmacy"
        subtitle="Items, import, LPO → GRN receive, stock take, dispense, or OTC."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant={tab === "stock" ? "primary" : "secondary"} onClick={() => setTab("stock")}>Receive / adjust</Button>
            <Button variant={tab === "items" ? "primary" : "secondary"} onClick={() => setTab("items")}>Items</Button>
            <Button variant={tab === "import" ? "primary" : "secondary"} onClick={() => setTab("import")}>Import</Button>
            <Button variant={tab === "lpo" ? "primary" : "secondary"} onClick={() => setTab("lpo")}>LPO / receive</Button>
            <Button variant={tab === "take" ? "primary" : "secondary"} onClick={() => setTab("take")}>Stock take</Button>
            <Button variant={tab === "queue" ? "primary" : "secondary"} onClick={() => setTab("queue")}>Queue</Button>
            <Button variant={tab === "otc" ? "primary" : "secondary"} onClick={() => setTab("otc")}>
              <Icons.pill /> OTC sale
            </Button>
          </div>
        }
      />
      {error ? <Alert kind="error">{error}</Alert> : null}
      {ok ? <Alert kind="success">{ok}</Alert> : null}

      {tab === "otc" ? (
        <form onSubmit={sellOtc} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Icons.userPlus /> Over-the-counter — name and phone
          </h2>
          <p className="text-sm text-slate-500">No consultation. If the customer is under 18, record a parent or guardian. Stock must already be on the shelf.</p>
          <WalkInClientFields value={client} onChange={setClient} />
          <div className="space-y-2">
            {otcItems.map((item, idx) => (
              <div key={idx} className="grid gap-2 md:grid-cols-[1fr_120px_auto]">
                <Field label={idx === 0 ? "Medicine" : ""}>
                  <MedicineSelect medicines={meds} value={item.medicineId} inStockOnly onChange={(id) => setOtcItems((rows) => rows.map((r, i) => i === idx ? { ...r, medicineId: id } : r))} />
                </Field>
                <Field label={idx === 0 ? "Qty" : ""}>
                  <input className={inputClass} value={item.quantity} onChange={(e) => setOtcItems((rows) => rows.map((r, i) => i === idx ? { ...r, quantity: e.target.value } : r))} />
                </Field>
                <div className={idx === 0 ? "self-end" : ""}>
                  {otcItems.length > 1 ? (
                    <Button variant="ghost" onClick={() => setOtcItems((rows) => rows.filter((_, i) => i !== idx))}>Remove</Button>
                  ) : null}
                </div>
              </div>
            ))}
            <Button variant="secondary" onClick={() => setOtcItems((rows) => [...rows, { medicineId: "", quantity: "1" }])}>
              <Icons.plus /> Another medicine
            </Button>
          </div>
          <Button type="submit"><Icons.check /> Complete OTC sale</Button>
          {lastOtc ? <p className="text-sm text-slate-600">Last sale {lastOtc.visitNumber} · total {lastOtc.total} · send to cashier.</p> : null}
        </form>
      ) : null}

      {tab === "queue" ? (
        queue.length === 0 ? <Empty title="No prescriptions waiting for dispensing." /> : (
          <Table headers={["Patient", "Visit", "Medicines", "Status", ""]}>
            {queue.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className="px-3 py-2">{p.patient.firstName} {p.patient.lastName}</td>
                <td className="px-3 py-2">{p.encounter.visitNumber}</td>
                <td className="px-3 py-2">{p.items.map((i: any) => `${i.medicine.name} x${i.quantity}`).join(", ")}</td>
                <td className="px-3 py-2"><StatusBadge status={p.status} /></td>
                <td className="px-3 py-2"><Button variant="secondary" onClick={() => setSelected(p)}>Dispense</Button></td>
              </tr>
            ))}
          </Table>
        )
      ) : null}

      {tab === "items" ? (
        <StockItemsPanel meds={meds} onSaved={load} onError={setError} onOk={setOk} />
      ) : null}
      {tab === "import" ? (
        <StockImportPanel onSaved={load} onError={setError} onOk={setOk} />
      ) : null}
      {tab === "lpo" ? (
        <PurchaseOrderPanel meds={meds} onError={setError} onOk={setOk} onStockChanged={load} />
      ) : null}
      {tab === "take" ? (
        <StockTakePanel onError={setError} onOk={setOk} onStockChanged={load} />
      ) : null}

      {tab === "stock" ? (
        <>
          <form onSubmit={adjust} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-800">Receive or adjust stock</h2>
              {(isClinicAdmin(user?.role) || user?.role === "PHARMACY") ? (
                <Button variant="secondary" onClick={() => void applyCatalog()}>Apply clinic drug list</Button>
              ) : null}
            </div>
            <p className="text-sm text-slate-500">
              The list is the clinic stock sheet. New items start at 0. Receive purchases here before dispensing or OTC.
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
            <input className={`${inputClass} max-w-sm`} value={stockQuery} onChange={(e) => setStockQuery(e.target.value)} placeholder="Filter the clinic list…" />
            <select className={`${inputClass} max-w-[12rem]`} value={formFilter} onChange={(e) => setFormFilter(e.target.value)}>
              {forms.map((f) => <option key={f} value={f}>{f === "ALL" ? "All forms" : f}</option>)}
            </select>
            <span className="self-center text-xs text-slate-500">{visibleMeds.length} items · click a row to adjust</span>
          </div>
          {visibleMeds.length === 0 ? (
            <Empty title="No medicines on this list yet." body="Use Apply clinic drug list, then receive opening stock." />
          ) : (
            <Table headers={["Medicine", "Form", "SKU", "On hand", "Reorder", "Price"]}>
              {visibleMeds.map((m) => (
                <tr
                  key={m.id}
                  className={`cursor-pointer ${m.id === move.medicineId ? "bg-sky-50" : m.lowStock || m.quantityOnHand === 0 ? "bg-amber-50" : "hover:bg-slate-50"}`}
                  onClick={() => setMove((s) => ({ ...s, medicineId: m.id }))}
                >
                  <td className="px-3 py-2">
                    <div className="font-medium">{m.name} {m.strength}</div>
                    <div className="text-xs text-slate-500">{m.genericName}</div>
                  </td>
                  <td className="px-3 py-2">{m.dosageForm}</td>
                  <td className="px-3 py-2">{m.sku}</td>
                  <td className="px-3 py-2 font-medium">{m.quantityOnHand}</td>
                  <td className="px-3 py-2">{m.reorderLevel}</td>
                  <td className="px-3 py-2">{m.sellingPrice}</td>
                </tr>
              ))}
            </Table>
          )}
          <h3 className="pt-2 text-sm font-semibold text-slate-800">Recent movements</h3>
          {movements.length === 0 ? <Empty title="No stock movements yet." body="Receive opening balances so dispensing and OTC can run." /> : (
            <Table headers={["When", "Medicine", "Type", "Qty", "From → to", "By"]}>
              {movements.slice(0, 20).map((m) => (
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

      {selected ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="mb-2 font-medium">Dispense {selected.encounter.visitNumber}</p>
          {selected.items.map((i: any) => (
            <div key={i.id} className="text-sm">{i.medicine.name} — {i.quantity - i.dispensedQty} remaining (stock {i.medicine.quantityOnHand})</div>
          ))}
          <div className="mt-3"><Button onClick={() => void dispense(selected)}>Confirm dispense</Button></div>
        </div>
      ) : null}
    </div>
  );
}
