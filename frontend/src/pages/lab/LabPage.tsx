import { useEffect, useState } from "react";
import { get, post } from "../../api/client";
import { Alert, Button, Empty, Field, PageHeader, StatusBadge, Table, inputClass } from "../../components/ui";

export function LabPage() {
  const [queue, setQueue] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [error, setError] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});

  async function load() {
    try {
      setQueue(await get("/lab/queue"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load laboratory queue.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function saveResult(item: any) {
    try {
      const payload = item.labTest.resultType === "NUMERIC"
        ? { valueNumeric: Number(values[item.id]) }
        : { valueText: values[item.id] };
      await post(`/lab/results/items/${item.id}`, payload);
      const refreshed = await get(`/lab/orders/${selected.id}`);
      setSelected(refreshed);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save laboratory result.");
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Laboratory" subtitle="Requests from consultation. Enter results so the doctor can see them on the same visit." />
      {error ? <Alert kind="error">{error}</Alert> : null}
      {queue.length === 0 ? <Empty title="No pending laboratory requests." /> : (
        <Table headers={["Patient", "Visit", "Tests", "Time", "Status", ""]}>
          {queue.map((o) => (
            <tr key={o.id}>
              <td className="px-3 py-2">{o.patient.firstName} {o.patient.lastName}</td>
              <td className="px-3 py-2">{o.encounter.visitNumber}</td>
              <td className="px-3 py-2">{o.items.map((i: any) => `${i.labTest.name}${i.labTest.turnaroundTime ? ` (${i.labTest.turnaroundTime})` : ""}`).join(", ")}</td>
              <td className="px-3 py-2">{new Date(o.createdAt).toLocaleTimeString()}</td>
              <td className="px-3 py-2"><StatusBadge status={o.status} /></td>
              <td className="px-3 py-2"><Button variant="secondary" onClick={() => setSelected(o)}>Open</Button></td>
            </tr>
          ))}
        </Table>
      )}
      {selected ? (
        <div className="rounded-md border bg-white p-4">
          <h2 className="mb-3 font-medium">Enter results — {selected.encounter.visitNumber}</h2>
          {selected.items.map((item: any) => (
            <div key={item.id} className="mb-3 grid gap-2 md:grid-cols-[1fr_1fr_auto]">
              <div className="text-sm">{item.labTest.name} {item.labTest.referenceRange ? `(${item.labTest.referenceRange})` : ""}</div>
              {item.result ? (
                <div className="text-sm">Result: {item.result.valueText ?? item.result.valueNumeric}</div>
              ) : (
                <Field label="Result">
                  {item.labTest.resultType === "POSITIVE_NEGATIVE" || item.labTest.resultType === "SELECT" ? (
                    <select className={inputClass} value={values[item.id] || ""} onChange={(e) => setValues((s) => ({ ...s, [item.id]: e.target.value }))}>
                      <option value="">Select</option>
                      {(item.labTest.selectOptions || ["Positive", "Negative"]).map((o: string) => <option key={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input className={inputClass} value={values[item.id] || ""} onChange={(e) => setValues((s) => ({ ...s, [item.id]: e.target.value }))} />
                  )}
                </Field>
              )}
              {!item.result ? <div className="self-end"><Button onClick={() => void saveResult(item)}>Save result</Button></div> : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
