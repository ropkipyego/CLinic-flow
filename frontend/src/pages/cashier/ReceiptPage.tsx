import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { get } from "../../api/client";
import { Alert } from "../../components/ui";
import { ClinicLogo } from "../../branding/ClinicLogo";

export function ReceiptPage() {
  const { id } = useParams();
  const [r, setR] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    get(`/receipts/${id}`).then(setR).catch((e) => setError(e.message || "Unable to load receipt."));
  }, [id]);

  if (error) return <Alert kind="error">{error}</Alert>;
  if (!r) return <p className="text-sm">Loading receipt…</p>;

  return (
    <div className="mx-auto max-w-lg rounded-xl border border-slate-200 bg-white p-6 text-sm">
      <div className="flex items-start gap-3">
        {r.clinic.logoUrl ? <ClinicLogo size={56} /> : null}
        <div>
          <h1 className="text-lg font-semibold">{r.clinic.name}</h1>
          <p className="text-slate-600">{r.clinic.address}</p>
          <p className="text-slate-600">{r.clinic.phone} {r.clinic.email}</p>
        </div>
      </div>
      <hr className="my-3" />
      <p>Receipt {r.receiptNumber}</p>
      <p>{new Date(r.createdAt).toLocaleString()}</p>
      <p>Patient {r.patient.name} ({r.patient.patientNumber})</p>
      <p>Visit {r.visitNumber}</p>
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
