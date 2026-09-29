import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { get } from "../../api/client";
import { Alert, Button, Empty, PageHeader, Table, cellClass, inputClass } from "../../components/ui";
import { Icons } from "../../components/icons";
import { useAuth } from "../../auth/AuthContext";
import { isClinicAdmin } from "../../lib/roles";

type Patient = {
  id: string;
  patientNumber: string;
  name: string;
  phone: string;
  age: number | null;
  sex: string;
  createdAt?: string;
};

type Registry = { items: Patient[]; total: number; page: number; take: number; pages: number };

export function PatientsPage() {
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [sex, setSex] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Registry | null>(null);
  const [error, setError] = useState("");

  async function search(e?: FormEvent, nextPage = 1) {
    e?.preventDefault();
    try {
      const qs = new URLSearchParams();
      if (q.trim()) qs.set("q", q.trim());
      if (sex) qs.set("sex", sex);
      qs.set("page", String(nextPage));
      qs.set("take", "30");
      setData(await get<Registry>(`/patients/registry?${qs}`));
      setPage(nextPage);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to search patients.");
    }
  }

  useEffect(() => {
    void search();
  }, []);

  const canRegister = isClinicAdmin(user?.role) || user?.role === "RECEPTION";
  const rows = data?.items || [];

  return (
    <div>
      <PageHeader
        title="Patient registry"
        subtitle="Search by number, name, or phone. One file per person — open the existing chart instead of registering again."
        actions={
          canRegister ? (
            <Link to="/patients/new">
              <Button><Icons.userPlus /> Add new patient</Button>
            </Link>
          ) : null
        }
      />
      <form onSubmit={(e) => void search(e, 1)} className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-[16rem] flex-1">
          <span className="pointer-events-none absolute left-3 top-2.5 text-slate-400">
            <Icons.search />
          </span>
          <input
            className={`${inputClass} pl-9`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Number, name, or 07…"
          />
        </div>
        <select className={`${inputClass} max-w-[10rem]`} value={sex} onChange={(e) => setSex(e.target.value)}>
          <option value="">All sexes</option>
          <option value="FEMALE">Female</option>
          <option value="MALE">Male</option>
          <option value="OTHER">Other</option>
        </select>
        <Button type="submit" variant="secondary">Search</Button>
      </form>
      {error ? <Alert kind="error">{error}</Alert> : null}
      {rows.length === 0 ? (
        <Empty title="No matching patients." body="Register a patient to start a visit." />
      ) : (
        <>
          <Table headers={["Number", "Name", "Age / sex", "Phone", "Registered", ""]}>
            {rows.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className={`${cellClass} font-medium text-slate-900`}>{p.patientNumber}</td>
                <td className={cellClass}>{p.name}</td>
                <td className={cellClass}>{p.age ?? "—"} / {p.sex[0]}</td>
                <td className={cellClass}>{p.phone}</td>
                <td className={cellClass}>{p.createdAt ? new Date(p.createdAt).toLocaleDateString() : "—"}</td>
                <td className={`${cellClass} text-right`}>
                  <Link className="text-sm font-medium text-[var(--brand)] hover:underline" to={`/patients/${p.id}`}>
                    Open chart
                  </Link>
                </td>
              </tr>
            ))}
          </Table>
          <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
            <span>{data?.total} in registry · page {page} of {data?.pages}</span>
            <div className="flex gap-2">
              <Button variant="secondary" disabled={page <= 1} onClick={() => void search(undefined, page - 1)}>Previous</Button>
              <Button variant="secondary" disabled={page >= (data?.pages || 1)} onClick={() => void search(undefined, page + 1)}>Next</Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
