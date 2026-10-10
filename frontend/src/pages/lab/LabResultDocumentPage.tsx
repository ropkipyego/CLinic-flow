import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { get } from "../../api/client";
import { Alert, Button } from "../../components/ui";
import { ClinicLogo } from "../../branding/ClinicLogo";

export function LabResultDocumentPage() {
  const { id } = useParams();
  const [doc, setDoc] = useState<any>(null);
  const [error, setError] = useState("");
  const [printBlocked, setPrintBlocked] = useState(false);

  useEffect(() => {
    if (!id) return;
    get(`/lab/results/${id}/document`).then(setDoc).catch((e) => setError(e.message || "Unable to load result."));
  }, [id]);

  if (error) return <Alert kind="error">{error}</Alert>;
  if (!doc) return <p className="text-sm">Loading laboratory report…</p>;
  if (!doc.final) return <Alert kind="info">This result is a draft and is not a final report.</Alert>;

  function printReport() {
    setPrintBlocked(false);
    window.print();
    window.setTimeout(() => setPrintBlocked(true), 800);
  }

  return (
    <div className="mx-auto max-w-2xl rounded-xl border border-slate-200 bg-white p-6 text-sm">
      <div className="mb-4 flex items-start justify-between">
        <div className="flex items-start gap-3">
          {doc.clinic.logoUrl ? <ClinicLogo size={56} /> : null}
          <div>
            <h1 className="text-lg font-semibold">{doc.clinic.name}</h1>
            <p>Laboratory</p>
            <p className="text-slate-600">{doc.clinic.address}</p>
            <p className="text-slate-600">{doc.clinic.phone} {doc.clinic.email}</p>
          </div>
        </div>
        <div className="print:hidden">
          <Button onClick={printReport}>Print</Button>
        </div>
      </div>
      {printBlocked ? (
        <Alert kind="info">If the print dialog did not open, use your browser Print command or this Print button.</Alert>
      ) : null}
      <p>Patient {doc.patient.name} ({doc.patient.patientNumber})</p>
      <p>Visit {doc.visitNumber}</p>
      <p>Order {doc.orderId}</p>
      <table className="mt-4 w-full border-collapse">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">Test</th>
            <th className="py-2">Result</th>
            <th className="py-2">Reference</th>
            <th className="py-2">Flag</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b">
            <td className="py-2">{doc.testName}</td>
            <td className="py-2">{doc.result}</td>
            <td className="py-2">{doc.referenceRange || "—"}</td>
            <td className="py-2">{doc.flag || "—"}</td>
          </tr>
        </tbody>
      </table>
      {doc.notes ? <p className="mt-3">Comments: {doc.notes}</p> : null}
      <p className="mt-4">Completed {new Date(doc.completedAt).toLocaleString()}</p>
      <p>Performed by {doc.performedBy}</p>
      <p>Verified by {doc.verifiedBy} at {doc.verifiedAt ? new Date(doc.verifiedAt).toLocaleString() : "—"}</p>
    </div>
  );
}
