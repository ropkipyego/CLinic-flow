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
  ["aten", "ATEN / SKU / barcode"],
  ["costPrice", "Cost price"],
  ["sellingPrice", "Selling price (optional)"],
  ["unit", "Unit (optional)"],
  ["genericName", "Generic name (optional)"],
  ["strength", "Strength (optional)"],
  ["dosageForm", "Dosage form (optional)"],
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

function csvEscape(value: string) {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function rowsToCsv(headers: string[], rows: Record<string, string>[]) {
  return [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => headers.map((h) => csvEscape(row[h] || "")).join(",")),
  ].join("\n");
}

function fileToBase64(file: File) {
  return file.arrayBuffer().then((buf) => {
    const bytes = new Uint8Array(buf);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
  });
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
  const [busy, setBusy] = useState(false);

  const parsedRows = useMemo(() => parseCsv(text).rows, [text]);

  function applyRows(name: string, nextHeaders: string[], rows: Record<string, string>[]) {
    setFilename(name);
    setHeaders(nextHeaders);
    setEdited(rows);
    setText(rowsToCsv(nextHeaders, rows));
    setReport(null);
    setMapping(resolveHeaderMapping(nextHeaders) as Record<string, string>);
  }

  async function onUpload(file: File) {
    try {
      setBusy(true);
      const isXlsx = /\.xlsx$/i.test(file.name) || file.type.includes("spreadsheet");
      if (isXlsx) {
        const parsed = await post<{ headers: string[]; rows: Record<string, string>[] }>("/pharmacy/catalogue/parse-workbook", {
          xlsxBase64: await fileToBase64(file),
        });
        applyRows(file.name, parsed.headers, parsed.rows.map((r) => {
          const rec: Record<string, string> = {};
          for (const [k, v] of Object.entries(r)) rec[k] = v == null ? "" : String(v);
          return rec;
        }));
        toast.push(`Loaded ${parsed.rows.length} workbook rows. Preview a dry-run before importing.`, "info");
        return;
      }
      applyRows(file.name, parseCsv(await file.text()).headers, parseCsv(await file.text()).rows);
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Unable to read that file. Export as CSV if Excel fails.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function dryRun(e: FormEvent) {
    e.preventDefault();
    try {
      setBusy(true);
      const result = await post<Report>("/pharmacy/catalogue/import", {
        csvText: text,
        mapping,
        dryRun: true,
        sourceFilename: filename,
      });
      setReport(result);
      toast.push(
        `Dry-run: ${result.sourceRows} rows · ${result.created} new · ${result.updated} matched · ${result.skipped} skipped · ${result.rejected} rejected. Stock changes: ${result.stockChangesProposed}.`,
        result.rejected ? "warning" : "info",
      );
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Dry-run failed.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!report) return;
    if (
      !window.confirm(
        `Import catalogue master data only?\n\n${report.created} new medicines will be added and ${report.updated} existing medicines will be updated.\nShelf quantities, stock movements, and stock-take history will not change.`,
      )
    ) {
      return;
    }
    try {
      setBusy(true);
      const result = await post<Report>("/pharmacy/catalogue/import", {
        csvText: text,
        mapping,
        dryRun: false,
        sourceFilename: filename,
        sourceHash: await sha256Hex(text),
      });
      setReport(result);
      toast.push(`Imported ${result.created} new and ${result.updated} updated. Stock quantities were not changed.`, "success");
      await onSaved?.();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Import write failed.", "error");
    } finally {
      setBusy(false);
    }
  }

  function downloadRejected() {
    if (!report) return;
    const rejected = report.preview.filter((row) => row.action === "reject" || row.action === "skip");
    const csv = [
      "row,name,aten,action,messages",
      ...rejected.map((row) =>
        [row.rowNumber, csvEscape(row.name), csvEscape(row.aten), row.action, csvEscape([...row.errors, ...row.warnings].join(" "))].join(","),
      ),
    ].join("\n");
    download(`catalogue-rejected-${filename.replace(/\.[^.]+$/, "")}.csv`, csv);
  }

  return (
    <form onSubmit={(e) => void dryRun(e)} className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <h2 className="text-sm font-semibold">1. Upload medicine catalogue</h2>
        <p className="text-sm text-slate-500">
          Import names, codes, and prices only. Workbook quantities are never posted to stock. Matching uses ATEN/SKU/barcode, then name + strength + form. Selling price is never copied from cost. Blank cells do not erase existing values.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => download("clinicflow-drugs.csv", DEFAULT_CSV_TEMPLATE)}>CSV template</Button>
          <Button variant="secondary" onClick={() => download("clinicflow-drugs-optional.csv", OPTIONAL_CSV_TEMPLATE)}>Optional-fields template</Button>
          <label className="inline-flex cursor-pointer items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
            Upload CSV or Excel
            <input
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && void onUpload(e.target.files[0])}
            />
          </label>
        </div>
        <Field label="CSV (editable after upload)">
          <textarea className={`${inputClass} min-h-[140px] font-mono text-xs`} value={text} onChange={(e) => { setText(e.target.value); setEdited(parseCsv(e.target.value).rows); setHeaders(parseCsv(e.target.value).headers); }} />
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
        <Button type="submit" disabled={busy}>{busy ? "Working…" : "2. Preview dry-run"}</Button>
      </div>

      {edited.length ? (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">{edited.length} rows loaded{parsedRows.length > 40 ? " (first 40 shown)" : ""}</h3>
          <Table headers={["Row", ...headers.slice(0, 8)]}>
            {edited.slice(0, 40).map((row, i) => (
              <tr key={i}>
                <td className="px-3 py-2 text-xs">{i + 2}</td>
                {headers.slice(0, 8).map((h) => (
                  <td key={h} className="px-3 py-2 text-xs">{row[h] || ""}</td>
                ))}
              </tr>
            ))}
          </Table>
        </div>
      ) : <Empty title="No catalogue rows yet." body="Upload the Excel/CSV list, then preview." />}

      {report ? (
        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold">{report.dryRun ? "3. Confirm catalogue-only import" : "Import result"}</h2>
          <p className="text-sm">
            {report.dryRun ? "Dry-run" : "Committed"} · {report.sourceRows} rows · {report.created} create · {report.updated} update · {report.skipped} skip · {report.rejected} reject · missing selling price {report.missingSellingPrice} · stock changes {report.stockChangesProposed}.
          </p>
          <div className="flex flex-wrap gap-2">
            {report.preview.some((row) => row.action === "reject" || row.action === "skip") ? (
              <Button variant="secondary" onClick={downloadRejected}>Download rejected / skipped rows</Button>
            ) : null}
            {report.dryRun ? <Button onClick={() => void commit()} disabled={busy}>Confirm catalogue import (no stock)</Button> : null}
          </div>
          <Table headers={["Row", "Name", "ATEN", "Cost", "Selling", "Match", "Action", "Messages"]}>
            {report.preview.slice(0, 120).map((row) => (
              <tr key={row.rowNumber} className={row.action === "reject" ? "bg-red-50" : row.action === "skip" ? "bg-amber-50" : undefined}>
                <td className="px-3 py-2">{row.rowNumber}</td>
                <td className="px-3 py-2">{row.name || "—"}</td>
                <td className="px-3 py-2">{row.aten || "—"}</td>
                <td className="px-3 py-2">{row.costPrice ?? "blank"}</td>
                <td className="px-3 py-2">{row.sellingPrice === null ? "unset" : row.sellingPrice}</td>
                <td className="px-3 py-2">{row.matchName || "—"}</td>
                <td className="px-3 py-2">{row.action}</td>
                <td className="px-3 py-2 text-xs">{[...row.errors, ...row.warnings].join(" ")}</td>
              </tr>
            ))}
          </Table>
          {report.preview.length > 120 ? <p className="text-xs text-slate-500">{report.preview.length} preview rows; first 120 shown. Download rejected rows for the rest.</p> : null}
        </div>
      ) : null}
      <p className="text-sm text-slate-500">Stock quantities are changed only under Stock take or Goods receiving — not by this catalogue import.</p>
    </form>
  );
}
