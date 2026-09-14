import { FormEvent, useEffect, useState } from "react";
import { get, patch, post } from "../../api/client";
import { Alert, Button, Field, PageHeader, Table, inputClass } from "../../components/ui";

export function AdminPage() {
  const [tab, setTab] = useState<"clinic" | "users" | "services" | "audit">("clinic");
  const [tenant, setTenant] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [userForm, setUserForm] = useState({ email: "", password: "Password123!", firstName: "", lastName: "", role: "RECEPTION" });

  async function load() {
    try {
      setTenant(await get("/tenants/current"));
      setUsers(await get("/users"));
      setServices(await get("/services"));
      setAudit(await get("/audit"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load administration data.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function saveClinic(e: FormEvent) {
    e.preventDefault();
    try {
      setTenant(await patch("/tenants/current", tenant));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save clinic configuration.");
    }
  }

  async function addUser(e: FormEvent) {
    e.preventDefault();
    try {
      await post("/users", userForm);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create user.");
    }
  }

  async function saveService(s: any) {
    try {
      await patch(`/services/${s.id}`, { name: s.name, code: s.code, category: s.category, price: Number(s.price), active: s.active });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update service price.");
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Administration" subtitle="Clinic details, users, prices, and the audit trail. Prices always come from the database." />
      <div className="flex gap-2">
        {([
          ["clinic", "Clinic"],
          ["users", "Users"],
          ["services", "Services"],
          ["audit", "Audit log"],
        ] as const).map(([t, label]) => (
          <Button key={t} variant={tab === t ? "primary" : "secondary"} onClick={() => setTab(t)}>{label}</Button>
        ))}
      </div>
      {error ? <Alert kind="error">{error}</Alert> : null}
      {tab === "clinic" && tenant ? (
        <form onSubmit={saveClinic} className="grid max-w-2xl gap-2 md:grid-cols-2">
          {([
            ["name", "Clinic name"],
            ["phone", "Phone"],
            ["email", "Email"],
            ["address", "Address"],
            ["website", "Website"],
            ["receiptFooter", "Receipt footer"],
            ["smsSenderId", "SMS sender ID"],
            ["timezone", "Timezone"],
            ["currency", "Currency"],
            ["primaryColor", "Primary color"],
            ["secondaryColor", "Secondary color"],
          ] as const).map(([k, label]) => (
            <Field key={k} label={label}>
              <input className={inputClass} value={tenant[k] || ""} onChange={(e) => setTenant((s: any) => ({ ...s, [k]: e.target.value }))} />
            </Field>
          ))}
          <div className="self-end"><Button type="submit">Save clinic</Button></div>
        </form>
      ) : null}
      {tab === "users" ? (
        <>
          <form onSubmit={addUser} className="grid gap-2 md:grid-cols-5">
            <Field label="First"><input className={inputClass} value={userForm.firstName} onChange={(e) => setUserForm((s) => ({ ...s, firstName: e.target.value }))} /></Field>
            <Field label="Last"><input className={inputClass} value={userForm.lastName} onChange={(e) => setUserForm((s) => ({ ...s, lastName: e.target.value }))} /></Field>
            <Field label="Email"><input className={inputClass} value={userForm.email} onChange={(e) => setUserForm((s) => ({ ...s, email: e.target.value }))} /></Field>
            <Field label="Role">
              <select className={inputClass} value={userForm.role} onChange={(e) => setUserForm((s) => ({ ...s, role: e.target.value }))}>
                <option>ADMIN</option><option>RECEPTION</option><option>DOCTOR</option><option>LAB</option><option>PHARMACY</option><option>CASHIER</option>
              </select>
            </Field>
            <div className="self-end"><Button type="submit">Add user</Button></div>
          </form>
          <Table headers={["Name", "Email", "Role", "Active"]}>
            {users.map((u) => (
              <tr key={u.id}>
                <td className="px-3 py-2">{u.firstName} {u.lastName}</td>
                <td className="px-3 py-2">{u.email}</td>
                <td className="px-3 py-2">{u.role}</td>
                <td className="px-3 py-2">{u.active ? "Yes" : "No"}</td>
              </tr>
            ))}
          </Table>
        </>
      ) : null}
      {tab === "services" ? (
        <Table headers={["Name", "Code", "Category", "Price", ""]}>
          {services.map((s) => (
            <tr key={s.id}>
              <td className="px-3 py-2">{s.name}</td>
              <td className="px-3 py-2">{s.code}</td>
              <td className="px-3 py-2">{s.category}</td>
              <td className="px-3 py-2">
                <input className={inputClass} defaultValue={s.price} onBlur={(e) => void saveService({ ...s, price: e.target.value })} />
              </td>
              <td className="px-3 py-2">{s.active ? "Active" : "Inactive"}</td>
            </tr>
          ))}
        </Table>
      ) : null}
      {tab === "audit" ? (
        <Table headers={["Time", "User", "Action", "Entity"]}>
          {audit.map((a) => (
            <tr key={a.id}>
              <td className="px-3 py-2">{new Date(a.createdAt).toLocaleString()}</td>
              <td className="px-3 py-2">{a.user ? `${a.user.firstName} ${a.user.lastName}` : "—"}</td>
              <td className="px-3 py-2">{a.action}</td>
              <td className="px-3 py-2">{a.entity}</td>
            </tr>
          ))}
        </Table>
      ) : null}
    </div>
  );
}
