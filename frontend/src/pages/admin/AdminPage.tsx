import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { get, patch, post } from "../../api/client";
import { Alert, Button, Field, PageHeader, Table, inputClass } from "../../components/ui";
import { Icons } from "../../components/icons";
import { ROLE_LABEL } from "../../lib/labels";
import { useUiState } from "../../lib/uiState";
import { SERVICE_CATEGORIES, isSuperAdmin } from "../../lib/roles";
import { useAuth, type Role } from "../../auth/AuthContext";

const STAFF_ROLES = ["ADMIN", "RECEPTION", "DOCTOR", "LAB", "PHARMACY", "CASHIER"] as const;

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
  const { user } = useAuth();
  const [tab, setTab] = useUiState<"clinic" | "users" | "services" | "audit">("admin.tab", "users");
  const [serviceForm, setServiceForm] = useState({ name: "", code: "", category: "CONSULTATION", price: "", active: true });
  const [editingService, setEditingService] = useState<string | null>(null);
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
      setOk(`${ROLE_LABEL[created.role as Role] || created.role} ${created.email} created. A welcome email was queued.`);
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

  async function saveService(e?: FormEvent, existing?: any) {
    e?.preventDefault();
    const payload = existing
      ? { name: existing.name, code: existing.code, category: existing.category, price: Number(existing.price), active: existing.active }
      : { ...serviceForm, price: Number(serviceForm.price), code: serviceForm.code.toUpperCase() };
    if (!payload.name || !payload.code || Number.isNaN(payload.price)) {
      setError("Name, code, and a valid price are required.");
      return;
    }
    try {
      if (existing?.id) await patch(`/services/${existing.id}`, payload);
      else await post("/services", payload);
      setOk(existing?.id ? "Service updated." : "Service added.");
      setServiceForm({ name: "", code: "", category: "CONSULTATION", price: "", active: true });
      setEditingService(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save service.");
    }
  }

  function fillEmail() {
    setUserForm((s) => ({ ...s, email: suggestedEmail(tenant?.email, s.firstName, s.role) }));
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Administration"
        subtitle="Super Admin and clinic Admin set prices, staff, and clinic details. Station roles stay on their desks."
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
              <Icons.userPlus /> Create staff
            </h2>
            <p className="text-sm text-slate-500">
              Super Admin and clinic Admin can add Admins. Station roles stay at their desks. Use the clinic domain for emails.
            </p>
            <div className="grid gap-2 md:grid-cols-3">
              <Field label="First"><input className={inputClass} value={userForm.firstName} onChange={(e) => setUserForm((s) => ({ ...s, firstName: e.target.value }))} required /></Field>
              <Field label="Last"><input className={inputClass} value={userForm.lastName} onChange={(e) => setUserForm((s) => ({ ...s, lastName: e.target.value }))} required /></Field>
              <Field label="Role">
                <select className={inputClass} value={userForm.role} onChange={(e) => setUserForm((s) => ({ ...s, role: e.target.value }))}>
                  {(isSuperAdmin(user?.role) ? ["SUPER_ADMIN", "ADMIN", ...STAFF_ROLES.filter((r) => r !== "ADMIN")] : ["ADMIN", ...STAFF_ROLES.filter((r) => r !== "ADMIN")]).map((r) => (
                    <option key={r} value={r}>{ROLE_LABEL[r as Role]}</option>
                  ))}
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
                <td className="px-3 py-2">{ROLE_LABEL[u.role as Role] || u.role}</td>
                <td className="px-3 py-2">{u.active ? "Yes" : "No"}</td>
                <td className="px-3 py-2">
                  {u.role === "SUPER_ADMIN" && !isSuperAdmin(user?.role) ? (
                    <span className="text-xs text-slate-400">Super Admin</span>
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
        <div className="space-y-4">
          <form onSubmit={(e) => void saveService(e)} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold">Add a billable service</h2>
            <p className="text-sm text-slate-500">
              To search and change an existing price, open the <Link className="font-medium text-[var(--brand)] underline" to="/admin/prices">Price list</Link>.
            </p>
            <div className="grid gap-2 md:grid-cols-5">
              <Field label="Name"><input className={inputClass} value={serviceForm.name} onChange={(e) => setServiceForm((s) => ({ ...s, name: e.target.value }))} required /></Field>
              <Field label="Code"><input className={inputClass} value={serviceForm.code} onChange={(e) => setServiceForm((s) => ({ ...s, code: e.target.value }))} required /></Field>
              <Field label="Category">
                <select className={inputClass} value={serviceForm.category} onChange={(e) => setServiceForm((s) => ({ ...s, category: e.target.value }))}>
                  {SERVICE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Price (KES)"><input className={inputClass} inputMode="decimal" value={serviceForm.price} onChange={(e) => setServiceForm((s) => ({ ...s, price: e.target.value }))} required /></Field>
              <div className="self-end"><Button type="submit">Add service</Button></div>
            </div>
          </form>
          <Table headers={["Name", "Code", "Category", "Price", "Active", ""]}>
            {services.map((s) => (
              <tr key={s.id}>
                {editingService === s.id ? (
                  <>
                    <td className="px-3 py-2"><input className={inputClass} defaultValue={s.name} onChange={(e) => { s.name = e.target.value; }} /></td>
                    <td className="px-3 py-2"><input className={inputClass} defaultValue={s.code} onChange={(e) => { s.code = e.target.value; }} /></td>
                    <td className="px-3 py-2">
                      <select className={inputClass} defaultValue={s.category} onChange={(e) => { s.category = e.target.value; }}>
                        {SERVICE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2"><input className={inputClass} defaultValue={s.price} onChange={(e) => { s.price = e.target.value; }} /></td>
                    <td className="px-3 py-2">
                      <select className={inputClass} defaultValue={s.active ? "yes" : "no"} onChange={(e) => { s.active = e.target.value === "yes"; }}>
                        <option value="yes">Active</option>
                        <option value="no">Inactive</option>
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <Button onClick={() => void saveService(undefined, s)}>Save</Button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-3 py-2">{s.name}</td>
                    <td className="px-3 py-2">{s.code}</td>
                    <td className="px-3 py-2">{s.category}</td>
                    <td className="px-3 py-2">{s.price}</td>
                    <td className="px-3 py-2">{s.active ? "Active" : "Inactive"}</td>
                    <td className="px-3 py-2"><Button variant="secondary" onClick={() => setEditingService(s.id)}>Edit</Button></td>
                  </>
                )}
              </tr>
            ))}
          </Table>
        </div>
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
