import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { get, post } from "../../api/client";
import { Alert, Button, Empty, Field, PageHeader, Stat, Table, inputClass } from "../../components/ui";
import { useAuth } from "../../auth/AuthContext";

export function CashierPage() {
  const { tenant } = useAuth();
  const [dash, setDash] = useState<any>(null);
  const [visits, setVisits] = useState<any[]>([]);
  const [bill, setBill] = useState<any>(null);
  const [services, setServices] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("CASH");
  const [reference, setReference] = useState("");
  const [receiptId, setReceiptId] = useState("");
  const [manual, setManual] = useState({ serviceId: "", description: "", unitPrice: "", quantity: "1" });

  async function load() {
    try {
      const [today, enc, catalog] = await Promise.all([
        get("/payments/today"),
        get("/encounters").catch(() => []),
        get("/services?active=true").catch(() => []),
      ]);
      setDash(today);
      setVisits(enc as any[]);
      setServices((catalog as any[]).filter((s) => s.category !== "LABORATORY"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load cashier dashboard.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function openBill(encounterId: string) {
    const data = await get(`/payments/encounters/${encounterId}`);
    setBill(data);
    setAmount(String((data as any).balance));
    setReceiptId("");
  }

  async function addCharge(e: FormEvent) {
    e.preventDefault();
    if (!bill) return;
    try {
      await post(`/charges/encounters/${bill.encounterId}`, {
        serviceId: manual.serviceId || null,
        description: manual.description || "Hospital charge",
        unitPrice: Number(manual.unitPrice || 0),
        quantity: Number(manual.quantity || 1),
      });
      setManual({ serviceId: "", description: "", unitPrice: "", quantity: "1" });
      await openBill(bill.encounterId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add that charge.");
    }
  }

  async function pay(e: FormEvent) {
    e.preventDefault();
    if (!bill) return;
    try {
      const result = await post<any>(`/payments/encounters/${bill.encounterId}`, {
        amount: Number(amount),
        method,
        reference: reference || null,
      });
      setReceiptId(result.receipt.id);
      await openBill(bill.encounterId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to record payment. The previous payment was not overwritten.");
    }
  }

  function pickService(id: string) {
    const service = services.find((s) => s.id === id);
    setManual((s) => ({
      ...s,
      serviceId: id,
      description: service?.name || s.description,
      unitPrice: service ? String(service.price) : s.unitPrice,
    }));
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Cashier" subtitle="Collect against charges from consultation, lab, pharmacy, or a charge you type here. Every item prints on the receipt." />
      {error ? <Alert kind="error">{error}</Alert> : null}
      {dash ? (
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Pending payments" value={dash.pending.length} />
          <Stat label="Completed payments" value={dash.completed.length} />
          <Stat label="Daily collection" value={`${tenant?.currency || "KES"} ${dash.dailyTotal}`} />
        </div>
      ) : null}

      <h2 className="text-sm font-semibold text-slate-800">Today's visits</h2>
      {visits.length === 0 && !dash?.pending?.length ? (
        <Empty title="No outstanding payments." body="Open a visit to add a manual hospital charge, then collect." />
      ) : (
        <Table headers={["Visit", "Patient", "Status", ""]}>
          {(dash?.pending?.length ? dash.pending : visits).map((p: any) => (
            <tr key={p.encounterId || p.id}>
              <td className="px-3 py-2">{p.visitNumber}</td>
              <td className="px-3 py-2">{p.patientName || p.patient?.name}</td>
              <td className="px-3 py-2">{p.balance !== undefined ? `Balance ${p.balance}` : p.status}</td>
              <td className="px-3 py-2">
                <Button variant="secondary" onClick={() => void openBill(p.encounterId || p.id)}>Open</Button>
              </td>
            </tr>
          ))}
        </Table>
      )}

      {bill ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-2 font-medium">{bill.patient.name} · {bill.visitNumber}</h2>
          <Table headers={["Item", "Qty", "Price", "Total", "Status"]}>
            {bill.charges.map((c: any) => (
              <tr key={c.id}>
                <td className="px-3 py-2">{c.description}</td>
                <td className="px-3 py-2">{c.quantity}</td>
                <td className="px-3 py-2">{c.unitPrice}</td>
                <td className="px-3 py-2">{c.total}</td>
                <td className="px-3 py-2">{c.status}</td>
              </tr>
            ))}
          </Table>

          <form onSubmit={addCharge} className="mt-4 grid gap-2 md:grid-cols-5">
            <Field label="Catalog item">
              <select className={inputClass} value={manual.serviceId} onChange={(e) => pickService(e.target.value)}>
                <option value="">Type a custom charge</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} — {s.price}</option>
                ))}
              </select>
            </Field>
            <Field label="Description">
              <input className={inputClass} value={manual.description} onChange={(e) => setManual((s) => ({ ...s, description: e.target.value, serviceId: "" }))} placeholder="e.g. Dressing" />
            </Field>
            <Field label="Unit price">
              <input className={inputClass} value={manual.unitPrice} onChange={(e) => setManual((s) => ({ ...s, unitPrice: e.target.value }))} />
            </Field>
            <Field label="Qty">
              <input className={inputClass} value={manual.quantity} onChange={(e) => setManual((s) => ({ ...s, quantity: e.target.value }))} />
            </Field>
            <div className="self-end"><Button type="submit">Add charge</Button></div>
          </form>

          <p className="mt-3 text-sm">Total {bill.total} · Paid {bill.amountPaid} · Balance {bill.balance}</p>
          {bill.balance > 0 ? (
            <form onSubmit={pay} className="mt-3 grid gap-2 md:grid-cols-4">
              <Field label="Amount"><input className={inputClass} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
              <Field label="Method">
                <select className={inputClass} value={method} onChange={(e) => setMethod(e.target.value)}>
                  <option>CASH</option>
                  <option>MPESA</option>
                  <option>CARD</option>
                  <option>INSURANCE</option>
                  <option>OTHER</option>
                </select>
              </Field>
              <Field label="Reference"><input className={inputClass} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="M-Pesa code if any" /></Field>
              <div className="self-end"><Button type="submit">Receive payment</Button></div>
            </form>
          ) : bill.charges.length ? <Alert kind="success">This visit is fully paid.</Alert> : <p className="mt-2 text-sm text-slate-500">Add a charge before collecting payment.</p>}
          {receiptId ? <Link className="mt-2 inline-block text-[var(--brand)]" to={`/cashier/receipts/${receiptId}`}>Open receipt</Link> : null}
        </div>
      ) : null}
    </div>
  );
}
