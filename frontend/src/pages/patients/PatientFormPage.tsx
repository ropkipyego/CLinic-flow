import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { post } from "../../api/client";
import { Alert, Button, Field, PageHeader, inputClass } from "../../components/ui";

export function PatientFormPage() {
  const nav = useNavigate();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
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
  });

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save(startVisit: boolean) {
    setBusy(true);
    setError("");
    try {
      const patient = await post<{ id: string }>("/patients", {
        ...form,
        middleName: form.middleName || null,
        alternativePhone: form.alternativePhone || null,
        dateOfBirth: form.dateOfBirth || null,
        ageYears: form.dateOfBirth ? null : form.ageYears ? Number(form.ageYears) : null,
        insuranceProvider: form.insuranceProvider || null,
      });
      if (startVisit) {
        const visit = await post<{ id: string }>("/encounters", { patientId: patient.id, checkInToConsultation: true });
        nav(`/visits?opened=${visit.id}`);
      } else {
        nav(`/patients/${patient.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save patient. Please review the form and try again.");
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
      <PageHeader title="Register patient" subtitle="A patient number is assigned automatically, for example CLF-000001." />
      {error ? <Alert kind="error">{error}</Alert> : null}
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
        <Field label="Next of kin"><input className={inputClass} value={form.nextOfKin} onChange={(e) => set("nextOfKin", e.target.value)} /></Field>
        <Field label="Next of kin phone"><input className={inputClass} value={form.nextOfKinPhone} onChange={(e) => set("nextOfKinPhone", e.target.value)} /></Field>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>Save patient</Button>
        <Button variant="secondary" disabled={busy} onClick={() => void save(true)}>Save & start visit</Button>
      </div>
    </form>
  );
}
