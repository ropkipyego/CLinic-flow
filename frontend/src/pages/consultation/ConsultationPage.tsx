import { FormEvent, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { get, post, put } from "../../api/client";
import { Alert, Button, Empty, Field, PageHeader, Panel, StatusBadge, Table, cellClass, inputClass } from "../../components/ui";
import { MedicineSelect } from "../../components/MedicinePicker";
import { useToast } from "../../components/ToastProvider";

const TABS = ["consultation", "history", "laboratory", "pharmacy", "results", "documents"] as const;
type Tab = (typeof TABS)[number];

export function ConsultationPage() {
  const { encounterId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const toast = useToast();
  const [queue, setQueue] = useState<any[]>([]);
  const [bundle, setBundle] = useState<any>(null);
  const [tests, setTests] = useState<any[]>([]);
  const [meds, setMeds] = useState<any[]>([]);
  const [error, setError] = useState("");
  const tab = (TABS.includes(searchParams.get("tab") as Tab) ? searchParams.get("tab") : "consultation") as Tab;
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
  const emptyLine = { medicineId: "", dose: "1", frequency: "TDS", duration: "3 days", quantity: "10", instructions: "" };
  const [lines, setLines] = useState([emptyLine]);

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

  function setTab(next: Tab) {
    setSearchParams((p) => {
      p.set("tab", next);
      return p;
    });
  }

  async function saveConsult(e: FormEvent) {
    e.preventDefault();
    if (!enc) return;
    try {
      await put(`/consultations/encounters/${enc.id}`, consult);
      toast.push("Consultation saved.", "success");
      await openEncounter(enc.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save consultation.");
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
      toast.push("Vitals recorded.", "success");
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
      toast.push("Laboratory request sent.", "success");
      await openEncounter(enc.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create laboratory order.");
    }
  }

  async function prescribe(e: FormEvent) {
    e.preventDefault();
    if (!enc) return;
    const items = lines
      .filter((l) => l.medicineId)
      .map((l) => ({ ...l, quantity: Number(l.quantity) }));
    if (!items.length) {
      setError("Add at least one medicine to the treatment.");
      return;
    }
    try {
      await post(`/pharmacy/prescriptions/encounters/${enc.id}`, { items });
      setLines([emptyLine]);
      toast.push("Treatment saved.", "success");
      await openEncounter(enc.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create prescription.");
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      <aside>
        <h2 className="mb-2 text-sm font-semibold text-slate-800">Today's clinical queue</h2>
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
        {!enc ? (
          <Empty title="Select a visit from the queue to begin." body="Opening a patient file does not create a visit. Work stays on this encounter." />
        ) : (
          <>
            <PageHeader
              title={patient ? `${patient.firstName} ${patient.lastName}` : "Consultation"}
              subtitle={`${patient?.patientNumber} · ${enc.visitNumber} · ${patient?.age ?? "—"} / ${patient?.sex}`}
            />
            <div className="flex flex-wrap gap-2">
              {TABS.map((t) => (
                <Button key={t} variant={tab === t ? "primary" : "secondary"} onClick={() => setTab(t)}>
                  {t[0]!.toUpperCase() + t.slice(1)}
                </Button>
              ))}
            </div>

            {tab === "consultation" ? (
              <>
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
              </>
            ) : null}

            {tab === "history" ? (
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
            ) : null}

            {tab === "laboratory" ? (
              <Panel>
                <h3 className="mb-3 text-sm font-semibold text-slate-800">Order tests</h3>
                <input className={`${inputClass} mb-3`} value={testQuery} onChange={(e) => setTestQuery(e.target.value)} placeholder="Search tests from the clinic price list" />
                <div className="mb-3 max-h-64 space-y-1 overflow-auto rounded-lg border border-slate-200 p-2">
                  {tests
                    .filter((t) => t.name.toLowerCase().includes(testQuery.toLowerCase()))
                    .map((t) => (
                      <label key={t.id} className="flex items-center justify-between gap-3 rounded px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                        <span className="flex items-center gap-2">
                          <input type="checkbox" checked={selectedTests.includes(t.id)} onChange={(e) => setSelectedTests((s) => e.target.checked ? [...s, t.id] : s.filter((x) => x !== id(t)))} />
                          {t.name}
                        </span>
                        <span className="shrink-0 text-xs text-slate-500">KES {Number(t.price)} · {t.turnaroundTime || "—"}</span>
                      </label>
                    ))}
                </div>
                <Button onClick={() => void orderLab()}>Order selected tests</Button>
              </Panel>
            ) : null}

            {tab === "pharmacy" ? (
              <Panel>
                <h3 className="mb-3 text-sm font-semibold text-slate-800">Treatment</h3>
                {enc.prescriptions?.map((rx: any) => (
                  <div key={rx.id} className="mb-3 rounded-lg border border-slate-200 p-3 text-sm">
                    <div className="font-medium">{rx.treatmentNumber || "Treatment"} · {rx.status}</div>
                    {rx.items?.map((i: any) => (
                      <div key={i.id}>{i.medicine?.name}: {i.dose}, {i.frequency}, {i.duration} · qty {i.quantity} (dispensed {i.dispensedQty})</div>
                    ))}
                  </div>
                ))}
                <form onSubmit={prescribe} className="space-y-3">
                  {lines.map((line, idx) => (
                    <div key={idx} className="grid gap-3 md:grid-cols-3">
                      <Field label="Medicine">
                        <MedicineSelect medicines={meds} value={line.medicineId} onChange={(id) => setLines((s) => s.map((l, i) => i === idx ? { ...l, medicineId: id } : l))} required />
                      </Field>
                      <Field label="Dose"><input className={inputClass} value={line.dose} onChange={(e) => setLines((s) => s.map((l, i) => i === idx ? { ...l, dose: e.target.value } : l))} /></Field>
                      <Field label="Frequency"><input className={inputClass} value={line.frequency} onChange={(e) => setLines((s) => s.map((l, i) => i === idx ? { ...l, frequency: e.target.value } : l))} /></Field>
                      <Field label="Duration"><input className={inputClass} value={line.duration} onChange={(e) => setLines((s) => s.map((l, i) => i === idx ? { ...l, duration: e.target.value } : l))} /></Field>
                      <Field label="Quantity"><input className={inputClass} value={line.quantity} onChange={(e) => setLines((s) => s.map((l, i) => i === idx ? { ...l, quantity: e.target.value } : l))} /></Field>
                      <Field label="Instructions"><input className={inputClass} value={line.instructions} onChange={(e) => setLines((s) => s.map((l, i) => i === idx ? { ...l, instructions: e.target.value } : l))} /></Field>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <Button type="button" variant="secondary" onClick={() => setLines((s) => [...s, emptyLine])}>Add medicine</Button>
                    <Button type="submit">Save treatment</Button>
                  </div>
                </form>
              </Panel>
            ) : null}

            {tab === "results" ? (
              <Panel>
                <h3 className="mb-3 text-sm font-semibold">Laboratory results</h3>
                {enc.labOrders?.flatMap((o: any) => o.items).map((i: any) => {
                  const result = i.result;
                  const verified = Boolean(result?.verifiedAt);
                  return (
                    <div key={i.id} className="mb-2 text-sm">
                      {i.labTest.name}: {result ? (result.valueText ?? result.valueNumeric) : "Pending"}
                      {result && !verified ? <span className="ml-2 text-amber-700">draft — not final</span> : null}
                      {verified ? (
                        <Link className="ml-2 text-[var(--brand)]" to={`/laboratory/results/${result.id}`}>Open report</Link>
                      ) : null}
                    </div>
                  );
                })}
              </Panel>
            ) : null}

            {tab === "documents" ? (
              <Panel>
                <p className="text-sm text-slate-600">Verified laboratory reports for this visit can be printed from Results.</p>
              </Panel>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function id(t: { id: string }) {
  return t.id;
}

function num(v: string) {
  return v === "" ? null : Number(v);
}
