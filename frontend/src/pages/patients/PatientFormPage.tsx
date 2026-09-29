import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { get, patch, post, ApiRequestError } from "../../api/client";
import { Alert, Button, Field, PageHeader, inputClass } from "../../components/ui";

type Duplicate = { id: string; patientNumber: string; name: string; phone: string; age: number | null; sex: string };

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
  const editing = Boolean(id);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [matches, setMatches] = useState<Duplicate[]>([]);
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);

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

  async function save(startVisit: boolean) {
    const age = form.dateOfBirth
      ? Math.floor((Date.now() - new Date(form.dateOfBirth).getTime()) / (365.25 * 24 * 3600 * 1000))
      : form.ageYears
        ? Number(form.ageYears)
        : null;
    if (age !== null && age < 18 && (!form.nextOfKin.trim() || !form.nextOfKinPhone.trim())) {
      setError("A child under 18 needs a parent or guardian name and phone.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const patient = editing
        ? await patch<{ id: string }>(`/patients/${id}`, payload())
        : await post<{ id: string }>("/patients", payload());
      if (!editing && startVisit) {
        const visit = await post<{ id: string }>("/encounters", { patientId: patient.id, checkInToConsultation: true });
        nav(`/visits?opened=${visit.id}`);
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

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void save(false);
  }

  return (
    <form onSubmit={onSubmit} className="max-w-3xl space-y-4">
      <PageHeader
        title={editing ? "Edit patient" : "Register patient"}
        subtitle={editing ? "Keep one chart per person. Search first if you are not sure." : "Search the registry first. A patient number is assigned automatically."}
      />
      {error ? <Alert kind="error">{error}</Alert> : null}
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
              </li>
            ))}
          </ul>
          {!editing ? (
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={confirmDuplicate} onChange={(e) => setConfirmDuplicate(e.target.checked)} />
              These are different people — register a new file
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
