import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { writeAudit } from "../lib/audit.js";
import { badRequest, notFound } from "../lib/errors.js";

export const campaignSchema = z.object({
  name: z.string().min(1),
  message: z.string().min(1).max(480),
  recipientPhones: z.array(z.string().min(7)).optional(),
  recipientPatientIds: z.array(z.string().uuid()).optional(),
});

export async function listCampaigns(tenantId: string) {
  return prisma.smsCampaign.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { messages: true } } },
  });
}

export async function getCampaign(tenantId: string, id: string) {
  const campaign = await prisma.smsCampaign.findFirst({
    where: { id, tenantId },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!campaign) throw notFound("SMS campaign not found.");
  return campaign;
}

export async function createCampaign(
  tenantId: string,
  actorId: string,
  input: z.infer<typeof campaignSchema>,
) {
  const phones = new Set(input.recipientPhones ?? []);
  if (input.recipientPatientIds?.length) {
    const patients = await prisma.patient.findMany({
      where: { tenantId, id: { in: input.recipientPatientIds } },
      select: { phone: true },
    });
    for (const p of patients) phones.add(p.phone);
  }
  if (!phones.size) throw badRequest("Select at least one recipient.");

  const campaign = await prisma.smsCampaign.create({
    data: {
      tenantId,
      name: input.name,
      message: input.message,
      createdById: actorId,
      messages: {
        create: [...phones].map((phone) => ({
          tenantId,
          toPhone: phone,
          body: input.message,
          status: "QUEUED" as const,
        })),
      },
    },
    include: { messages: true },
  });
  await writeAudit({
    tenantId,
    userId: actorId,
    action: "sms_campaign.created",
    entity: "sms_campaign",
    entityId: campaign.id,
    metadata: { recipients: phones.size },
  });
  return campaign;
}

export async function queueCampaign(tenantId: string, actorId: string, id: string) {
  const campaign = await prisma.smsCampaign.findFirst({ where: { id, tenantId } });
  if (!campaign) throw notFound("SMS campaign not found.");
  if (campaign.status !== "DRAFT" && campaign.status !== "FAILED") {
    throw badRequest("Only draft or failed campaigns can be queued.");
  }
  const updated = await prisma.smsCampaign.update({
    where: { id },
    data: { status: "QUEUED", queuedAt: new Date() },
    include: { messages: true, _count: { select: { messages: true } } },
  });
  await writeAudit({
    tenantId,
    userId: actorId,
    action: "sms_campaign.queued",
    entity: "sms_campaign",
    entityId: id,
  });
  return updated;
}

export async function previewCampaign(message: string, recipients: string[]) {
  return {
    message,
    recipientCount: recipients.length,
    sample: recipients.slice(0, 5),
    characterCount: message.length,
  };
}
