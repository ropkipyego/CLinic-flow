import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { get } from "../api/client";
import { Alert, Button, Empty, PageHeader, Stat, StatusBadge, Table, cellClass } from "../components/ui";
import { Icons } from "../components/icons";
import { useAuth } from "../auth/AuthContext";
import { formatMoney, VISIT_TYPE_LABEL } from "../lib/labels";
import { useUiState } from "../lib/uiState";

type Dash = {
  generatedAt: string;
  stats: {
    todaysPatients: number;
    waitingConsultation: number;
    inConsultation: number;
    waitingLab: number;
    waitingPharmacy: number;
    waitingPayment: number;
    unpaidEncounters: number;
    unpaidAmount: number;
    todaysRevenue: number;
    walkInLab: number;
    otcPharmacy: number;
    completed: number;
    revenueByMethod: Record<string, number>;
  };
  visits: Array<{
    id: string;
    visitNumber: string;
    visitType: string;
    status: string;
    startedAt: string;
    unpaidBalance: number;
    chargeTotal: number;
    patient: { id: string; name: string; age: number | null; sex: string };
  }>;
  cashier: { pending: unknown[]; dailyTotal: number; completedCount: number };
  labPending: number;
  pharmacyPending: number;
  lowStock: Array<{ name: string; quantityOnHand: number; reorderLevel: number }>;
};

type SortKey = "time" | "patient" | "status" | "type" | "balance";

const shortcuts: Record<string, { to: string; label: string }[]> = {
  ADMIN: [
    { to: "/visits", label: "Today's visits" },
    { to: "/admin", label: "Clinic settings" },
  ],
  RECEPTION: [
    { to: "/patients/new", label: "Register patient" },
    { to: "/laboratory", label: "Walk-in lab" },
  ],
  DOCTOR: [{ to: "/consultation", label: "Open consultation" }],
  LAB: [{ to: "/laboratory", label: "Lab queue" }],
  PHARMACY: [{ to: "/pharmacy", label: "Pharmacy / OTC" }],
  CASHIER: [{ to: "/cashier", label: "Pending payments" }],
};

