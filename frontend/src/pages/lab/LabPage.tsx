import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { get, patch, post } from "../../api/client";
import { Alert, Button, Empty, Field, PageHeader, StatusBadge, Table, inputClass } from "../../components/ui";
import { Icons } from "../../components/icons";
import { useAuth } from "../../auth/AuthContext";
import { useUiState } from "../../lib/uiState";
import { emptyWalkInClient, WalkInClientFields, walkInPayload } from "../../components/WalkInClientFields";
import { ApiRequestError } from "../../api/client";
import { isClinicAdmin, LAB_TEST_CATEGORIES } from "../../lib/roles";

export function LabPage() {
  const { user } = useAuth();
  const [queue, setQueue] = useState<any[]>([]);
  const [tests, setTests] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [walkIn, setWalkIn] = useState(emptyWalkInClient());
  const [picked, setPicked] = useState<string[]>([]);
  const [showWalkIn, setShowWalkIn] = useUiState("lab.walkin.open", true);
  const [tab, setTab] = useUiState<"queue" | "catalog">("lab.tab", "queue");
  const [allTests, setAllTests] = useState<any[]>([]);
  const [testForm, setTestForm] = useState({ name: "", code: "", category: "RAPID", price: "", resultType: "TEXT", turnaroundTime: "", referenceRange: "" });
  const [editingTest, setEditingTest] = useState<string | null>(null);
  const canResults = isClinicAdmin(user?.role) || user?.role === "LAB";
  const canWalkIn = isClinicAdmin(user?.role) || user?.role === "LAB" || user?.role === "RECEPTION";
  const canCatalog = isClinicAdmin(user?.role) || user?.role === "LAB";

  async function load() {
    try {
      const [q, catalog, full] = await Promise.all([
        get("/lab/queue"),
        get("/lab/tests?active=true").catch(() => []),
        get("/lab/tests").catch(() => []),
      ]);
      setQueue(q as any[]);
      setTests(catalog as any[]);
      setAllTests(full as any[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load laboratory queue.");
    }
  }

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 30000);
    return () => window.clearInterval(id);
  }, []);

  async function saveResult(item: any) {
    try {
      const payload = item.labTest.resultType === "NUMERIC"
        ? { valueNumeric: Number(values[item.id]) }
        : { valueText: values[item.id] };
      await post(`/lab/results/items/${item.id}`, payload);
      const refreshed = await get(`/lab/orders/${selected.id}`);
      setSelected(refreshed);
      setOk("Result saved.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save laboratory result.");
    }
  }

  async function createWalkIn(e: FormEvent) {
    e.preventDefault();
    if (!picked.length) {
      setError("Select at least one test.");
      return;
    }
    try {
      const created = await post<any>("/lab/walk-in", {
        client: walkInPayload(walkIn),
        labTestIds: picked,
      });
      setOk(`Walk-in ${created.encounter?.visitNumber || "visit"} created. Tests only — no consultation fee. Send the patient to cashier when ready.`);
      setWalkIn(emptyWalkInClient());
      setPicked([]);
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Unable to create the walk-in lab visit.");
    }
  }

  function toggleTest(id: string) {
    setPicked((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  async function saveTest(e?: FormEvent, existing?: any) {
    e?.preventDefault();
    const body = existing
      ? { name: existing.name, code: existing.code, category: existing.category, price: Number(existing.price), resultType: existing.resultType, turnaroundTime: existing.turnaroundTime, referenceRange: existing.referenceRange, active: existing.active }
      : { ...testForm, price: Number(testForm.price), code: testForm.code.toUpperCase() };
    if (!body.name || !body.code || Number.isNaN(body.price)) {
      setError("Name, code, and price are required.");
      return;
    }
    try {
      if (existing?.id) await patch(`/lab/tests/${existing.id}`, body);
      else await post("/lab/tests", body);
      setOk(existing?.id ? "Test updated." : "Test added with its price.");
      setTestForm({ name: "", code: "", category: "RAPID", price: "", resultType: "TEXT", turnaroundTime: "", referenceRange: "" });
      setEditingTest(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save lab test.");
    }
  }

  async function applyLabList() {
    try {
      const result = await post<{ created: number; updated: number; total: number }>("/lab/catalog/apply", {});
      setOk(`Lab price list applied: ${result.total} tests (${result.created} new, ${result.updated} updated).`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to apply the lab list.");
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Laboratory"
        subtitle="Doctor requests and walk-in tests. Walk-ins skip consultation and are billed for the tests only."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant={tab === "queue" ? "primary" : "secondary"} onClick={() => setTab("queue")}>Queue</Button>
            {canCatalog ? <Button variant={tab === "catalog" ? "primary" : "secondary"} onClick={() => setTab("catalog")}>Tests & prices</Button> : null}
            {canWalkIn && tab === "queue" ? (
              <Button variant="secondary" onClick={() => setShowWalkIn((v) => !v)}>
                <Icons.flask /> {showWalkIn ? "Hide walk-in" : "Walk-in test"}
              </Button>
            ) : null}
          </div>
        }
      />
      {error ? <Alert kind="error">{error}</Alert> : null}
      {ok ? <Alert kind="success">{ok}</Alert> : null}

      {tab === "catalog" && canCatalog ? (
        <div className="space-y-4">
          <form onSubmit={(e) => void saveTest(e)} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Add a laboratory test</h2>
              <div className="flex flex-wrap gap-2">
                <Link className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50" to="/admin/prices">
                  Search prices
                </Link>
                <Button variant="secondary" onClick={() => void applyLabList()}>Apply clinic lab list</Button>
              </div>
            </div>
            <div className="grid gap-2 md:grid-cols-4">
              <Field label="Name"><input className={inputClass} value={testForm.name} onChange={(e) => setTestForm((s) => ({ ...s, name: e.target.value }))} required /></Field>
              <Field label="Code"><input className={inputClass} value={testForm.code} onChange={(e) => setTestForm((s) => ({ ...s, code: e.target.value }))} required /></Field>
              <Field label="Category">
                <select className={inputClass} value={testForm.category} onChange={(e) => setTestForm((s) => ({ ...s, category: e.target.value }))}>
                  {LAB_TEST_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Price (KES)"><input className={inputClass} value={testForm.price} onChange={(e) => setTestForm((s) => ({ ...s, price: e.target.value }))} required /></Field>
              <Field label="Result type">
                <select className={inputClass} value={testForm.resultType} onChange={(e) => setTestForm((s) => ({ ...s, resultType: e.target.value }))}>
                  <option value="TEXT">Text</option>
                  <option value="NUMERIC">Numeric</option>
                  <option value="POSITIVE_NEGATIVE">Positive / negative</option>
                  <option value="SELECT">Select</option>
                </select>
              </Field>
              <Field label="Turnaround"><input className={inputClass} value={testForm.turnaroundTime} onChange={(e) => setTestForm((s) => ({ ...s, turnaroundTime: e.target.value }))} /></Field>
              <Field label="Reference"><input className={inputClass} value={testForm.referenceRange} onChange={(e) => setTestForm((s) => ({ ...s, referenceRange: e.target.value }))} /></Field>
              <div className="self-end"><Button type="submit">Add test</Button></div>
            </div>
          </form>
          <Table headers={["Test", "Code", "Category", "Price", "TAT", ""]}>
            {allTests.map((t) => (
              <tr key={t.id}>
                {editingTest === t.id ? (
                  <>
                    <td className="px-3 py-2"><input className={inputClass} defaultValue={t.name} onChange={(e) => { t.name = e.target.value; }} /></td>
                    <td className="px-3 py-2"><input className={inputClass} defaultValue={t.code} onChange={(e) => { t.code = e.target.value; }} /></td>
                    <td className="px-3 py-2">
                      <select className={inputClass} defaultValue={t.category} onChange={(e) => { t.category = e.target.value; }}>
                        {LAB_TEST_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2"><input className={inputClass} defaultValue={t.price} onChange={(e) => { t.price = e.target.value; }} /></td>
                    <td className="px-3 py-2"><input className={inputClass} defaultValue={t.turnaroundTime || ""} onChange={(e) => { t.turnaroundTime = e.target.value; }} /></td>
                    <td className="px-3 py-2"><Button onClick={() => void saveTest(undefined, t)}>Save</Button></td>
                  </>
                ) : (
                  <>
                    <td className="px-3 py-2">{t.name}</td>
                    <td className="px-3 py-2">{t.code}</td>
                    <td className="px-3 py-2">{t.category}</td>
                    <td className="px-3 py-2">{t.price}</td>
                    <td className="px-3 py-2">{t.turnaroundTime || "—"}</td>
                    <td className="px-3 py-2"><Button variant="secondary" onClick={() => setEditingTest(t.id)}>Edit</Button></td>
                  </>
                )}
              </tr>
            ))}
          </Table>
        </div>
      ) : null}

      {tab === "queue" && canWalkIn && showWalkIn ? (
        <form onSubmit={createWalkIn} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Icons.userPlus /> Walk-in — name and phone only
          </h2>
          <WalkInClientFields value={walkIn} onChange={setWalkIn} />
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">Tests</p>
            <div className="grid max-h-48 gap-1 overflow-auto rounded-lg border border-slate-200 p-2 md:grid-cols-2">
              {tests.map((t) => (
                <label key={t.id} className="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-slate-50">
                  <input type="checkbox" checked={picked.includes(t.id)} onChange={() => toggleTest(t.id)} />
                  <span className="flex-1">{t.name}</span>
                  <span className="text-xs text-slate-500">{t.price}</span>
                </label>
              ))}
            </div>
          </div>
          <Button type="submit"><Icons.check /> Create walk-in (no consult fee)</Button>
        </form>
      ) : null}

      {tab === "queue" && queue.length === 0 ? <Empty title="No pending laboratory requests." body="Doctor orders and walk-in tests show up here." /> : null}
      {tab === "queue" && queue.length > 0 ? (
        <Table headers={["Patient", "Visit", "Tests", "Time", "Status", ""]}>
          {queue.map((o) => (
            <tr key={o.id} className="hover:bg-slate-50">
              <td className="px-3 py-2">{o.patient.firstName} {o.patient.lastName}</td>
              <td className="px-3 py-2">
                {o.encounter.visitNumber}
                {o.encounter.visitType === "WALK_IN_LAB" ? <span className="ml-2 text-xs text-violet-700">walk-in</span> : null}
              </td>
              <td className="px-3 py-2">{o.items.map((i: any) => `${i.labTest.name}${i.labTest.turnaroundTime ? ` (${i.labTest.turnaroundTime})` : ""}`).join(", ")}</td>
              <td className="px-3 py-2">{new Date(o.createdAt).toLocaleTimeString()}</td>
              <td className="px-3 py-2"><StatusBadge status={o.status} /></td>
              <td className="px-3 py-2"><Button variant="secondary" onClick={() => setSelected(o)}>Open</Button></td>
            </tr>
          ))}
        </Table>
      ) : null}
      {tab === "queue" && selected ? (
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <h2 className="mb-3 font-medium">Enter results — {selected.encounter.visitNumber}</h2>
          {selected.items.map((item: any) => (
            <div key={item.id} className="mb-3 grid gap-2 md:grid-cols-[1fr_1fr_auto]">
              <div className="text-sm">{item.labTest.name} {item.labTest.referenceRange ? `(${item.labTest.referenceRange})` : ""}</div>
              {item.result ? (
                <div className="text-sm">Result: {item.result.valueText ?? item.result.valueNumeric}</div>
              ) : canResults ? (
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
              ) : (
                <p className="text-sm text-slate-500">Waiting for laboratory to enter this result.</p>
              )}
              {canResults && !item.result ? <div className="self-end"><Button onClick={() => void saveResult(item)}>Save result</Button></div> : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
