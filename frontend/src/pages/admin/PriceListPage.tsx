import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { get, patch, post } from "../../api/client";
import { Alert, Button, PageHeader, inputClass } from "../../components/ui";
import { Icons } from "../../components/icons";
import { formatMoney } from "../../lib/labels";

type Kind = "hospital" | "lab" | "pharmacy";
type Tab = "all" | Kind;

type PriceRow = {
  id: string;
  kind: Kind;
  name: string;
  code: string;
  category: string;
  price: number;
};

type Service = { id: string; name: string; code: string; category: string; price: number; active: boolean };
type LabTest = { id: string; name: string; code: string; category: string; price: number; active: boolean };
type Medicine = { id: string; name: string; sku: string; strength: string | null; sellingPrice: number; active: boolean };

const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All prices" },
  { id: "hospital", label: "Hospital charges" },
  { id: "lab", label: "Lab tests" },
  { id: "pharmacy", label: "Pharmacy" },
];

function kindLabel(kind: Kind) {
  return kind === "hospital" ? "Hospital" : kind === "lab" ? "Lab" : "Pharmacy";
}

function rowKey(row: Pick<PriceRow, "kind" | "id">) {
  return `${row.kind}:${row.id}`;
}

export function PriceListPage() {
  const searchRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<PriceRow[]>([]);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const drafts = useRef<Record<string, string>>({});
  const [, bump] = useState(0);

  async function load() {
    try {
      const [services, tests, medicines] = await Promise.all([
        get<Service[]>("/services"),
        get<LabTest[]>("/lab/tests"),
        get<Medicine[]>("/pharmacy/medicines"),
      ]);
      const hospital: PriceRow[] = services
        .filter((s) => s.category !== "LABORATORY" && s.category !== "PHARMACY")
        .map((s) => ({
          id: s.id,
          kind: "hospital",
          name: s.name,
          code: s.code,
          category: s.category,
          price: Number(s.price),
        }));
      const lab: PriceRow[] = tests.map((t) => ({
        id: t.id,
        kind: "lab",
        name: t.name,
        code: t.code,
        category: t.category,
        price: Number(t.price),
      }));
      const pharmacy: PriceRow[] = medicines.map((m) => ({
        id: m.id,
        kind: "pharmacy",
        name: m.strength ? `${m.name} ${m.strength}` : m.name,
        code: m.sku,
        category: "PHARMACY",
        price: Number(m.sellingPrice),
      }));
      setRows([...hospital, ...lab, ...pharmacy]);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load prices.");
    }
  }

  useEffect(() => {
    void load();
    searchRef.current?.focus();
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (tab !== "all" && r.kind !== tab) return false;
      if (!needle) return true;
      return `${r.name} ${r.code} ${r.category} ${r.price}`.toLowerCase().includes(needle);
    });
  }, [rows, q, tab]);

  const grouped = useMemo(() => {
    const map = new Map<string, PriceRow[]>();
    for (const row of filtered) {
      const key = tab === "all" ? kindLabel(row.kind) : row.category.replaceAll("_", " ");
      const list = map.get(key) || [];
      list.push(row);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [filtered, tab]);

  function draftValue(row: PriceRow) {
    return drafts.current[rowKey(row)] ?? String(row.price);
  }

  function setDraft(row: PriceRow, value: string) {
    drafts.current[rowKey(row)] = value;
    bump((n) => n + 1);
  }

  async function saveRow(row: PriceRow) {
    const key = rowKey(row);
    const value = Number(draftValue(row));
    if (!Number.isFinite(value) || value < 0) {
      setError("Enter a valid amount in KES.");
      return;
    }
    if (value === row.price) {
      delete drafts.current[key];
      bump((n) => n + 1);
      return;
    }
    setSavingId(key);
    setError("");
    try {
      if (row.kind === "hospital") await patch(`/services/${row.id}/price`, { price: value });
      else if (row.kind === "lab") await patch(`/lab/tests/${row.id}/price`, { price: value });
      else await patch(`/pharmacy/medicines/${row.id}/price`, { sellingPrice: value });
      delete drafts.current[key];
      setRows((list) => list.map((r) => (r.id === row.id && r.kind === row.kind ? { ...r, price: value } : r)));
      setSavedId(key);
      setTimeout(() => setSavedId((id) => (id === key ? null : id)), 1400);
      setOk(`${row.name} is now KES ${value.toLocaleString()}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save that price.");
    } finally {
      setSavingId(null);
    }
  }

  async function applyPrinted(e?: FormEvent) {
    e?.preventDefault();
    setApplying(true);
    setError("");
    try {
      const jobs: Promise<unknown>[] = [];
      if (tab === "all" || tab === "hospital") jobs.push(post("/services/catalog/apply"));
      if (tab === "all" || tab === "lab") jobs.push(post("/lab/catalog/apply"));
      if (tab === "all" || tab === "pharmacy") jobs.push(post("/pharmacy/catalog/apply"));
      await Promise.all(jobs);
      drafts.current = {};
      await load();
      setOk("Printed price list applied. You can still search and change any amount.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to apply the printed list.");
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Price list"
        subtitle="Search any hospital charge, lab test, or medicine and change the KES amount. New visits pick up the new price immediately."
        actions={
          <Button variant="secondary" onClick={() => void applyPrinted()} disabled={applying}>
            {applying ? "Applying…" : tab === "all" ? "Apply printed lists" : "Reset tab to printed prices"}
          </Button>
        }
      />
      {error ? <Alert kind="error">{error}</Alert> : null}
      {ok ? <Alert kind="success">{ok}</Alert> : null}

      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
          <Icons.search className="h-5 w-5" />
        </span>
        <input
          ref={searchRef}
          className={`${inputClass} pl-10 text-base`}
          placeholder="Search a price — name, code, or amount (e.g. RBS, stitching, 200)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Button key={t.id} variant={tab === t.id ? "primary" : "secondary"} onClick={() => setTab(t.id)}>
            {t.label}
          </Button>
        ))}
      </div>

      <p className="text-sm text-slate-500">
        {filtered.length} price{filtered.length === 1 ? "" : "s"}
        {q ? ` matching “${q.trim()}”` : ""}. Type a new amount and press Enter or click away to save.
      </p>

      {grouped.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">
          Nothing matches that search. Try a code like CONSULT, a name like malaria, or an amount.
        </div>
      ) : (
        grouped.map(([group, items]) => (
          <section key={group} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <h2 className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {group}
            </h2>
            <ul>
              {items.map((row) => {
                const key = rowKey(row);
                const dirty = drafts.current[key] !== undefined && drafts.current[key] !== String(row.price);
                return (
                  <li key={key} className="flex flex-wrap items-center gap-3 border-t border-slate-100 px-4 py-2.5 first:border-t-0">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-slate-900">{row.name}</div>
                      <div className="text-xs text-slate-500">
                        {row.code}
                        {tab === "all" ? ` · ${row.category.replaceAll("_", " ")}` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">KES</span>
                      <input
                        className={`${inputClass} w-28 text-right font-semibold tabular-nums ${dirty ? "border-amber-400" : ""}`}
                        inputMode="decimal"
                        value={draftValue(row)}
                        onChange={(e) => setDraft(row, e.target.value)}
                        onBlur={() => void saveRow(row)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.currentTarget.blur();
                          }
                        }}
                        aria-label={`Price for ${row.name}`}
                      />
                      {savingId === key ? (
                        <span className="w-14 text-xs text-slate-400">Saving</span>
                      ) : savedId === key ? (
                        <span className="flex w-14 items-center gap-1 text-xs font-medium text-emerald-700">
                          <Icons.check className="h-3.5 w-3.5" /> Saved
                        </span>
                      ) : dirty ? (
                        <Button variant="secondary" onClick={() => void saveRow(row)}>Save</Button>
                      ) : (
                        <span className="w-14 text-xs text-slate-300">{formatMoney("KES", row.price).replace("KES ", "")}</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
