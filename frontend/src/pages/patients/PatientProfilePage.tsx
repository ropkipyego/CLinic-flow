import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { get, post } from "../../api/client";
import { Alert, Button, Empty, PageHeader, StatusBadge, Table } from "../../components/ui";
import { useAuth } from "../../auth/AuthContext";

export function PatientProfilePage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    get(`/patients/${id}/profile`)
      .then(setData)
      .catch((e) => setError(e.message || "Unable to load patient profile."));
  }, [id]);

  async function startVisit() {
    if (!id) return;
    try {
      const visit = await post<{ id: string }>("/encounters", { patientId: id, checkInToConsultation: true });
      window.location.href = `/visits?opened=${visit.id}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to start visit.");
    }
  }

  if (error) return <Alert kind="error">{error}</Alert>;
  if (!data) return <p className="text-sm text-slate-500">Loading patient…</p>;

  return (
    <div className="space-y-6">
      <PageHeader
        title={data.patient.name}
        subtitle={`${data.patient.patientNumber} · ${data.patient.age ?? "—"}/${data.patient.sex[0]} · ${data.patient.phone}`}
        actions={["ADMIN", "RECEPTION"].includes(user!.role) ? <Button onClick={() => void startVisit()}>Start visit</Button> : null}
      />
      <section>
        <h2 className="mb-2 font-medium">Encounter history</h2>
        {data.encounters.length === 0 ? (
          <Empty title="No visits yet." />
        ) : (
          <Table headers={["Visit", "Date", "Status", "Doctor", "Diagnoses"]}>
            {data.encounters.map((e: any) => (
              <tr key={e.id}>
                <td className="px-3 py-2">
                  <Link className="text-[var(--brand)]" to={`/consultation/${e.id}`}>
                    {e.visitNumber}
                  </Link>
                </td>
                <td className="px-3 py-2">{new Date(e.startedAt).toLocaleString()}</td>
                <td className="px-3 py-2"><StatusBadge status={e.status} /></td>
                <td className="px-3 py-2">{e.doctor || "—"}</td>
                <td className="px-3 py-2">{e.diagnoses.join(", ") || "—"}</td>
              </tr>
            ))}
          </Table>
        )}
      </section>
      <section>
        <h2 className="mb-2 font-medium">Laboratory results</h2>
        {data.labResults.length === 0 ? <Empty title="No laboratory results." /> : (
          <Table headers={["Test", "Result", "Visit", "Date"]}>
            {data.labResults.map((r: any) => (
              <tr key={r.id}>
                <td className="px-3 py-2">{r.test}</td>
                <td className="px-3 py-2">{r.value}</td>
                <td className="px-3 py-2">{r.visitNumber}</td>
                <td className="px-3 py-2">{new Date(r.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </Table>
        )}
      </section>
      <section>
        <h2 className="mb-2 font-medium">Prescriptions</h2>
        {data.prescriptions.length === 0 ? <Empty title="No prescriptions." /> : (
          <Table headers={["Visit", "Status", "Medicines"]}>
            {data.prescriptions.map((p: any) => (
              <tr key={p.id}>
                <td className="px-3 py-2">{p.visitNumber}</td>
                <td className="px-3 py-2"><StatusBadge status={p.status} /></td>
                <td className="px-3 py-2">{p.items.map((i: any) => i.medicine).join(", ")}</td>
              </tr>
            ))}
          </Table>
        )}
      </section>
      {data.payments ? (
        <section>
          <h2 className="mb-2 font-medium">Payments</h2>
          <Table headers={["Receipt", "Amount", "Method", "Visit"]}>
            {data.payments.map((p: any) => (
              <tr key={p.id}>
                <td className="px-3 py-2">{p.receiptNumber}</td>
                <td className="px-3 py-2">{p.amount}</td>
                <td className="px-3 py-2">{p.method}</td>
                <td className="px-3 py-2">{p.visitNumber}</td>
              </tr>
            ))}
          </Table>
        </section>
      ) : null}
      <section>
        <h2 className="mb-2 font-medium">Timeline</h2>
        <ul className="space-y-1 text-sm text-slate-700">
          {data.timeline.map((t: any) => (
            <li key={`${t.type}-${t.ref}`}>{new Date(t.at).toLocaleString()} — {t.label}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
