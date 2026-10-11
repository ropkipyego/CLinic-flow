import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { readXlsxRowsFromFile } from "../lib/xlsxRows.js";
import { importPharmacyCatalogue, parseCatalogueRows } from "../services/pharmacyCatalogueImport.js";

function arg(name: string) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function hasFlag(name: string) {
  return process.argv.includes(name);
}

async function main() {
  const file = arg("--file");
  const slug = arg("--tenant-slug");
  const dryRun = !hasFlag("--write");
  if (!file || !slug) {
    console.error("Usage: tsx src/scripts/importPharmacyCatalogue.ts --file <xlsx> --tenant-slug <slug> [--write]");
    process.exit(1);
  }
  if (hasFlag("--write") && (env.isProduction || env.nodeEnv === "production")) {
    console.error(
      "Production catalogue import must be confirmed in the signed-in admin UI (Stock → Catalogue import). CLI --write is disabled in production.",
    );
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
  const rows = parseCatalogueRows(readXlsxRowsFromFile(file));
  const report = await importPharmacyCatalogue({
    tenantId: tenant.id,
    actorId: actor.id,
    actorRole: actor.role,
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
