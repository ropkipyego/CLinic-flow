/** RFC 4180 CSV parser shared with the ClinicFlow import UI. */
export function parseCsvRecords(text: string): string[][] {
  const records: string[][] = [];
  let row: string[] = [];
  let field = "";
  let i = 0;
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    if (row.length === 1 && row[0] === "" && !inQuotes) {
      row = [];
      return;
    }
    records.push(row);
    row = [];
  };

  while (i < text.length) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      pushField();
      i += 1;
      continue;
    }
    if (ch === "\r") {
      i += 1;
      continue;
    }
    if (ch === "\n") {
      pushField();
      pushRow();
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  if (inQuotes) throw new Error("CSV has an unclosed quoted field.");
  if (field.length > 0 || row.length > 0) {
    pushField();
    pushRow();
  }
  return records.filter((r) => r.some((cell) => cell.trim() !== ""));
}

export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const records = parseCsvRecords(text);
  if (!records.length) return { headers: [], rows: [] };
  const headers = records[0]!.map((h) => h.trim());
  const rows = records.slice(1).map((cols) => {
    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header] = cols[idx] ?? "";
    });
    return row;
  });
  return { headers, rows };
}

export async function sha256Hex(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const DEFAULT_CSV_TEMPLATE = "name,quantity,aten,costPrice\nParacetamol 500mg,0,PARA500,4.00\n";
export const OPTIONAL_CSV_TEMPLATE =
  "name,quantity,aten,costPrice,sellingPrice,description,unit,genericName,strength,dosageForm,category,manufacturer\nParacetamol 500mg,0,PARA500,4.00,10.00,Analgesic,tab,Paracetamol,500mg,Tablet,ANALGESIC,\n";
