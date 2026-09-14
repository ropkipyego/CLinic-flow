import { env } from "./config/env.js";
import { createApp } from "./app.js";
import { prisma } from "./lib/prisma.js";
import { startSmsWorker } from "./workers/smsWorker.js";

async function main() {
  await prisma.$connect();
  const app = createApp();
  app.listen(env.port, () => {
    console.info(`${env.appName} API listening on ${env.port} (${env.nodeEnv})`);
  });
  if (process.env.RUN_SMS_WORKER === "true") {
    startSmsWorker();
  }
}

main().catch((error) => {
  console.error("Failed to start ClinicFlow API", error);
  process.exit(1);
});
