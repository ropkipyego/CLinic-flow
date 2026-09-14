import { Field, inputClass } from "./ui";

export type WalkInClient = {
  name: string;
  phone: string;
  ageYears: string;
  isMinor: boolean;
  guardianName: string;
  guardianPhone: string;
};

export const emptyWalkInClient = (): WalkInClient => ({
  name: "",
  phone: "",
  ageYears: "",
  isMinor: false,
  guardianName: "",
  guardianPhone: "",
});

export function walkInPayload(client: WalkInClient) {
  const age = client.ageYears ? Number(client.ageYears) : null;
  const minor = client.isMinor || (age !== null && age < 18);
  return {
    name: client.name.trim(),
    phone: client.phone.trim(),
    ageYears: age,
    guardianName: minor ? client.guardianName.trim() : null,
    guardianPhone: minor ? client.guardianPhone.trim() : null,
  };
}

export function WalkInClientFields({
  value,
  onChange,
}: {
  value: WalkInClient;
  onChange: (next: WalkInClient) => void;
}) {
  const age = value.ageYears ? Number(value.ageYears) : null;
  const showGuardian = value.isMinor || (age !== null && age < 18);

  function set<K extends keyof WalkInClient>(key: K, next: WalkInClient[K]) {
    onChange({ ...value, [key]: next });
  }

  return (
    <div className="grid gap-2 md:grid-cols-2">
      <Field label="Name">
        <input className={inputClass} value={value.name} onChange={(e) => set("name", e.target.value)} required placeholder="Full name" />
      </Field>
      <Field label="Phone">
        <input className={inputClass} value={value.phone} onChange={(e) => set("phone", e.target.value)} required placeholder="07…" />
      </Field>
      <Field label="Age (optional)">
        <input className={inputClass} value={value.ageYears} onChange={(e) => set("ageYears", e.target.value)} inputMode="numeric" placeholder="Leave blank if adult" />
      </Field>
      <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700">
        <input type="checkbox" checked={showGuardian} onChange={(e) => set("isMinor", e.target.checked)} />
        This is a child under 18
      </label>
      {showGuardian ? (
        <>
          <Field label="Parent / guardian name">
            <input className={inputClass} value={value.guardianName} onChange={(e) => set("guardianName", e.target.value)} required placeholder="Adult responsible" />
          </Field>
          <Field label="Parent / guardian phone">
            <input className={inputClass} value={value.guardianPhone} onChange={(e) => set("guardianPhone", e.target.value)} required placeholder="Guardian phone" />
          </Field>
        </>
      ) : null}
    </div>
  );
}
