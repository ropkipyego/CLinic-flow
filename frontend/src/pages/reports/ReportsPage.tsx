import { useMemo, useState } from "react";
import { get } from "../../api/client";
import { Alert, Button, Field, PageHeader, Table, inputClass } from "../../components/ui";
import { Icons } from "../../components/icons";
import { useUiState } from "../../lib/uiState";

const REPORTS = [
  { id: "visits", label: "Daily patient visits" },
  { id: "revenue", label: "Daily revenue" },
  { id: "lab", label: "Laboratory" },
  { id: "pharmacy", label: "Pharmacy sales" },
  { id: "low-stock", label: "Low-stock medicines" },
  { id: "doctors", label: "Doctor consultations" },
  { id: "encounters", label: "Encounter summary" },
];

export function ReportsPage() {
  const [from, setFrom] = useUiState("reports.from", new Date().toISOString().slice(0, 10));
  const [to, setTo] = useUiState("reports.to", new Date().toISOString().slice(0, 10));
  const [active, setActive] = useUiState("reports.id", "visits");
  const [data, setData] = useState<unknown>(null);
  const [error, setError] = useState("");
  const [sortKey, setSortKey] = useState("");

  async function run(id: string, csv = false) {
    try {
      setActive(id);
      if (csv && id === "visits") {
        const token = localStorage.getItem("clinicflow_token");
        const res = await fetch(`/api/v1/reports/visits?from=${from}&to=${to}&format=csv`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error("Unable to export visits CSV.");
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "visits.csv";
        a.click();
        URL.revokeObjectURL(url);
        return;
      }
      setData(await get(`/reports/${id}?from=${from}&to=${to}`));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load report.");
    }
  }

  const table = useMemo(() => {
    if (!data) return null;
    if (Array.isArray(data)) {
      const rows = [...data] as Array<Record<string, unknown>>;
      if (sortKey && rows[0] && sortKey in rows[0]) {
        rows.sort((a, b) => String(a[sortKey] ?? "").localeCompare(String(b[sortKey] ?? ""), undefined, { numeric: true }));
      }
      const headers = rows[0] ? Object.keys(rows[0]) : [];
      return { headers, rows };
    }
    if (typeof data === "object" && data && "items" in (data as object) && Array.isArray((data as { items: unknown }).items)) {
      const rows = [...(data as { items: Array<Record<string, unknown>> }).items];
      const headers = rows[0] ? Object.keys(rows[0]) : [];
      return { headers, rows, summary: data };
    }
    return null;
  }, [data, sortKey]);

  return (
    <div className="space-y-4">
      <PageHeader title="Reports" subtitle="Date-range operational reports. Click a column header to sort. CSV export is available for visits." />
      {error ? <Alert kind="error">{error}</Alert> : null}
      <div className="flex gap-2">
        <Field label="From"><input className={inputClass} type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><input className={inputClass} type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
      <div className="flex flex-wrap gap-2">
        {REPORTS.map((r) => (
          <Button key={r.id} variant={active === r.id ? "primary" : "secondary"} onClick={() => void run(r.id)}>{r.label}</Button>
        ))}
        <Button onClick={() => void run("visits", true)}><Icons.reports /> Export visits CSV</Button>
      </div>
      {table ? (
        <Table headers={table.headers}>
          {table.rows.map((row, i) => (
            <tr key={i} className="hover:bg-slate-50">
              {table.headers.map((h) => (
                <td key={h} className="cursor-pointer px-3 py-2" onClick={() => setSortKey(h)}>
                  {typeof row[h] === "object" ? JSON.stringify(row[h]) : String(row[h] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </Table>
      ) : data ? (
        <div className="grid gap-2 md:grid-cols-3">
          {Object.entries(data as Record<string, unknown>).map(([k, v]) => (
            <div key={k} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500">{k}</div>
              <div className="mt-1 text-sm font-medium text-slate-900">
                {typeof v === "object" ? JSON.stringify(v) : String(v)}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