export function DashboardPage() {
  const { tenant, user } = useAuth();
  const [dash, setDash] = useState<Dash | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useUiState("dashboard.filter", "ALL");
  const [sort, setSort] = useUiState<{ key: SortKey; dir: "asc" | "desc" }>("dashboard.sort", { key: "time", dir: "asc" });

  async function load() {
    try {
      setDash(await get<Dash>("/encounters/stats/dashboard"));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load today's dashboard.");
    }
  }

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 45000);
    return () => window.clearInterval(id);
  }, []);

  const rows = useMemo(() => {
    const list = [...(dash?.visits || [])];
    const filtered = list.filter((v) => {
      if (filter === "ALL") return true;
      if (filter === "UNPAID") return v.unpaidBalance > 0;
      if (filter === "WALK_IN_LAB" || filter === "OTC_PHARMACY" || filter === "STANDARD") return v.visitType === filter;
      return v.status === filter;
    });
    const dir = sort.dir === "asc" ? 1 : -1;
    filtered.sort((a, b) => {
      if (sort.key === "patient") return dir * a.patient.name.localeCompare(b.patient.name);
      if (sort.key === "status") return dir * a.status.localeCompare(b.status);
      if (sort.key === "type") return dir * a.visitType.localeCompare(b.visitType);
      if (sort.key === "balance") return dir * (a.unpaidBalance - b.unpaidBalance);
      return dir * (new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());
    });
    return filtered;
  }, [dash, filter, sort]);

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }

  const actions = shortcuts[user!.role] || shortcuts.ADMIN;
  const stats = dash?.stats;

  return (
    <div>
      <PageHeader
        title="Today"
        subtitle={`${tenant?.name || "Clinic"} · ${new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}`}
        actions={
          <>
            <Button variant="secondary" onClick={() => void load()}>
              <Icons.refresh /> Refresh
            </Button>
            {actions.map((a) => (
              <Link key={a.to} to={a.to}>
                <Button variant={a === actions[0] ? "primary" : "secondary"}>{a.label}</Button>
              </Link>
            ))}
          </>
        }
      />
      {error ? <Alert kind="error">{error}</Alert> : null}
      {stats ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-8">
          <Stat label="Patients today" value={stats.todaysPatients} onClick={() => setFilter("ALL")} />
          <Stat label="Waiting consult" value={stats.waitingConsultation} onClick={() => setFilter("WAITING_CONSULTATION")} />
          <Stat label="Lab pending" value={stats.waitingLab} hint={`${dash?.labPending || 0} orders`} onClick={() => setFilter("WAITING_LAB")} />
          <Stat label="Pharmacy" value={stats.waitingPharmacy} hint={`${dash?.pharmacyPending || 0} Rx`} onClick={() => setFilter("WAITING_PHARMACY")} />
          <Stat label="Unpaid" value={stats.unpaidEncounters} hint={formatMoney(tenant?.currency || "KES", stats.unpaidAmount || 0)} onClick={() => setFilter("UNPAID")} />
          <Stat label="Walk-in lab" value={stats.walkInLab} onClick={() => setFilter("WALK_IN_LAB")} />
          <Stat label="OTC sales" value={stats.otcPharmacy} onClick={() => setFilter("OTC_PHARMACY")} />
          <Stat label="Collected" value={formatMoney(tenant?.currency || "KES", stats.todaysRevenue)} />
        </div>
      ) : !error ? (
        <p className="text-sm text-slate-500">Loading today's numbers…</p>
      ) : null}

      {stats?.revenueByMethod && Object.keys(stats.revenueByMethod).length ? (
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
          {Object.entries(stats.revenueByMethod).map(([method, amount]) => (
            <span key={method} className="rounded-full bg-white px-2.5 py-1 ring-1 ring-slate-200">
              {method}: {formatMoney(tenant?.currency || "KES", amount)}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-800">Visits</h2>
          <div className="flex flex-wrap gap-1">
            {["ALL", "UNPAID", "WAITING_CONSULTATION", "WAITING_LAB", "WAITING_PHARMACY", "WAITING_PAYMENT", "WALK_IN_LAB", "OTC_PHARMACY"].map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`rounded-full px-2.5 py-1 text-xs ${filter === f ? "bg-[var(--brand)] text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}`}
              >
                {f.replaceAll("_", " ").toLowerCase()}
              </button>
            ))}
          </div>
        </div>
        {rows.length === 0 ? (
          <Empty title="No visits match that filter." body="Reception can register a patient, or pharmacy/lab can take a walk-in." />
        ) : (
          <Table
            headers={[
              `Visit`,
              `Patient`,
              `Type`,
              `Time`,
              `Balance`,
              `Status`,
            ]}
          >
            {rows.map((e) => (
              <tr key={e.id} className="cursor-pointer hover:bg-slate-50" onClick={() => toggleSort("time")}>
                <td className={`${cellClass} font-medium text-slate-900`}>{e.visitNumber}</td>
                <td className={cellClass}>
                  <Link className="text-[var(--brand)] hover:underline" to={`/patients/${e.patient.id}`}>
                    {e.patient.name}
                  </Link>
                  <span className="ml-2 text-xs text-slate-400">
                    {e.patient.age ?? "—"} / {e.patient.sex[0]}
                  </span>
                </td>
                <td className={cellClass}>
                  <StatusBadge status={e.visitType} />
                  <span className="ml-1 hidden text-xs text-slate-400 lg:inline">{VISIT_TYPE_LABEL[e.visitType]}</span>
                </td>
                <td className={cellClass}>{new Date(e.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td>
                <td className={`${cellClass} tabular-nums ${e.unpaidBalance > 0 ? "font-medium text-orange-700" : "text-slate-500"}`}>
                  {e.unpaidBalance > 0 ? formatMoney(tenant?.currency || "KES", e.unpaidBalance) : "—"}
                </td>
                <td className={cellClass}>
                  <StatusBadge status={e.status} />
                </td>
              </tr>
            ))}
          </Table>
        )}
        <div className="mt-2 flex gap-2 text-xs text-slate-500">
          <button type="button" className="inline-flex items-center gap-1 hover:text-slate-800" onClick={() => toggleSort("patient")}>
            <Icons.sort /> Sort by name
          </button>
          <button type="button" className="hover:text-slate-800" onClick={() => toggleSort("balance")}>
            Sort by balance
          </button>
          <button type="button" className="hover:text-slate-800" onClick={() => toggleSort("status")}>
            Sort by status
          </button>
        </div>
      </div>

      {dash?.lowStock?.length ? (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-amber-900">
            <Icons.warning /> Low stock
          </div>
          <p className="text-sm text-amber-800">
            {dash.lowStock.map((m) => `${m.name} (${m.quantityOnHand})`).join(" · ")}
          </p>
        </div>
      ) : null}
    </div>
  );
}
