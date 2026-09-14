import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { getSmsProvider } from "../services/sms/index.js";

export async function processSmsBatch(limit = 20) {
  const queuedCampaigns = await prisma.smsCampaign.findMany({
    where: { status: { in: ["QUEUED", "SENDING"] } },
    select: { id: true },
  });
  const campaignIds = queuedCampaigns.map((c) => c.id);

  const messages = await prisma.smsMessage.findMany({
    where: {
      status: { in: ["QUEUED", "FAILED"] },
      attempts: { lt: env.smsMaxAttempts },
      OR: [{ campaignId: null }, { campaignId: { in: campaignIds.length ? campaignIds : ["__none__"] } }],
    },
    include: { campaign: { include: { tenant: true } }, tenant: true },
    take: limit,
    orderBy: { createdAt: "asc" },
  });

  const provider = getSmsProvider();

  for (const message of messages) {
    if (message.campaignId) {
      await prisma.smsCampaign.update({
        where: { id: message.campaignId },
        data: { status: "SENDING" },
      });
    }
    await prisma.smsMessage.update({
      where: { id: message.id },
      data: { status: "SENDING", attempts: { increment: 1 } },
    });

    if (!env.sms.enabled) {
      await prisma.smsMessage.update({
        where: { id: message.id },
        data: {
          status: "FAILED",
          lastError: "SMS is disabled. Enable SMS_ENABLED only in a controlled environment.",
          provider: provider.name,
        },
      });
      continue;
    }

    const result = await provider.send({
      to: message.toPhone,
      body: message.body,
      senderId: message.tenant.smsSenderId || env.sms.senderId,
    });

    if (result.ok) {
      await prisma.smsMessage.update({
        where: { id: message.id },
        data: {
          status: "SENT",
          sentAt: new Date(),
          provider: result.provider,
          providerResponse: result.response ?? null,
          lastError: null,
        },
      });
    } else {
      const attempts = message.attempts + 1;
      const giveUp = !result.retryable || attempts >= env.smsMaxAttempts;
      await prisma.smsMessage.update({
        where: { id: message.id },
        data: {
          status: giveUp ? "FAILED" : "QUEUED",
          provider: result.provider,
          providerResponse: result.response ?? null,
          lastError: result.error ?? "Send failed",
        },
      });
    }
  }

  for (const campaign of queuedCampaigns) {
    const remaining = await prisma.smsMessage.count({
      where: { campaignId: campaign.id, status: { in: ["QUEUED", "SENDING"] } },
    });
    if (remaining === 0) {
      const sent = await prisma.smsMessage.count({ where: { campaignId: campaign.id, status: "SENT" } });
      const failed = await prisma.smsMessage.count({ where: { campaignId: campaign.id, status: "FAILED" } });
      await prisma.smsCampaign.update({
        where: { id: campaign.id },
        data: {
          status: failed && !sent ? "FAILED" : "COMPLETED",
          sentCount: sent,
          failedCount: failed,
          completedAt: new Date(),
        },
      });
    }
  }

  return messages.length;
}

export function startSmsWorker() {
  console.info("ClinicFlow SMS worker started");
  const tick = async () => {
    try {
      await processSmsBatch();
    } catch (error) {
      console.error("[sms-worker]", error);
    }
  };
  void tick();
  return setInterval(tick, env.smsWorkerPollMs);
}

if (process.argv[1]?.includes("smsWorker")) {
  startSmsWorker();
}
