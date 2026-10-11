import { FormEvent, useMemo, useState } from "react";
import { post } from "../../api/client";
import { Button, Empty, Field, Table, inputClass } from "../../components/ui";
import { useToast } from "../../components/ToastProvider";
import { DEFAULT_CSV_TEMPLATE, OPTIONAL_CSV_TEMPLATE, parseCsv, sha256Hex } from "../../lib/csv";
import { resolveHeaderMapping } from "../../lib/catalogueHeaders";

type PreviewRow = {
  rowNumber: number;
  name: string;
  quantity: number | null;
  aten: string;
  costPrice: number | null;
  sellingPrice: number | null;
  unit: string;
  errors: string[];
  warnings: string[];
  action: string;
  matchName: string | null;
};

type Report = {
  sourceRows: number;
  created: number;
  updated: number;
  matched: number;
  skipped: number;
  rejected: number;
  missingSellingPrice: number;
  stockChangesProposed: number;
  dryRun: boolean;
  preview: PreviewRow[];
};

const FIELDS = [
  ["name", "Drug name"],
  ["quantity", "Quantity"],
  ["aten", "ATEN / SKU"],
  ["costPrice", "Cost price"],
  ["sellingPrice", "Selling price (optional)"],
  ["unit", "Unit (optional)"],
  ["description", "Description (optional)"],
] as const;

