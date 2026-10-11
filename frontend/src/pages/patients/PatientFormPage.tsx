import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { get, patch, post, ApiRequestError } from "../../api/client";
import { Alert, Button, Field, PageHeader, Table, cellClass, inputClass } from "../../components/ui";

type Duplicate = {
  id: string;
  patientNumber: string;
  name: string;
  phone: string;
  age: number | null;
  sex: string;
  lastEncounter?: { visitNumber: string; startedAt: string; status: string } | null;
};

const emptyForm = {
  firstName: "",
  middleName: "",
  lastName: "",
  phone: "",
  alternativePhone: "",
  dateOfBirth: "",
  ageYears: "",
  sex: "FEMALE",
  address: "",
  nextOfKin: "",
  nextOfKinPhone: "",
  paymentMethod: "CASH",
  insuranceProvider: "",
};

export function PatientFormPage() {
  const nav = useNavigate();
  const { id } = useParams();
  const [params] = useSearchParams();
  const editing = Boolean(id);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [matches, setMatches] = useState<Duplicate[]>([]);
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);
  const [q, setQ] = useState("");
  const [searched, setSearched] = useState(editing || params.get("new") === "1");
  const [hits, setHits] = useState<Duplicate[]>([]);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setConfirmDuplicate(false);
  }

  useEffect(() => {
    if (!id) return;
    get<any>(`/patients/${id}`)
      .then((p) => {
        setForm({
          firstName: p.firstName || "",
          middleName: p.middleName || "",
          lastName: p.lastName || "",
          phone: p.phone || "",
          alternativePhone: p.alternativePhone || "",
          dateOfBirth: p.dateOfBirth ? String(p.dateOfBirth).slice(0, 10) : "",
          ageYears: p.ageYears != null ? String(p.ageYears) : "",
          sex: p.sex || "FEMALE",
          address: p.address || "",
          nextOfKin: p.nextOfKin || "",
          nextOfKinPhone: p.nextOfKinPhone || "",
          paymentMethod: p.paymentMethod || "CASH",
          insuranceProvider: p.insuranceProvider || "",
        });
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Unable to load patient."));
  }, [id]);

  useEffect(() => {
    if (editing) return;
    const phone = form.phone.trim();
    const firstName = form.firstName.trim();
    const lastName = form.lastName.trim();
    if (phone.length < 7 && !(firstName && lastName)) {
      setMatches([]);
      return;
    }
    const t = window.setTimeout(() => {
      const qs = new URLSearchParams();
      if (phone) qs.set("phone", phone);
      if (firstName) qs.set("firstName", firstName);
      if (lastName) qs.set("lastName", lastName);
      if (form.dateOfBirth) qs.set("dateOfBirth", form.dateOfBirth);
      get<Duplicate[]>(`/patients/matches?${qs}`)
        .then(setMatches)
        .catch(() => setMatches([]));
    }, 400);
    return () => window.clearTimeout(t);
  }, [form.phone, form.firstName, form.lastName, form.dateOfBirth, editing]);

  function payload() {
    return {
      ...form,
      middleName: form.middleName || null,
      alternativePhone: form.alternativePhone || null,
      dateOfBirth: form.dateOfBirth || null,
      ageYears: form.dateOfBirth ? null : form.ageYears ? Number(form.ageYears) : null,
      insuranceProvider: form.insuranceProvider || null,
      confirmDuplicate: confirmDuplicate || undefined,
    };
  }

  async function lookup(e?: FormEvent) {
    e?.preventDefault();
    if (!q.trim()) return;
    try {
      setHits(await get<Duplicate[]>(`/patients?q=${encodeURIComponent(q.trim())}`));
      setSearched(true);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to search patients.");
    }
  }

  async function startVisit(patientId: string) {
    const visit = await post<{ id: string }>("/encounters", { patientId, checkInToConsultation: true });
    nav(`/visits?opened=${visit.id}`);
  }

  async function save(start: boolean) {
    const age = form.dateOfBirth
      ? Math.floor((Date.now() - new Date(form.dateOfBirth).getTime()) / (365.25 * 24 * 3600 * 1000))
      : form.ageYears
        ? Number(form.ageYears)
        : null;
    if (age !== null && age < 18 && (!form.nextOfKin.trim() || !form.nextOfKinPhone.trim())) {
      setError("A child under 18 needs a parent or guardian name and phone.");
      return;
    }
    if (!editing && matches.length && !confirmDuplicate) {
      setError("A possible match exists. Open that chart, or confirm these are different people.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const patient = editing
        ? await patch<{ id: string }>(`/patients/${id}`, payload())
        : await post<{ id: string }>("/patients", payload());
      if (!editing && start) {
        await startVisit(patient.id);
      } else {
        nav(`/patients/${patient.id}`);
      }
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 409) {
        const details = err.details as { duplicates?: Duplicate[] } | undefined;
        if (details?.duplicates?.length) setMatches(details.duplicates);
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : "Unable to save patient. Please review the form and try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (!editing && !searched) {
    return (
      <div className="max-w-3xl space-y-4">
        <PageHeader
          title="Find the patient first"
          subtitle="Search by number, name or phone before registering anyone. Returning patients keep their file."
        />
        {error ? <Alert kind="error">{error}</Alert> : null}
        <form onSubmit={(e) => void lookup(e)} className="flex gap-2">
          <input className={inputClass} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Patient number, name, or 07…" autoFocus />
          <Button type="submit">Search</Button>
        </form>
        <p className="text-sm text-slate-500">Search first. Register a new file only when no match is the same person.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setSearched(true)}>No match — register new patient</Button>
          <Link to="/patients" className="self-center text-sm font-medium text-[var(--brand)] hover:underline">Back to registry</Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); void save(false); }} className="max-w-3xl space-y-4">
      <PageHeader
        title={editing ? "Edit patient" : "Register new patient"}
        subtitle={editing ? "Updating details does not create another file." : "One master record per person. A visit is a new encounter on this file."}
      />
      {error ? <Alert kind="error">{error}</Alert> : null}
      {!editing && hits.length ? (
        <Alert kind="info">
          Existing files — open one instead of registering again:
          <Table headers={["Number", "Name", "Phone", "Last visit", ""]}>
            {hits.map((m) => (
              <tr key={m.id}>
                <td className={cellClass}>{m.patientNumber}</td>
                <td className={cellClass}>{m.name}</td>
                <td className={cellClass}>{m.phone}</td>
                <td className={cellClass}>{m.lastEncounter ? `${m.lastEncounter.visitNumber} · ${m.lastEncounter.status}` : "None"}</td>
                <td className={`${cellClass} text-right`}>
                  <div className="flex justify-end gap-2">
                    <Link className="text-sm font-medium text-[var(--brand)] hover:underline" to={`/patients/${m.id}`}>Open</Link>
                    <button type="button" className="text-sm font-medium text-[var(--brand)] hover:underline" onClick={() => void startVisit(m.id)}>Start visit</button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        </Alert>
      ) : null}
      {matches.length ? (
        <Alert kind="info">
          Possible existing file{matches.length > 1 ? "s" : ""}:
          <ul className="mt-2 space-y-1">
            {matches.map((m) => (
              <li key={m.id}>
                <Link className="font-medium text-[var(--brand)] hover:underline" to={`/patients/${m.id}`}>
                  {m.patientNumber} · {m.name}
                </Link>
                <span className="text-slate-600"> · {m.phone} · {m.age ?? "—"}/{m.sex?.[0]}</span>
                {m.lastEncounter ? <span className="text-slate-500"> · last {m.lastEncounter.visitNumber}</span> : null}
              </li>
            ))}
          </ul>
          {!editing ? (
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={confirmDuplicate} onChange={(e) => setConfirmDuplicate(e.target.checked)} />
              These are different people (for example family sharing a phone) — register a new file
            </label>
          ) : null}
        </Alert>
      ) : null}
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="First name"><input className={inputClass} value={form.firstName} onChange={(e) => set("firstName", e.target.value)} required /></Field>
        <Field label="Middle name"><input className={inputClass} value={form.middleName} onChange={(e) => set("middleName", e.target.value)} /></Field>
        <Field label="Last name"><input className={inputClass} value={form.lastName} onChange={(e) => set("lastName", e.target.value)} required /></Field>
        <Field label="Phone"><input className={inputClass} value={form.phone} onChange={(e) => set("phone", e.target.value)} required /></Field>
        <Field label="Alternative phone"><input className={inputClass} value={form.alternativePhone} onChange={(e) => set("alternativePhone", e.target.value)} /></Field>
        <Field label="Sex">
          <select className={inputClass} value={form.sex} onChange={(e) => set("sex", e.target.value)}>
            <option value="FEMALE">Female</option>
            <option value="MALE">Male</option>
            <option value="OTHER">Other</option>
          </select>
        </Field>
        <Field label="Date of birth"><input className={inputClass} type="date" value={form.dateOfBirth} onChange={(e) => set("dateOfBirth", e.target.value)} /></Field>
        <Field label="Age (if no DOB)"><input className={inputClass} type="number" value={form.ageYears} onChange={(e) => set("ageYears", e.target.value)} /></Field>
        <Field label="Payment method">
          <select className={inputClass} value={form.paymentMethod} onChange={(e) => set("paymentMethod", e.target.value)}>
            <option value="CASH">Cash</option>
            <option value="INSURANCE">Insurance</option>
            <option value="OTHER">Other</option>
          </select>
        </Field>
        <Field label="Insurance provider"><input className={inputClass} value={form.insuranceProvider} onChange={(e) => set("insuranceProvider", e.target.value)} /></Field>
        <Field label="Address"><input className={inputClass} value={form.address} onChange={(e) => set("address", e.target.value)} /></Field>
        <Field label="Next of kin"><input className={inputClass} value={form.nextOfKin} onChange={(e) => set("nextOfKin", e.target.value)} placeholder="Required if under 18" /></Field>
        <Field label="Next of kin phone"><input className={inputClass} value={form.nextOfKinPhone} onChange={(e) => set("nextOfKinPhone", e.target.value)} placeholder="Guardian phone if under 18" /></Field>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>{editing ? "Save changes" : "Save patient"}</Button>
        {!editing ? <Button variant="secondary" disabled={busy} onClick={() => void save(true)}>Save & start visit</Button> : null}
      </div>
    </form>
  );
}
