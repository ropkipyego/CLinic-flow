import { FormEvent, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { get, post, put } from "../../api/client";
import { Alert, Button, Empty, Field, PageHeader, Panel, StatusBadge, Table, cellClass, inputClass } from "../../components/ui";

export function ConsultationPage() {
  const { encounterId } = useParams();
  const [queue, setQueue] = useState<any[]>([]);
  const [bundle, setBundle] = useState<any>(null);
  const [tests, setTests] = useState<any[]>([]);
  const [meds, setMeds] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [consult, setConsult] = useState({
    chiefComplaint: "",
    historyOfPresentingComplaint: "",
    examination: "",
    assessment: "",
    plan: "",
  });
  const [vitals, setVitals] = useState({ systolicBp: "", diastolicBp: "", pulse: "", temperature: "", spo2: "", respiratoryRate: "", weightKg: "", heightCm: "" });
  const [dx, setDx] = useState({ name: "", icd10Code: "" });
  const [selectedTests, setSelectedTests] = useState<string[]>([]);
  const [testQuery, setTestQuery] = useState("");
  const [rx, setRx] = useState({ medicineId: "", dose: "1", frequency: "TDS", duration: "3 days", quantity: "10", instructions: "" });

  async function loadQueue() {
    setQueue(await get("/encounters"));
  }

  async function openEncounter(id: string) {
    const data = await get<any>(`/encounters/${id}/clinical`);
    setBundle(data);
    const c = data.encounter.consultation;
    if (c) {
      setConsult({
        chiefComplaint: c.chiefComplaint || "",
        historyOfPresentingComplaint: c.historyOfPresentingComplaint || "",
        examination: c.examination || "",
        assessment: c.assessment || "",
        plan: c.plan || "",
      });
    }
  }

  useEffect(() => {
    Promise.all([loadQueue(), get("/lab/tests?active=true"), get("/pharmacy/medicines?active=true")])
      .then(([, t, m]) => {
        setTests(t as any[]);
        setMeds(m as any[]);
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (encounterId) void openEncounter(encounterId).catch((e) => setError(e.message));
  }, [encounterId]);

  const enc = bundle?.encounter;
  const patient = enc?.patient;

  async function saveConsult(e: FormEvent) {
    e.preventDefault();
    if (!enc) return;
    try {
      await put(`/consultations/encounters/${enc.id}`, consult);
      setOk("Consultation saved.");
      await openEncounter(enc.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save consultation. Please check your connection and try again.");
    }
  }

  async function saveVitals(e: FormEvent) {
    e.preventDefault();
    if (!enc) return;
    try {
      await post(`/vitals/encounters/${enc.id}`, {
        systolicBp: num(vitals.systolicBp),
        diastolicBp: num(vitals.diastolicBp),
        pulse: num(vitals.pulse),
        temperature: num(vitals.temperature),
        spo2: num(vitals.spo2),
        respiratoryRate: num(vitals.respiratoryRate),
        weightKg: num(vitals.weightKg),
        heightCm: num(vitals.heightCm),
      });
      setOk("Vitals recorded.");
      await openEncounter(enc.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save vitals.");
    }
  }

  async function addDx(e: FormEvent) {
    e.preventDefault();
    if (!enc) return;
    try {
      await post(`/diagnoses/encounters/${enc.id}`, dx);
      setDx({ name: "", icd10Code: "" });
      await openEncounter(enc.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save diagnosis.");
    }
  }

  async function orderLab() {
    if (!enc || !selectedTests.length) return;
    try {
      await post(`/lab/orders/encounters/${enc.id}`, { labTestIds: selectedTests });
      setSelectedTests([]);
      setOk("Laboratory request sent.");
      await openEncounter(enc.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create laboratory order.");
    }
  }

  async function prescribe(e: FormEvent) {
    e.preventDefault();
    if (!enc) return;
    try {
      await post(`/pharmacy/prescriptions/encounters/${enc.id}`, {
        items: [{ ...rx, quantity: Number(rx.quantity) }],
      });
      setOk("Prescription created.");
      await openEncounter(enc.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create prescription.");
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      <aside>
        <h2 className="mb-2 text-sm font-semibold text-slate-800">Today's queue</h2>
        {queue.length === 0 ? <Empty title="No visits in today's queue." /> : (
          <ul className="space-y-1">
            {queue.map((e) => (
              <li key={e.id}>
                <button
                  className={`w-full rounded-lg border px-3 py-2.5 text-left text-sm ${enc?.id === e.id ? "border-[var(--brand)] bg-white" : "border-transparent hover:bg-white"}`}
                  onClick={() => void openEncounter(e.id)}
                >
                  <div className="font-medium text-slate-900">{e.patient.name}</div>
                  <div className="text-xs text-slate-500">{e.visitNumber}</div>
                  <div className="mt-1"><StatusBadge status={e.status} /></div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>
      <div className="space-y-4">
        {error ? <Alert kind="error">{error}</Alert> : null}
        {ok ? <Alert kind="success">{ok}</Alert> : null}
        {!enc ? (
          <Empty title="Select a visit from the queue to begin." body="Vitals, notes, lab requests, and prescriptions stay on this encounter." />
        ) : (
          <>
            <PageHeader
              title={patient ? `${patient.firstName} ${patient.lastName}` : "Consultation"}
              subtitle={`${patient?.patientNumber} · ${enc.visitNumber} · ${patient?.age ?? "—"} / ${patient?.sex}`}
            />
            <Panel>
              <h3 className="mb-3 text-sm font-semibold text-slate-800">Vitals</h3>
              <form onSubmit={saveVitals} className="grid gap-3 md:grid-cols-4">
                {([
                  ["systolicBp", "BP systolic"],
                  ["diastolicBp", "BP diastolic"],
                  ["pulse", "Pulse"],
                  ["temperature", "Temp °C"],
                  ["spo2", "SpO2 %"],
                  ["respiratoryRate", "Resp. rate"],
                  ["weightKg", "Weight kg"],
                  ["heightCm", "Height cm"],
                ] as const).map(([k, label]) => (
                  <Field key={k} label={label}>
                    <input className={inputClass} value={vitals[k]} onChange={(e) => setVitals((s) => ({ ...s, [k]: e.target.value }))} />
                  </Field>
                ))}
                <div className="self-end"><Button type="submit">Save vitals</Button></div>
              </form>
            </Panel>
            <Panel>
              <h3 className="mb-3 text-sm font-semibold text-slate-800">Consultation notes</h3>
              <form onSubmit={saveConsult} className="space-y-3">
                {([
                  ["chiefComplaint", "Chief complaint"],
                  ["historyOfPresentingComplaint", "History of presenting complaint"],
                  ["examination", "Examination"],
                  ["assessment", "Assessment"],
                  ["plan", "Plan"],
                ] as const).map(([k, label]) => (
                  <Field key={k} label={label}>
                    <textarea className={inputClass} rows={2} value={consult[k]} onChange={(e) => setConsult((s) => ({ ...s, [k]: e.target.value }))} />
                  </Field>
                ))}
                <Button type="submit">Save consultation</Button>
              </form>
            </Panel>
            <Panel>
              <h3 className="mb-3 text-sm font-semibold text-slate-800">Diagnosis</h3>
              <form onSubmit={addDx} className="flex flex-wrap gap-2">
                <Field label="Diagnosis"><input className={inputClass} value={dx.name} onChange={(e) => setDx((s) => ({ ...s, name: e.target.value }))} required /></Field>
                <Field label="ICD-10 (optional)"><input className={inputClass} value={dx.icd10Code} onChange={(e) => setDx((s) => ({ ...s, icd10Code: e.target.value }))} /></Field>
                <div className="self-end"><Button type="submit">Add</Button></div>
              </form>
            </Panel>
            <Panel>
              <h3 className="mb-3 text-sm font-semibold text-slate-800">Laboratory</h3>
              <input className={`${inputClass} mb-3`} value={testQuery} onChange={(e) => setTestQuery(e.target.value)} placeholder="Search tests from the clinic price list" />
              <div className="mb-3 max-h-64 space-y-1 overflow-auto rounded-lg border border-slate-200 p-2">
                {tests
                  .filter((t) => t.name.toLowerCase().includes(testQuery.toLowerCase()))
                  .map((t) => (
                    <label key={t.id} className="flex items-center justify-between gap-3 rounded px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                      <span className="flex items-center gap-2">
                        <input type="checkbox" checked={selectedTests.includes(t.id)} onChange={(e) => setSelectedTests((s) => e.target.checked ? [...s, t.id] : s.filter((x) => x !== t.id))} />
                        {t.name}
                      </span>
                      <span className="shrink-0 text-xs text-slate-500">KES {Number(t.price)} · {t.turnaroundTime || "—"}</span>
                    </label>
                  ))}
              </div>
              <Button onClick={() => void orderLab()}>Order selected tests</Button>
              {enc.labOrders?.map((o: any) => (
                <div key={o.id} className="mt-3 space-y-1 text-sm text-slate-700">
                  {o.items.map((i: any) => (
                    <div key={i.id}>{i.labTest.name}: {i.result ? i.result.valueText ?? i.result.valueNumeric : "Pending"}</div>
                  ))}
                </div>
              ))}
            </Panel>
            <Panel>
              <h3 className="mb-3 text-sm font-semibold text-slate-800">Prescription</h3>
              <form onSubmit={prescribe} className="grid gap-3 md:grid-cols-3">
              <Field label="Medicine">
                <select className={inputClass} value={rx.medicineId} onChange={(e) => setRx((s) => ({ ...s, medicineId: e.target.value }))} required>
                  <option value="">Select</option>
                  {meds.map((m) => <option key={m.id} value={m.id}>{m.name} {m.strength}</option>)}
                </select>
              </Field>
              <Field label="Dose"><input className={inputClass} value={rx.dose} onChange={(e) => setRx((s) => ({ ...s, dose: e.target.value }))} /></Field>
              <Field label="Frequency"><input className={inputClass} value={rx.frequency} onChange={(e) => setRx((s) => ({ ...s, frequency: e.target.value }))} /></Field>
              <Field label="Duration"><input className={inputClass} value={rx.duration} onChange={(e) => setRx((s) => ({ ...s, duration: e.target.value }))} /></Field>
              <Field label="Quantity"><input className={inputClass} value={rx.quantity} onChange={(e) => setRx((s) => ({ ...s, quantity: e.target.value }))} /></Field>
              <Field label="Instructions"><input className={inputClass} value={rx.instructions} onChange={(e) => setRx((s) => ({ ...s, instructions: e.target.value }))} /></Field>
              <div className="self-end"><Button type="submit">Prescribe</Button></div>
            </form>
            </Panel>
            <div>
              <h3 className="mb-2 font-medium">Previous visits</h3>
              {bundle.history?.length ? (
                <Table headers={["Visit", "Assessment", "Diagnoses"]}>
                  {bundle.history.map((h: any) => (
                    <tr key={h.id} className="hover:bg-slate-50">
                      <td className={cellClass}>{h.visitNumber}</td>
                      <td className={cellClass}>{h.consultation?.assessment || "—"}</td>
                      <td className={cellClass}>{h.diagnoses.map((d: any) => d.name).join(", ")}</td>
                    </tr>
                  ))}
                </Table>
              ) : <Empty title="No previous encounters." />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function num(v: string) {
  return v === "" ? null : Number(v);
}
