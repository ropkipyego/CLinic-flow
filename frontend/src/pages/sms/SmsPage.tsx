import { FormEvent, useEffect, useState } from "react";
import { get, post } from "../../api/client";
import { Alert, Button, Empty, Field, PageHeader, StatusBadge, Table, inputClass } from "../../components/ui";

export function SmsPage() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [status, setStatus] = useState<any>(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", message: "", phones: "" });
  const [selected, setSelected] = useState<string[]>([]);

  async function load() {
    try {
      setCampaigns(await get("/sms/campaigns"));
      setPatients(await get("/patients"));
      setStatus(await get("/sms/status"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load SMS module.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    try {
      const extra = form.phones.split(",").map((s) => s.trim()).filter(Boolean);
      const campaign = await post<any>("/sms/campaigns", {
        name: form.name,
        message: form.message,
        recipientPhones: extra,
        recipientPatientIds: selected,
      });
      await post(`/sms/campaigns/${campaign.id}/queue`);
      setForm({ name: "", message: "", phones: "" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to queue SMS campaign.");
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Bulk SMS" subtitle={status?.enabled ? `Provider: ${status.provider}` : "SMS is disabled. Campaigns queue but will not send until SMS_ENABLED=true."} />
      {error ? <Alert kind="error">{error}</Alert> : null}
      <form onSubmit={create} className="space-y-2 rounded-md border bg-white p-4">
        <Field label="Campaign name"><input className={inputClass} value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} required /></Field>
        <Field label="Message"><textarea className={inputClass} rows={3} value={form.message} onChange={(e) => setForm((s) => ({ ...s, message: e.target.value }))} required /></Field>
        <Field label="Extra phones (comma separated)"><input className={inputClass} value={form.phones} onChange={(e) => setForm((s) => ({ ...s, phones: e.target.value }))} /></Field>
        <div className="max-h-40 overflow-auto text-sm">
          {patients.map((p) => (
            <label key={p.id} className="mr-3 block">
              <input type="checkbox" checked={selected.includes(p.id)} onChange={(e) => setSelected((s) => e.target.checked ? [...s, p.id] : s.filter((x) => x !== p.id))} /> {p.name} {p.phone}
            </label>
          ))}
        </div>
        <Button type="submit">Preview & queue campaign</Button>
      </form>
      {campaigns.length === 0 ? <Empty title="No SMS campaigns yet." /> : (
        <Table headers={["Name", "Status", "Sent", "Failed"]}>
          {campaigns.map((c) => (
            <tr key={c.id}>
              <td className="px-3 py-2">{c.name}</td>
              <td className="px-3 py-2"><StatusBadge status={c.status} /></td>
              <td className="px-3 py-2">{c.sentCount}</td>
              <td className="px-3 py-2">{c.failedCount}</td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
