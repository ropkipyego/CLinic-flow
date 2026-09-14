import { FormEvent, useEffect, useState } from "react";
import { get, post } from "../../api/client";
import { Alert, Button, Empty, Field, PageHeader, StatusBadge, Table, inputClass } from "../../components/ui";
import { Icons } from "../../components/icons";
import { useUiState } from "../../lib/uiState";
import { emptyWalkInClient, WalkInClientFields, walkInPayload } from "../../components/WalkInClientFields";
import { ApiRequestError } from "../../api/client";

export function PharmacyPage() {
  const [tab, setTab] = useUiState<"queue" | "otc" | "stock">("pharmacy.tab", "queue");
  const [queue, setQueue] = useState<any[]>([]);
  const [meds, setMeds] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [selected, setSelected] = useState<any>(null);
  const [client, setClient] = useState(emptyWalkInClient());
  const [otcItems, setOtcItems] = useState<{ medicineId: string; quantity: string }[]>([{ medicineId: "", quantity: "1" }]);
  const [lastOtc, setLastOtc] = useState<any>(null);
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
    try {
      const direction = move.action === "OUT" ? "OUT" : "IN";
      const type = move.action === "OUT" ? "ADJUSTMENT" : move.type;
      await post("/inventory/movements", {
        medicineId: move.medicineId,
        type,
        direction,
        quantity: Number(move.quantity),
        notes: move.notes || (direction === "OUT" ? "Stock adjustment out" : "Stock received"),
      });
      setOk(direction === "OUT" ? "Stock reduced and the movement was recorded." : "Stock increased and the movement was recorded.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to record stock movement.");
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Pharmacy"
        subtitle="Dispense doctor prescriptions, sell over-the-counter with name and phone, or adjust stock. Every change writes a movement."
        actions={
          <div className="flex gap-2">
            <Button variant={tab === "queue" ? "primary" : "secondary"} onClick={() => setTab("queue")}>Queue</Button>
            <Button variant={tab === "otc" ? "primary" : "secondary"} onClick={() => setTab("otc")}>
              <Icons.pill /> OTC sale
            </Button>
            <Button variant={tab === "stock" ? "primary" : "secondary"} onClick={() => setTab("stock")}>Stock</Button>
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
          <p className="text-sm text-slate-500">No consultation. If the customer is under 18, record a parent or guardian.</p>
          <WalkInClientFields value={client} onChange={setClient} />
          <div className="space-y-2">
            {otcItems.map((item, idx) => (
              <div key={idx} className="grid gap-2 md:grid-cols-[1fr_120px_auto]">
                <Field label={idx === 0 ? "Medicine" : ""}>
                  <select className={inputClass} value={item.medicineId} onChange={(e) => setOtcItems((rows) => rows.map((r, i) => i === idx ? { ...r, medicineId: e.target.value } : r))}>
                    <option value="">Select</option>
                    {meds.filter((m) => m.active !== false).map((m) => (
                      <option key={m.id} value={m.id}>{m.name} {m.strength} — {m.sellingPrice} ({m.quantityOnHand})</option>
                    ))}
                  </select>
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

      {tab === "stock" ? (
        <>
          <form onSubmit={adjust} className="grid gap-2 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-5">
            <Field label="Medicine">
              <select className={inputClass} value={move.medicineId} onChange={(e) => setMove((s) => ({ ...s, medicineId: e.target.value }))} required>
                <option value="">Select</option>
                {meds.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.quantityOnHand} on hand)</option>)}
              </select>
            </Field>
            <Field label="Action">
              <select className={inputClass} value={move.action} onChange={(e) => setMove((s) => ({ ...s, action: e.target.value, type: e.target.value === "OUT" ? "ADJUSTMENT" : "PURCHASE" }))}>
                <option value="IN">Add stock</option>
                <option value="OUT">Remove / adjust down</option>
              </select>
            </Field>
            {move.action === "IN" ? (
              <Field label="Reason type">
                <select className={inputClass} value={move.type} onChange={(e) => setMove((s) => ({ ...s, type: e.target.value }))}>
                  <option value="PURCHASE">Purchase</option>
                  <option value="RETURN">Return</option>
                  <option value="OPENING_BALANCE">Opening balance</option>
                  <option value="ADJUSTMENT">Adjustment in</option>
                </select>
              </Field>
            ) : (
              <Field label="Reason type">
                <select className={inputClass} value="ADJUSTMENT" disabled>
                  <option>Adjustment out</option>
                </select>
              </Field>
            )}
            <Field label="Quantity"><input className={inputClass} value={move.quantity} onChange={(e) => setMove((s) => ({ ...s, quantity: e.target.value }))} required /></Field>
            <Field label="Notes"><input className={inputClass} value={move.notes} onChange={(e) => setMove((s) => ({ ...s, notes: e.target.value }))} placeholder="Why this change?" /></Field>
            <div className="self-end md:col-span-5"><Button type="submit">Save stock movement</Button></div>
          </form>
          <Table headers={["Medicine", "SKU", "On hand", "Reorder", "Price"]}>
            {meds.map((m) => (
              <tr key={m.id} className={m.lowStock ? "bg-amber-50" : "hover:bg-slate-50"}>
                <td className="px-3 py-2">{m.name} {m.strength}</td>
                <td className="px-3 py-2">{m.sku}</td>
                <td className="px-3 py-2">{m.quantityOnHand}</td>
                <td className="px-3 py-2">{m.reorderLevel}</td>
                <td className="px-3 py-2">{m.sellingPrice}</td>
              </tr>
            ))}
          </Table>
          <h3 className="pt-2 text-sm font-semibold text-slate-800">Recent movements</h3>
          {movements.length === 0 ? <Empty title="No stock movements yet." /> : (
            <Table headers={["When", "Medicine", "Type", "Qty", "From → to", "By"]}>
              {movements.slice(0, 12).map((m) => (
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
