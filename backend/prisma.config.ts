import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "prisma/config";
import { config as loadEnv } from "dotenv";

const candidates = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "..", ".env.development"),
];
for (const file of candidates) {
  if (fs.existsSync(file)) loadEnv({ path: file, override: false });
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
