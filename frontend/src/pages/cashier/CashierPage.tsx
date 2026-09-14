import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { get, post } from "../../api/client";
import { Alert, Button, Empty, Field, PageHeader, Stat, StatusBadge, Table, inputClass } from "../../components/ui";
import { Icons } from "../../components/icons";
import { useAuth } from "../../auth/AuthContext";
import { formatMoney, VISIT_TYPE_LABEL } from "../../lib/labels";
import { useUiState } from "../../lib/uiState";
import { ApiRequestError } from "../../api/client";

type BillRow = {
  encounterId: string;
  visitNumber: string;
  visitType?: string;
  patientName: string;
  balance: number;
  total: number;
  amountPaid: number;
  status: string;
};

export function CashierPage() {
  const { tenant } = useAuth();
  const currency = tenant?.currency || "KES";
  const [dash, setDash] = useState<any>(null);
  const [visits, setVisits] = useState<any[]>([]);
  const [bill, setBill] = useState<any>(null);
  const [services, setServices] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("CASH");
  const [reference, setReference] = useState("");
  const [receiptId, setReceiptId] = useState("");
  const [manual, setManual] = useState({ serviceId: "", description: "", unitPrice: "", quantity: "1" });
  const [selectedId, setSelectedId] = useUiState("cashier.selectedEncounterId", "");

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
    const id = window.setInterval(() => void load(), 30000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (selectedId && !bill) void openBill(selectedId);
  }, [selectedId]);

  async function openBill(encounterId: string) {
    const data = await get(`/payments/encounters/${encounterId}`);
    setBill(data);
    setSelectedId(encounterId);
    setAmount(String((data as any).balance));
    setReceiptId("");
    setError("");
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
      setOk("Charge added to this bill.");
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
      setOk(result.replayed ? "This payment was already recorded." : "Payment saved. Receipt is ready.");
      setReference("");
      await openBill(bill.encounterId);
      await load();
    } catch (err) {
      const queued = err instanceof ApiRequestError && err.queued;
      setError(queued ? err.message : err instanceof Error ? err.message : "Unable to record payment. The previous payment was not overwritten.");
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

  const pending: BillRow[] = dash?.pending || [];
  const others: BillRow[] = dash?.otherVisits || visits.filter((v: any) => !pending.some((p) => p.encounterId === v.id));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Cashier"
        subtitle="Collect against consultation, lab, pharmacy, OTC, walk-in tests, or a charge typed here. Partial pay is allowed. Every item prints on the receipt."
        actions={
          <Button variant="secondary" onClick={() => void load()}>
            <Icons.refresh /> Refresh
          </Button>
        }
      />
      {error ? <Alert kind="error">{error}</Alert> : null}
      {ok ? <Alert kind="success">{ok}</Alert> : null}
      {dash ? (
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Pending payments" value={pending.length} hint={pending.length ? "Open a row to collect" : "All clear"} />
          <Stat label="Receipts today" value={dash.completed.length} />
          <Stat label="Daily collection" value={formatMoney(currency, dash.dailyTotal)} />
        </div>
      ) : null}

      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
        <Icons.cash /> Outstanding
      </h2>
      {pending.length === 0 ? (
        <Empty title="No outstanding balances." body="Walk-in lab, OTC, and clinic visits appear here as soon as they have unpaid charges." />
      ) : (
        <Table headers={["Visit", "Patient", "Type", "Balance", "Status", ""]}>
          {pending.map((p) => (
            <tr key={p.encounterId} className={selectedId === p.encounterId ? "bg-sky-50" : "hover:bg-slate-50"}>
              <td className="px-3 py-2 font-medium">{p.visitNumber}</td>
              <td className="px-3 py-2">{p.patientName}</td>
              <td className="px-3 py-2 text-xs">{VISIT_TYPE_LABEL[p.visitType || "STANDARD"]}</td>
              <td className="px-3 py-2 font-medium text-orange-700">{formatMoney(currency, p.balance)}</td>
              <td className="px-3 py-2"><StatusBadge status={p.status} /></td>
              <td className="px-3 py-2">
                <Button variant="secondary" onClick={() => void openBill(p.encounterId)}>Open</Button>
              </td>
            </tr>
          ))}
        </Table>
      )}

      {others.length ? (
        <>
          <h2 className="text-sm font-semibold text-slate-800">Today's other visits</h2>
          <Table headers={["Visit", "Patient", "Status", ""]}>
            {others.map((p: any) => (
              <tr key={p.encounterId || p.id}>
                <td className="px-3 py-2">{p.visitNumber}</td>
                <td className="px-3 py-2">{p.patientName || p.patient?.name}</td>
                <td className="px-3 py-2"><StatusBadge status={p.status} /></td>
                <td className="px-3 py-2">
                  <Button variant="secondary" onClick={() => void openBill(p.encounterId || p.id)}>Open bill</Button>
                </td>
              </tr>
            ))}
          </Table>
        </>
      ) : null}

      {bill ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-2 font-medium">
            {bill.patient.name} · {bill.visitNumber}
            <span className="ml-2 text-xs font-normal text-slate-500">{VISIT_TYPE_LABEL[bill.visitType] || ""}</span>
          </h2>
          {bill.charges.length === 0 ? (
            <p className="mb-3 text-sm text-slate-500">No charges yet. Add a hospital item below, or wait for lab/pharmacy to post.</p>
          ) : (
            <Table headers={["Item", "Qty", "Price", "Total", "Status"]}>
              {bill.charges.map((c: any) => (
                <tr key={c.id}>
                  <td className="px-3 py-2">{c.description}</td>
                  <td className="px-3 py-2">{c.quantity}</td>
                  <td className="px-3 py-2">{c.unitPrice}</td>
                  <td className="px-3 py-2">{c.total}</td>
                  <td className="px-3 py-2"><StatusBadge status={c.status} /></td>
                </tr>
              ))}
            </Table>
          )}

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
            <div className="self-end"><Button type="submit"><Icons.plus /> Add charge</Button></div>
          </form>

          <p className="mt-3 text-sm">Total {formatMoney(currency, bill.total)} · Paid {formatMoney(currency, bill.amountPaid)} · Balance {formatMoney(currency, bill.balance)}</p>
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
              <div className="self-end"><Button type="submit"><Icons.cash /> Receive payment</Button></div>
            </form>
          ) : bill.charges.length ? <Alert kind="success">This visit is fully paid.</Alert> : <p className="mt-2 text-sm text-slate-500">Add a charge before collecting payment.</p>}
          {receiptId ? (
            <Link className="mt-3 inline-flex items-center gap-1 text-[var(--brand)]" to={`/cashier/receipts/${receiptId}`}>
              <Icons.print /> Open receipt
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
