import { useState } from "react";
import { get } from "../../api/client";
import { Alert, Button, Field, PageHeader, inputClass } from "../../components/ui";

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
  const [from, setFrom] = useState(new Date().toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<unknown>(null);
  const [error, setError] = useState("");

  async function run(id: string, csv = false) {
    try {
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

  return (
    <div className="space-y-4">
      <PageHeader title="Reports" subtitle="Date-range operational reports. CSV export available for visits." />
      {error ? <Alert kind="error">{error}</Alert> : null}
      <div className="flex gap-2">
        <Field label="From"><input className={inputClass} type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><input className={inputClass} type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
      <div className="flex flex-wrap gap-2">
        {REPORTS.map((r) => (
          <Button key={r.id} variant="secondary" onClick={() => void run(r.id)}>{r.label}</Button>
        ))}
        <Button onClick={() => void run("visits", true)}>Export visits CSV</Button>
      </div>
      {data ? <pre className="overflow-auto rounded-md border bg-white p-3 text-xs">{JSON.stringify(data, null, 2)}</pre> : null}
    </div>
  );
}
