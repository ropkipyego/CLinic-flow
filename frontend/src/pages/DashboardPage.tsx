import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { get } from "../api/client";
import { Alert, Button, Empty, PageHeader, Stat, StatusBadge, Table, cellClass } from "../components/ui";
import { useAuth } from "../auth/AuthContext";
import { formatMoney } from "../lib/labels";

type Stats = {
  todaysPatients: number;
  waitingConsultation: number;
  waitingLab: number;
  waitingPharmacy: number;
  unpaidEncounters: number;
  todaysRevenue: number;
};

type Encounter = {
  id: string;
  visitNumber: string;
  status: string;
  startedAt: string;
  patient: { id: string; name: string; age: number | null; sex: string };
};

const shortcuts: Record<string, { to: string; label: string }[]> = {
  ADMIN: [
    { to: "/visits", label: "Today's visits" },
    { to: "/admin", label: "Clinic settings" },
  ],
  RECEPTION: [
    { to: "/patients/new", label: "Register patient" },
    { to: "/visits", label: "Today's visits" },
  ],
  DOCTOR: [{ to: "/consultation", label: "Open consultation" }],
  LAB: [{ to: "/laboratory", label: "Lab queue" }],
  PHARMACY: [{ to: "/pharmacy", label: "Pharmacy queue" }],
  CASHIER: [{ to: "/cashier", label: "Pending payments" }],
};

export function DashboardPage() {
  const { tenant, user } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [visits, setVisits] = useState<Encounter[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([get<Stats>("/encounters/stats/today"), get<Encounter[]>("/encounters").catch(() => [])])
      .then(([st, rows]) => {
        setStats(st);
        setVisits(rows);
      })
      .catch((e) => setError(e.message || "Unable to load today's dashboard."));
  }, []);

  const actions = shortcuts[user!.role] || shortcuts.ADMIN;
  const waiting = visits.filter((v) => v.status !== "COMPLETED" && v.status !== "CANCELLED").slice(0, 8);

  return (
    <div>
      <PageHeader
        title="Today"
        subtitle={`${tenant?.name || "Clinic"} · ${new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}`}
        actions={actions.map((a) => (
          <Link key={a.to} to={a.to}>
            <Button variant={a === actions[0] ? "primary" : "secondary"}>{a.label}</Button>
          </Link>
        ))}
      />
      {error ? <Alert kind="error">{error}</Alert> : null}
      {stats ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
          <Stat label="Patients today" value={stats.todaysPatients} />
          <Stat label="Waiting consult" value={stats.waitingConsultation} />
          <Stat label="Lab pending" value={stats.waitingLab} />
          <Stat label="Pharmacy pending" value={stats.waitingPharmacy} />
          <Stat label="Unpaid visits" value={stats.unpaidEncounters} />
          <Stat label="Collected today" value={formatMoney(tenant?.currency || "KES", stats.todaysRevenue)} />
        </div>
      ) : !error ? (
        <p className="text-sm text-slate-500">Loading today's numbers…</p>
      ) : null}

      <div className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Active visits</h2>
          <Link className="text-sm text-[var(--brand)] hover:underline" to="/visits">
            View all
          </Link>
        </div>
        {waiting.length === 0 ? (
          <Empty title="No active visits right now." body="Reception can register a patient and start a visit." />
        ) : (
          <Table headers={["Visit", "Patient", "Time", "Status"]}>
            {waiting.map((e) => (
              <tr key={e.id} className="hover:bg-slate-50">
                <td className={`${cellClass} font-medium text-slate-900`}>{e.visitNumber}</td>
                <td className={cellClass}>
                  <Link className="text-[var(--brand)] hover:underline" to={`/patients/${e.patient.id}`}>
                    {e.patient.name}
                  </Link>
                  <span className="ml-2 text-xs text-slate-400">
                    {e.patient.age ?? "—"} / {e.patient.sex[0]}
                  </span>
                </td>
                <td className={cellClass}>{new Date(e.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td>
                <td className={cellClass}>
                  <StatusBadge status={e.status} />
                </td>
              </tr>
            ))}
          </Table>
        )}
      </div>
    </div>
  );
}