function download(name: string, text: string) {
  const blob = new Blob([text], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function CatalogueImportPanel({ onSaved }: { onSaved?: () => Promise<void> }) {
  const toast = useToast();
  const [text, setText] = useState(DEFAULT_CSV_TEMPLATE);
  const [filename, setFilename] = useState("clinicflow-drugs.csv");
  const [headers, setHeaders] = useState<string[]>(["name", "quantity", "aten", "costPrice"]);
  const [mapping, setMapping] = useState<Record<string, string>>({
    name: "name",
    quantity: "quantity",
    aten: "aten",
    costPrice: "costPrice",
  });
  const [edited, setEdited] = useState<Record<string, string>[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [openingReason, setOpeningReason] = useState("");
  const [openingPreview, setOpeningPreview] = useState<any>(null);

  const parsedRows = useMemo(() => parseCsv(text).rows, [text]);

  function applyFile(file: File, content: string) {
    const parsed = parseCsv(content);
    setFilename(file.name);
    setText(content);
    setHeaders(parsed.headers);
    setEdited(parsed.rows);
    setReport(null);
    setOpeningPreview(null);
    setMapping(resolveHeaderMapping(parsed.headers) as Record<string, string>);
  }

  async function dryRun(e: FormEvent) {
    e.preventDefault();
    try {
      const result = await post<Report>("/pharmacy/catalogue/import", {
        csvText: text,
        mapping,
        dryRun: true,
        sourceFilename: filename,
      });
      setReport(result);
      toast.push(
        `Dry-run: ${result.created} new · ${result.updated} matched · ${result.rejected} rejected. Stock changes: ${result.stockChangesProposed}.`,
        result.rejected ? "warning" : "info",
      );
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Dry-run failed.", "error");
    }
  }

  async function commit() {
    if (!report) return;
    if (!window.confirm("Commit this catalogue import? Shelf quantities will not change.")) return;
    try {
      const result = await post<Report>("/pharmacy/catalogue/import", {
        csvText: text,
        mapping,
        dryRun: false,
        sourceFilename: filename,
        sourceHash: await sha256Hex(text),
      });
      setReport(result);
      toast.push(`Imported ${result.created} new and ${result.updated} updated. Shelf quantities were not changed.`, "success");
      await onSaved?.();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Import write failed.", "error");
    }
  }

  async function previewOpening() {
    try {
      const result = await post<any>("/pharmacy/catalogue/opening-stock", {
        csvText: text,
        mapping,
        reason: openingReason,
        dryRun: true,
        sourceFilename: filename,
        sourceHash: await sha256Hex(text),
      });
      setOpeningPreview(result);
      toast.push(`Opening stock preview: ${result.proposed?.length || 0} proposed movements.`, "info");
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Opening-stock preview failed.", "error");
    }
  }

  async function postOpening() {
    if (!window.confirm("Post these opening-stock movements to the inventory ledger?")) return;
    try {
      const result = await post<any>("/pharmacy/catalogue/opening-stock", {
        csvText: text,
        mapping,
        reason: openingReason,
        dryRun: false,
        sourceFilename: filename,
        sourceHash: await sha256Hex(text),
      });
      setOpeningPreview(result);
      toast.push(`Posted ${result.posted} opening-stock movements to the ledger.`, "success");
      await onSaved?.();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Opening-stock post failed.", "error");
    }
  }

  return (
    <form onSubmit={(e) => void dryRun(e)} className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <h2 className="text-sm font-semibold">Drug catalogue CSV</h2>
        <p className="text-sm text-slate-500">
          Default columns are drug name, quantity, ATEN number (stored as the existing unique SKU), and cost price.
          Quantity is reviewed only — catalogue import never posts stock. Selling price is optional and is never copied from cost.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => download("clinicflow-drugs.csv", DEFAULT_CSV_TEMPLATE)}>Download 4-column template</Button>
          <Button variant="secondary" onClick={() => download("clinicflow-drugs-optional.csv", OPTIONAL_CSV_TEMPLATE)}>Download optional-fields template</Button>
          <label className="inline-flex cursor-pointer items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
            Upload CSV
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && void e.target.files[0].text().then((t) => applyFile(e.target.files![0]!, t))} />
          </label>
        </div>
        <Field label="CSV">
          <textarea className={`${inputClass} min-h-[140px] font-mono text-xs`} value={text} onChange={(e) => { setText(e.target.value); setEdited(parseCsv(e.target.value).rows); }} />
        </Field>
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
          {FIELDS.map(([field, label]) => (
            <Field key={field} label={label}>
              <select className={inputClass} value={mapping[field] || ""} onChange={(e) => setMapping((s) => ({ ...s, [field]: e.target.value }))}>
                <option value="">Not mapped</option>
                {headers.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </Field>
          ))}
        </div>
        <Button type="submit">Preview dry-run</Button>
      </div>

      {edited.length ? (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Edit optional fields before import</h3>
          <Table headers={["Row", ...headers.slice(0, 8)]}>
            {edited.slice(0, 40).map((row, i) => (
              <tr key={i}>
                <td className="px-3 py-2 text-xs">{i + 2}</td>
                {headers.slice(0, 8).map((h) => (
                  <td key={h} className="px-3 py-2">
                    <input className={inputClass} value={row[h] || ""} onChange={(e) => {
                      const next = edited.map((r, idx) => idx === i ? { ...r, [h]: e.target.value } : r);
                      setEdited(next);
                      const rebuilt = [headers.join(","), ...next.map((r) => headers.map((k) => {
                        const v = r[k] || "";
                        return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
                      }).join(","))].join("\n");
                      setText(rebuilt);
                    }} />
                  </td>
                ))}
              </tr>
            ))}
          </Table>
          {parsedRows.length > 40 ? <p className="text-xs text-slate-500">{parsedRows.length} rows in file; first 40 shown for editing.</p> : null}
        </div>
      ) : <Empty title="No CSV rows yet." body="Download a template or upload a file." />}

      {report ? (
        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm">
            {report.dryRun ? "Dry-run" : "Committed"} · {report.sourceRows} rows · {report.created} create · {report.updated} update · {report.rejected} reject · missing selling price {report.missingSellingPrice} · stock changes {report.stockChangesProposed}.
          </p>
          <Table headers={["Row", "Name", "ATEN", "Qty", "Cost", "Selling", "Match", "Action", "Messages"]}>
            {report.preview.slice(0, 80).map((row) => (
              <tr key={row.rowNumber} className={row.action === "reject" ? "bg-red-50" : undefined}>
                <td className="px-3 py-2">{row.rowNumber}</td>
                <td className="px-3 py-2">{row.name || "—"}</td>
                <td className="px-3 py-2">{row.aten || "—"}</td>
                <td className="px-3 py-2">{row.quantity ?? "blank"}</td>
                <td className="px-3 py-2">{row.costPrice ?? "blank"}</td>
                <td className="px-3 py-2">{row.sellingPrice === null ? "unset" : row.sellingPrice}</td>
                <td className="px-3 py-2">{row.matchName || "—"}</td>
                <td className="px-3 py-2">{row.action}</td>
                <td className="px-3 py-2 text-xs">{[...row.errors, ...row.warnings].join(" ")}</td>
              </tr>
            ))}
          </Table>
          {report.dryRun ? <Button onClick={() => void commit()}>Confirm catalogue import (no stock)</Button> : null}
        </div>
      ) : null}

      <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <h2 className="text-sm font-semibold">Separate opening-stock operation</h2>
        <p className="text-sm text-slate-600">This posts OPENING_BALANCE movements against existing catalogue items only. It cannot run until you confirm the proposed quantities.</p>
        <Field label="Reason (required)">
          <input className={inputClass} value={openingReason} onChange={(e) => setOpeningReason(e.target.value)} placeholder="Opening balance from 11 Oct count" />
        </Field>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => void previewOpening()}>Preview stock changes</Button>
          {openingPreview && !openingPreview.dryRun === false ? null : null}
          {openingPreview?.proposed ? <Button onClick={() => void postOpening()}>Post opening stock</Button> : null}
        </div>
        {openingPreview?.proposed ? (
          <Table headers={["Row", "Name", "ATEN", "Qty", "Issue"]}>
            {openingPreview.proposed.map((p: any, i: number) => (
              <tr key={i}>
                <td className="px-3 py-2">{p.row}</td>
                <td className="px-3 py-2">{p.name}</td>
                <td className="px-3 py-2">{p.aten}</td>
                <td className="px-3 py-2">{p.quantity}</td>
                <td className="px-3 py-2 text-xs text-red-700">{p.error || ""}</td>
              </tr>
            ))}
          </Table>
        ) : null}
      </div>
    </form>
  );
}
