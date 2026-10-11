import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const XLSX_PY = `
import json, sys, zipfile, xml.etree.ElementTree as ET
path = sys.argv[1]
ns = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
with zipfile.ZipFile(path) as z:
    shared = []
    if 'xl/sharedStrings.xml' in z.namelist():
        root = ET.fromstring(z.read('xl/sharedStrings.xml'))
        for si in root.findall('m:si', ns):
            shared.append(''.join(t.text or '' for t in si.findall('.//m:t', ns)))
    root = ET.fromstring(z.read('xl/worksheets/sheet1.xml'))
    rows = root.findall('m:sheetData/m:row', ns)
    def cell_val(c):
        t = c.attrib.get('t')
        v = c.find('m:v', ns)
        if v is None:
            isel = c.find('m:is', ns)
            if isel is None: return ''
            return ''.join(t.text or '' for t in isel.findall('.//m:t', ns))
        if t == 's':
            return shared[int(v.text)]
        return v.text or ''
    def row_map(r, header=None):
        vals = {}
        for c in r.findall('m:c', ns):
            ref = c.attrib.get('r', 'A1')
            col = ''.join(x for x in ref if x.isalpha())
            n = 0
            for ch in col:
                n = n * 26 + (ord(ch) - 64)
            vals[n-1] = cell_val(c)
        if header is None:
            width = max(vals.keys(), default=-1) + 1
            return [vals.get(i, '') for i in range(width)]
        rec = {}
        for i, h in enumerate(header):
            if h:
                rec[h] = vals.get(i, '')
        return rec
    if not rows:
        json.dump([], sys.stdout)
        raise SystemExit
    header = row_map(rows[0])
    out = [row_map(r, header) for r in rows[1:]]
    json.dump(out, sys.stdout, ensure_ascii=False)
`;

export function readXlsxRowsFromFile(file: string): Record<string, unknown>[] {
  const json = execFileSync("python3", ["-c", XLSX_PY, file], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  return JSON.parse(json) as Record<string, unknown>[];
}

export function readXlsxRowsFromBuffer(buf: Buffer): Record<string, unknown>[] {
  const dir = mkdtempSync(join(tmpdir(), "clinicflow-xlsx-"));
  const file = join(dir, "catalogue.xlsx");
  try {
    writeFileSync(file, buf);
    return readXlsxRowsFromFile(file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
