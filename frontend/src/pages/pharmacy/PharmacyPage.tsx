import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { get, post } from "../../api/client";
import { Alert, Button, Empty, Field, PageHeader, StatusBadge, Table, inputClass } from "../../components/ui";
import { Icons } from "../../components/icons";
import { useUiState } from "../../lib/uiState";
import { emptyWalkInClient, WalkInClientFields, walkInPayload } from "../../components/WalkInClientFields";
import { MedicineSelect } from "../../components/MedicinePicker";
import { ApiRequestError } from "../../api/client";

export function PharmacyPage() {
  const [tab, setTab] = useUiState<"queue" | "otc">("pharmacy.tab", "queue");
  const [queue, setQueue] = useState<any[]>([]);
  const [meds, setMeds] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [selected, setSelected] = useState<any>(null);
  const [client, setClient] = useState(emptyWalkInClient());
  const [otcItems, setOtcItems] = useState<{ medicineId: string; quantity: string }[]>([{ medicineId: "", quantity: "1" }]);
  const [lastOtc, setLastOtc] = useState<any>(null);

  async function load() {
    try {
      setQueue(await get("/pharmacy/queue"));
      setMeds(await get("/pharmacy/medicines?active=true"));
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

  return (
    <div className="space-y-4">
      <PageHeader
        title="Pharmacy"
        subtitle="Dispense prescriptions and record OTC sales. Catalogue and shelf quantities are under Stock."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant={tab === "queue" ? "primary" : "secondary"} onClick={() => setTab("queue")}>Dispensing queue</Button>
            <Button variant={tab === "otc" ? "primary" : "secondary"} onClick={() => setTab("otc")}>
              <Icons.pill /> OTC sale
            </Button>
            <Link to="/inventory" className="inline-flex items-center rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
              Open stock
            </Link>
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
