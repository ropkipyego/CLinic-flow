import { FormEvent, useState } from "react";
import { postForm } from "../../api/client";
import { Button, Empty, Field, Table, inputClass } from "../../components/ui";
import { useToast } from "../../components/ToastProvider";
import { DEFAULT_CSV_TEMPLATE, OPTIONAL_CSV_TEMPLATE } from "../../lib/csv";
import { resolveHeaderMapping } from "../../lib/catalogueHeaders";

type PreviewRow = {
  rowNumber: number;
  name: string;
  aten: string;
  costPrice: number | null;
  sellingPrice: number | null;
  errors: string[];
  warnings: string[];
  action: string;
  matchName: string | null;
};

type Report = {
  sourceRows: number;
  created: number;
  updated: number;
  skipped: number;
  rejected: number;
  missingSellingPrice: number;
  stockChangesProposed: number;
  dryRun: boolean;
  preview: PreviewRow[];
  previewTruncated?: boolean;
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

export function CatalogueImportPanel({ onSaved }: { onSaved?: () => Promise<void> }) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [filename, setFilename] = useState("");
  const [rowCount, setRowCount] = useState(0);
  const [headers, setHeaders] = useState<string[]>([]);
  const [sampleRows, setSampleRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);

  async function onUpload(next: File) {
    try {
      setBusy(true);
      setReport(null);
      const form = new FormData();
      form.append("file", next);
      const parsed = await postForm<{
        headers: string[];
        rowCount: number;
        sampleRows: Record<string, unknown>[];
        suggestedMapping: Record<string, string>;
      }>("/pharmacy/catalogue/parse-workbook", form);
      setFile(next);
      setFilename(next.name);
      setRowCount(parsed.rowCount);
      setHeaders(parsed.headers);
      setSampleRows(
        (parsed.sampleRows || []).map((r) => {
          const rec: Record<string, string> = {};
          for (const [k, v] of Object.entries(r)) rec[k] = v == null ? "" : String(v);
          return rec;
        }),
      );
      setMapping((parsed.suggestedMapping as Record<string, string>) || (resolveHeaderMapping(parsed.headers) as Record<string, string>));
      toast.push(`Mapped ${parsed.rowCount} workbook rows onto the medicine catalogue. Preview a dry-run before importing.`, "info");
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Unable to read that file.", "error");
    } finally {
      setBusy(false);
    }
  }

  function formPayload(dryRun: boolean) {
    if (!file) throw new Error("Upload the Excel or CSV file first.");
    const form = new FormData();
    form.append("file", file);
    form.append("mapping", JSON.stringify(mapping));
    form.append("dryRun", dryRun ? "true" : "false");
    form.append("sourceFilename", filename);
    return form;
  }

  async function dryRun(e: FormEvent) {
    e.preventDefault();
    try {
      setBusy(true);
      const result = await postForm<Report>("/pharmacy/catalogue/import", formPayload(true));
      setReport(result);
      toast.push(
        `Dry-run: ${result.sourceRows} rows will map to ${result.created} new and ${result.updated} existing catalogue items. Stock changes: ${result.stockChangesProposed}.`,
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
        `Write this list into the medicine catalogue?\n\n${report.created} new items · ${report.updated} updates.\nStock quantities will not change.`,
      )
    ) {
      return;
    }
    try {
      setBusy(true);
      const result = await postForm<Report>("/pharmacy/catalogue/import", formPayload(false));
      setReport(result);
      toast.push(`Catalogue updated: ${result.created} added, ${result.updated} matched. Stock was not changed.`, "success");
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
        <h2 className="text-sm font-semibold">Map workbook → medicine catalogue</h2>
        <p className="text-sm text-slate-500">
          Upload the Excel/CSV once. Columns are mapped to the existing Medicine master (name, SKU/ATEN, cost, optional selling price). Quantities in the file are ignored. The file is sent as a file upload, not pasted as thousands of JSON rows.
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
        {file ? (
          <p className="text-sm text-slate-700">
            {filename} · {rowCount} rows ready to map
          </p>
        ) : null}
        {headers.length ? (
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
            {FIELDS.map(([field, label]) => (
              <Field key={field} label={label}>
                <select className={inputClass} value={mapping[field] || ""} onChange={(e) => setMapping((s) => ({ ...s, [field]: e.target.value }))}>
                  <option value="">Not mapped</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </Field>
            ))}
          </div>
        ) : null}
        <Button type="submit" disabled={busy || !file}>{busy ? "Working…" : "Preview dry-run"}</Button>
      </div>

      {sampleRows.length ? (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Column sample (not the full {rowCount} rows)</h3>
          <Table headers={["#", ...headers.slice(0, 8)]}>
            {sampleRows.map((row, i) => (
              <tr key={i}>
                <td className="px-3 py-2 text-xs">{i + 2}</td>
                {headers.slice(0, 8).map((h) => (
                  <td key={h} className="px-3 py-2 text-xs">{row[h] || ""}</td>
                ))}
              </tr>
            ))}
          </Table>
        </div>
      ) : (
        <Empty title="No catalogue file yet." body="Upload the Excel list. ClinicFlow maps it onto the medicine table without loading every cell into the browser." />
      )}

      {report ? (
        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold">{report.dryRun ? "Confirm catalogue mapping" : "Import result"}</h2>
          <p className="text-sm">
            {report.dryRun ? "Dry-run" : "Committed"} · {report.sourceRows} rows · {report.created} create · {report.updated} update · {report.skipped} skip · {report.rejected} reject · missing selling price {report.missingSellingPrice} · stock changes {report.stockChangesProposed}.
          </p>
          <div className="flex flex-wrap gap-2">
            {report.preview.some((row) => row.action === "reject" || row.action === "skip") ? (
              <Button variant="secondary" onClick={downloadRejected}>Download rejected / skipped rows</Button>
            ) : null}
            {report.dryRun ? <Button onClick={() => void commit()} disabled={busy}>Write to medicine catalogue (no stock)</Button> : null}
          </div>
          <Table headers={["Row", "Name", "ATEN", "Cost", "Selling", "Match", "Action", "Messages"]}>
            {report.preview.map((row) => (
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
          {report.previewTruncated ? <p className="text-xs text-slate-500">Showing exceptions plus a sample of matched rows. Counts above are for the full file.</p> : null}
        </div>
      ) : null}
    </form>
  );
}
