import { execFileSync } from "node:child_process";
import { catalogueWritesBlocked } from "../lib/catalogueWriteGuard.js";
import { prisma } from "../lib/prisma.js";
import { importPharmacyCatalogue, parseCatalogueRows } from "../services/pharmacyCatalogueImport.js";

function arg(name: string) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function hasFlag(name: string) {
  return process.argv.includes(name);
}

function readXlsxRows(file: string): Record<string, unknown>[] {
  const py = `
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
    header = row_map(rows[0])
    out = [row_map(r, header) for r in rows[1:]]
    json.dump(out, sys.stdout, ensure_ascii=False)
`;
  const json = execFileSync("python3", ["-c", py, file], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  return JSON.parse(json) as Record<string, unknown>[];
}

async function main() {
  const file = arg("--file");
  const slug = arg("--tenant-slug");
  const dryRun = !hasFlag("--write");
  if (!file || !slug) {
    console.error("Usage: tsx src/scripts/importPharmacyCatalogue.ts --file <xlsx> --tenant-slug <slug> [--write]");
    process.exit(1);
  }
  if (hasFlag("--write") && catalogueWritesBlocked()) {
    console.error("Refusing to write catalogue import. Production never allows writes; non-production requires CATALOGUE_IMPORT_WRITE=true.");
    process.exit(1);
  }
  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant) {
    console.error("Tenant not found for that slug.");
    process.exit(1);
  }
  const actor = await prisma.user.findFirst({
    where: { tenantId: tenant.id, role: { in: ["SUPER_ADMIN", "ADMIN"] }, active: true },
    orderBy: { createdAt: "asc" },
  });
  if (!actor) {
    console.error("No administrator user found for this tenant.");
    process.exit(1);
  }
  const rows = parseCatalogueRows(readXlsxRows(file));
  const report = await importPharmacyCatalogue({
    tenantId: tenant.id,
    actorId: actor.id,
    rows,
    dryRun,
  });
  console.log(JSON.stringify(report, null, 2));
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err instanceof Error ? err.message : err);
  await prisma.$disconnect();
  process.exit(1);
});
