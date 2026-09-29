import { FormEvent, useEffect, useState } from "react";
import { get, patch, post } from "../../api/client";
import { Alert, Button, Field, PageHeader, Table, inputClass } from "../../components/ui";
import { ROLE_LABEL } from "../../lib/labels";
import { useAuth, type Role } from "../../auth/AuthContext";
import { isClinicAdmin, isSuperAdmin } from "../../lib/roles";

type Rights = {
  actorRole: Role;
  assignableRoles: Role[];
  rights: Array<Record<string, boolean | string> & { area: string }>;
};

const COLS: Role[] = ["SUPER_ADMIN", "ADMIN", "RECEPTION", "DOCTOR", "LAB", "PHARMACY", "CASHIER"];

export function RolesPage() {
  const { user } = useAuth();
  const [rights, setRights] = useState<Rights | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", password: "", role: "ADMIN" });

  async function load() {
    try {
      setRights(await get<Rights>("/users/rights"));
      setUsers(await get("/users"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load rights.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createAdmin(e: FormEvent) {
    e.preventDefault();
    try {
      await post("/users", { ...form, password: form.password || undefined });
      setOk(`${ROLE_LABEL[form.role as Role]} created.`);
      setForm({ firstName: "", lastName: "", email: "", password: "", role: "ADMIN" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create that account.");
    }
  }

  async function changeRole(id: string, role: string) {
    try {
      await patch(`/users/${id}`, { role });
      setOk("Role updated.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to change that role.");
    }
  }

  const assignable = rights?.assignableRoles || [];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Rights and roles"
        subtitle="Super Admin owns the clinic. Admin runs day-to-day: staff, prices, catalogs, and reports. Station roles stay at their desk."
      />
      {error ? <Alert kind="error">{error}</Alert> : null}
      {ok ? <Alert kind="success">{ok}</Alert> : null}

      {isClinicAdmin(user?.role) ? (
        <form onSubmit={createAdmin} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold">Add Admin</h2>
          <p className="text-sm text-slate-500">
            Super Admin and clinic Admin can create Admin accounts. Only Super Admin can add another Super Admin.
          </p>
          <div className="grid gap-2 md:grid-cols-5">
            <Field label="First"><input className={inputClass} value={form.firstName} onChange={(e) => setForm((s) => ({ ...s, firstName: e.target.value }))} required /></Field>
            <Field label="Last"><input className={inputClass} value={form.lastName} onChange={(e) => setForm((s) => ({ ...s, lastName: e.target.value }))} required /></Field>
            <Field label="Email"><input className={inputClass} type="email" value={form.email} onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))} required /></Field>
            <Field label="Role">
              <select className={inputClass} value={form.role} onChange={(e) => setForm((s) => ({ ...s, role: e.target.value }))}>
                {assignable.filter((r) => r === "ADMIN" || r === "SUPER_ADMIN").map((r) => (
                  <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                ))}
              </select>
            </Field>
            <Field label="Password (blank = generate)"><input className={inputClass} value={form.password} onChange={(e) => setForm((s) => ({ ...s, password: e.target.value }))} /></Field>
          </div>
          <Button type="submit">Create account</Button>
        </form>
      ) : (
        <Alert kind="info">Clinic Admin can change station roles. Only Super Admin can add or change Super Admin accounts.</Alert>
      )}

      <Table headers={["Name", "Email", "Role", ""]}>
        {users.map((u) => (
          <tr key={u.id}>
            <td className="px-3 py-2">{u.firstName} {u.lastName}</td>
            <td className="px-3 py-2">{u.email}</td>
            <td className="px-3 py-2">{ROLE_LABEL[u.role as Role] || u.role}</td>
            <td className="px-3 py-2">
              {assignable.includes(u.role) || (isSuperAdmin(user?.role) && u.role === "SUPER_ADMIN") ? (
                <select className={inputClass} value={u.role} onChange={(e) => void changeRole(u.id, e.target.value)}>
                  {assignable.map((r) => (
                    <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                  ))}
                </select>
              ) : (
                <span className="text-xs text-slate-400">Locked</span>
              )}
            </td>
          </tr>
        ))}
      </Table>

      {rights ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Right</th>
                {COLS.map((c) => (
                  <th key={c} className="px-3 py-2">{ROLE_LABEL[c]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rights.rights.map((row) => (
                <tr key={row.area} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium text-slate-800">{row.area}</td>
                  {COLS.map((c) => (
                    <td key={c} className="px-3 py-2 text-center">{row[c] ? "Yes" : "—"}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
