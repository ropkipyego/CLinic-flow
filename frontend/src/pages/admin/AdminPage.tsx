import { FormEvent, useEffect, useState } from "react";
import { get, patch, post } from "../../api/client";
import { Alert, Button, Field, PageHeader, Table, inputClass } from "../../components/ui";
import { Icons } from "../../components/icons";
import { ROLE_LABEL } from "../../lib/labels";
import { useUiState } from "../../lib/uiState";

const STAFF_ROLES = ["RECEPTION", "DOCTOR", "LAB", "PHARMACY", "CASHIER"] as const;

function suggestedEmail(clinicEmail: string | null, firstName: string, role: string) {
  const domain = clinicEmail?.split("@")[1] || "clinic.local";
  const local = (firstName || role).toLowerCase().replace(/[^a-z0-9]/g, "") || role.toLowerCase();
  return `${local}@${domain}`;
}

function randomPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), (n) => chars[n % chars.length]).join("");
}

export function AdminPage() {
  const [tab, setTab] = useUiState<"clinic" | "users" | "services" | "audit">("admin.tab", "users");
  const [tenant, setTenant] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [createdSecret, setCreatedSecret] = useState("");
  const [userForm, setUserForm] = useState({
    email: "",
    password: "",
    firstName: "",
    lastName: "",
    role: "RECEPTION",
  });

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
      setOk("Clinic details saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save clinic configuration.");
    }
  }

  async function addUser(e: FormEvent) {
    e.preventDefault();
    try {
      const created = await post<any>("/users", {
        ...userForm,
        password: userForm.password || undefined,
      });
      setCreatedSecret(created.temporaryPassword || userForm.password);
      setOk(`${created.role === "ADMIN" ? "Super Admin" : ROLE_LABEL[created.role as keyof typeof ROLE_LABEL]} ${created.email} created. A welcome email was queued.`);
      setUserForm({ email: "", password: "", firstName: "", lastName: "", role: "RECEPTION" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create user.");
    }
  }

  async function toggleActive(user: any) {
    try {
      await patch(`/users/${user.id}`, { active: !user.active });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update that account.");
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

  function fillEmail() {
    setUserForm((s) => ({ ...s, email: suggestedEmail(tenant?.email, s.firstName, s.role) }));
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Administration"
        subtitle="The Super Admin is the only account that creates staff, sets prices, and reads the audit trail. Go-live starts here."
      />
      <div className="flex flex-wrap gap-2">
        {([
          ["users", "Staff"],
          ["clinic", "Clinic"],
          ["services", "Services"],
          ["audit", "Audit log"],
        ] as const).map(([t, label]) => (
          <Button key={t} variant={tab === t ? "primary" : "secondary"} onClick={() => setTab(t)}>{label}</Button>
        ))}
      </div>
      {error ? <Alert kind="error">{error}</Alert> : null}
      {ok ? <Alert kind="success">{ok}</Alert> : null}

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
          <form onSubmit={addUser} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Icons.userPlus /> Create staff (Super Admin only)
            </h2>
            <p className="text-sm text-slate-500">
              Go-live uses this Super Admin account. Create reception, doctor, lab, pharmacy, and cashier users here. Emails should use the clinic domain so they stay consistent.
            </p>
            <div className="grid gap-2 md:grid-cols-3">
              <Field label="First"><input className={inputClass} value={userForm.firstName} onChange={(e) => setUserForm((s) => ({ ...s, firstName: e.target.value }))} required /></Field>
              <Field label="Last"><input className={inputClass} value={userForm.lastName} onChange={(e) => setUserForm((s) => ({ ...s, lastName: e.target.value }))} required /></Field>
              <Field label="Role">
                <select className={inputClass} value={userForm.role} onChange={(e) => setUserForm((s) => ({ ...s, role: e.target.value }))}>
                  {STAFF_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                </select>
              </Field>
              <Field label="Email">
                <input className={inputClass} value={userForm.email} onChange={(e) => setUserForm((s) => ({ ...s, email: e.target.value }))} required />
              </Field>
              <div className="self-end">
                <Button variant="secondary" onClick={fillEmail}>Use clinic domain</Button>
              </div>
              <Field label="Password (blank = generate)">
                <div className="flex gap-2">
                  <input className={inputClass} value={userForm.password} onChange={(e) => setUserForm((s) => ({ ...s, password: e.target.value }))} />
                  <Button variant="secondary" onClick={() => setUserForm((s) => ({ ...s, password: randomPassword() }))}>Generate</Button>
                </div>
              </Field>
            </div>
            <Button type="submit"><Icons.mail /> Create and send welcome email</Button>
            {createdSecret ? (
              <Alert kind="info">Temporary password (copy now): <strong>{createdSecret}</strong></Alert>
            ) : null}
          </form>
          <Table headers={["Name", "Email", "Role", "Active", ""]}>
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-slate-50">
                <td className="px-3 py-2">{u.firstName} {u.lastName}</td>
                <td className="px-3 py-2">{u.email}</td>
                <td className="px-3 py-2">{u.role === "ADMIN" ? "Super Admin" : ROLE_LABEL[u.role as keyof typeof ROLE_LABEL]}</td>
                <td className="px-3 py-2">{u.active ? "Yes" : "No"}</td>
                <td className="px-3 py-2">
                  {u.role === "ADMIN" ? (
                    <span className="text-xs text-slate-400">Clinic Super Admin</span>
                  ) : (
                    <Button variant="ghost" onClick={() => void toggleActive(u)}>{u.active ? "Deactivate" : "Activate"}</Button>
                  )}
                </td>
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
