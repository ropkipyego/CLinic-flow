import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { get } from "../../api/client";
import { Alert, Button } from "../../components/ui";
import { ClinicLogo } from "../../branding/ClinicLogo";

export function ReceiptPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const [r, setR] = useState<any>(null);
  const [error, setError] = useState("");
  const [printBlocked, setPrintBlocked] = useState(false);
  const printed = useRef(false);

  useEffect(() => {
    if (!id) return;
    get(`/receipts/${id}`).then(setR).catch((e) => setError(e.message || "Unable to load receipt."));
  }, [id]);

  useEffect(() => {
    if (!r || searchParams.get("print") !== "1" || printed.current) return;
    printed.current = true;
    const t = window.setTimeout(() => {
      window.print();
      setPrintBlocked(true);
    }, 300);
    return () => window.clearTimeout(t);
  }, [r, searchParams]);

  if (error) return <Alert kind="error">{error}</Alert>;
  if (!r) return <p className="text-sm">Loading receipt…</p>;

  return (
    <div className="mx-auto max-w-lg rounded-xl border border-slate-200 bg-white p-6 text-sm">
      <div className="mb-3 flex items-start justify-between">
        <div className="flex items-start gap-3">
          {r.clinic.logoUrl ? <ClinicLogo size={56} /> : null}
          <div>
            <h1 className="text-lg font-semibold">{r.clinic.name}</h1>
            <p className="text-slate-600">{r.clinic.address}</p>
            <p className="text-slate-600">{r.clinic.phone} {r.clinic.email}</p>
          </div>
        </div>
        <div className="print:hidden">
          <Button onClick={() => window.print()}>Print / reprint</Button>
        </div>
      </div>
      {printBlocked ? (
        <div className="print:hidden mb-3">
          <Alert kind="info">If printing did not start, use Print / reprint or your browser print command. Reprinting does not create another payment.</Alert>
        </div>
      ) : null}
      <hr className="my-3" />
      <p>Receipt {r.receiptNumber}</p>
      <p>{new Date(r.createdAt).toLocaleString()}</p>
      <p>Patient {r.patient.name} ({r.patient.patientNumber})</p>
      <p>Visit {r.visitNumber}</p>
      <p>Cashier {r.cashier || "—"}</p>
      <table className="mt-3 w-full">
        <tbody>
          {r.items.map((i: any) => (
            <tr key={i.id}>
              <td className="py-1">{i.description}{i.quantity > 1 ? ` × ${i.quantity}` : ""}</td>
              <td className="py-1 text-right">{i.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3">Total {r.clinic.currency} {r.total}</p>
      <p>Paid {r.amountPaid} via {r.method}</p>
      <p>Balance {r.balance}</p>
      {r.clinic.receiptFooter ? <p className="mt-4 text-slate-500">{r.clinic.receiptFooter}</p> : null}
    </div>
  );
}
