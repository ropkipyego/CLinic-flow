import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { get } from "../../api/client";
import { Alert, Button, Empty, PageHeader, Table, cellClass, inputClass } from "../../components/ui";
import { Icons } from "../../components/icons";
import { useAuth } from "../../auth/AuthContext";

type Patient = {
  id: string;
  patientNumber: string;
  name: string;
  phone: string;
  age: number | null;
  sex: string;
};

export function PatientsPage() {
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Patient[]>([]);
  const [error, setError] = useState("");

  async function search(e?: FormEvent) {
    e?.preventDefault();
    try {
      setRows(await get<Patient[]>(`/patients${q ? `?q=${encodeURIComponent(q)}` : ""}`));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to search patients.");
    }
  }

  useEffect(() => {
    void search();
  }, []);

  const canRegister = user?.role === "ADMIN" || user?.role === "RECEPTION";

  return (
    <div>
      <PageHeader
        title="Patients"
        subtitle="Find someone by number, name, or phone. One record follows them through every department."
        actions={
          canRegister ? (
            <Link to="/patients/new">
              <Button>Register patient</Button>
            </Link>
          ) : null
        }
      />
      <form onSubmit={search} className="mb-4 flex gap-2">
        <div className="relative max-w-md flex-1">
          <span className="pointer-events-none absolute left-3 top-2.5 text-slate-400">
            <Icons.search />
          </span>
          <input
            className={`${inputClass} pl-9`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="CLF-000001, Mary, or 07…"
          />
        </div>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>
      {error ? <Alert kind="error">{error}</Alert> : null}
      {rows.length === 0 ? (
        <Empty title="No matching patients." body="Register a patient to start a visit." />
      ) : (
        <Table headers={["Number", "Name", "Age / sex", "Phone", ""]}>
          {rows.map((p) => (
            <tr key={p.id} className="hover:bg-slate-50">
              <td className={`${cellClass} font-medium text-slate-900`}>{p.patientNumber}</td>
              <td className={cellClass}>{p.name}</td>
              <td className={cellClass}>
                {p.age ?? "—"} / {p.sex[0]}
              </td>
              <td className={cellClass}>{p.phone}</td>
              <td className={`${cellClass} text-right`}>
                <Link className="text-sm font-medium text-[var(--brand)] hover:underline" to={`/patients/${p.id}`}>
                  Open chart
                </Link>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
