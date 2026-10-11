import { FormEvent, useState } from "react";
import { post } from "../../api/client";
import { Button, Empty } from "../../components/ui";

type Report = {
  sourceRows: number;
  validCatalogueItems: number;
  created: number;
  matched: number;
  skipped: number;
  unresolved: number;
  zeroPrice: number;
  missingSellingPrice: number;
  missingDescription: number;
  missingUnit: number;
  negativeQuantity: number;
  stockChangesProposed: number;
  dryRun: boolean;
  issues: Array<{ row: number; item: string; code: string; detail: string }>;
};

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0]!.split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cols = line.split(",").map((c) => c.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = cols[i] || "";
    });
    return row;
  });
}

export function CatalogueImportPanel() {
  const [text, setText] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");

  async function onFile(file: File) {
    setText(await file.text());
    setReport(null);
  }

  async function dryRun(e: FormEvent) {
    e.preventDefault();
    const rows = parseCsv(text);
    if (!rows.length) {
      setError("Need a CSV with a header row. Save the Excel workbook as CSV first.");
      return;
    }
    try {
      setError("");
      const result = await post<Report>("/pharmacy/catalogue/import", { rows, dryRun: true });
      setReport(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dry-run failed.");
    }
  }

  return (
    <form onSubmit={(e) => void dryRun(e)} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold">Catalogue dry-run</h2>
      <p className="text-sm text-slate-500">
        Upload a CSV of the medicine list (Item, Description, Quantity On Hand, Cost, PRICE). This never writes stock.
        Blank PRICE rows are skipped — Cost is not used as a selling price. Writes stay blocked until approved.
      </p>
      <input
        type="file"
        accept=".csv,text/csv"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void onFile(file);
        }}
      />
      <textarea
        className="h-32 w-full rounded-lg border border-slate-200 p-2 font-mono text-xs"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste CSV including the header row"
      />
      <Button type="submit">Run dry-run</Button>
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      {report ? (
        <div className="space-y-2 text-sm">
          <p>
            Rows {report.sourceRows} · valid with selling price {report.validCatalogueItems} · would create {report.created} ·
            matched {report.matched} · skipped {report.skipped} · ambiguous {report.unresolved} · missing PRICE{" "}
            {report.missingSellingPrice} · stock changes proposed {report.stockChangesProposed}.
          </p>
          {report.issues.length === 0 ? <Empty title="No row-level issues." /> : (
            <ul className="max-h-64 overflow-auto rounded-lg border border-slate-100 p-2 text-xs">
              {report.issues.slice(0, 80).map((issue, i) => (
                <li key={`${issue.row}-${i}`}>
                  Row {issue.row} {issue.item}: {issue.code} — {issue.detail}
                </li>
              ))}
              {report.issues.length > 80 ? <li>… {report.issues.length - 80} more</li> : null}
            </ul>
          )}
        </div>
      ) : null}
    </form>
  );
}
