import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { get, post } from "../../api/client";
import { Alert, Button, Empty, PageHeader, Stat, StatusBadge, Table, cellClass } from "../../components/ui";

type Encounter = {
  id: string;
  visitNumber: string;
  visitType?: string;
  status: string;
  startedAt: string;
  patient: { id: string; name: string; age: number | null; sex: string };
  assignedDoctor: { name: string } | null;
};

type Stats = {
  todaysPatients: number;
  waitingConsultation: number;
  inConsultation: number;
  waitingLab: number;
  waitingPharmacy: number;
  waitingPayment: number;
  completed: number;
};

export function VisitsPage() {
  const [rows, setRows] = useState<Encounter[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");

  async function load() {
    try {
      const [enc, st] = await Promise.all([get<Encounter[]>("/encounters"), get<Stats>("/encounters/stats/today")]);
      setRows(enc);
      setStats(st);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load today's visits.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function checkIn(id: string) {
    try {
      await post(`/encounters/${id}/check-in`, {});
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to check the patient into consultation.");
    }
  }

  return (
    <div>
      <PageHeader
        title="Today's visits"
        subtitle="Sorted by arrival time. Check a patient into consultation when they are ready."
        actions={
          <Link to="/patients/new">
            <Button>Register patient</Button>
          </Link>
        }
      />
      {error ? <Alert kind="error">{error}</Alert> : null}
      {stats ? (
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
          <Stat label="Today's patients" value={stats.todaysPatients} />
          <Stat label="Waiting consult" value={stats.waitingConsultation} />
          <Stat label="In consultation" value={stats.inConsultation} />
          <Stat label="Waiting lab" value={stats.waitingLab} />
          <Stat label="Waiting pharmacy" value={stats.waitingPharmacy} />
          <Stat label="Waiting payment" value={stats.waitingPayment} />
          <Stat label="Completed" value={stats.completed} />
        </div>
      ) : null}
      {rows.length === 0 ? (
        <Empty title="No patients registered today." body="Register a patient and start a visit." />
      ) : (
        <Table headers={["Visit", "Patient", "Age/Sex", "Time", "Type", "Status", "Doctor", "Action"]}>
          {rows.map((e) => (
            <tr key={e.id} className="hover:bg-slate-50">
              <td className={`${cellClass} font-medium text-slate-900`}>{e.visitNumber}</td>
              <td className={cellClass}>
                <Link className="text-[var(--brand)] hover:underline" to={`/patients/${e.patient.id}`}>
                  {e.patient.name}
                </Link>
              </td>
              <td className={cellClass}>
                {e.patient.age ?? "—"} / {e.patient.sex[0]}
              </td>
              <td className={cellClass}>{new Date(e.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td>
              <td className={cellClass}><StatusBadge status={e.visitType || "STANDARD"} /></td>
              <td className={cellClass}><StatusBadge status={e.status} /></td>
              <td className={cellClass}>{e.assignedDoctor?.name || "—"}</td>
              <td className={cellClass}>
                {e.status === "REGISTERED" ? (
                  <Button variant="secondary" onClick={() => void checkIn(e.id)}>
                    Check in
                  </Button>
                ) : (
                  <Link className="text-sm font-medium text-[var(--brand)] hover:underline" to={`/consultation/${e.id}`}>
                    Open
                  </Link>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
