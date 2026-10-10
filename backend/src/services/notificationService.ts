import { prisma } from "../lib/prisma.js";
import { notFound } from "../lib/errors.js";

export async function listInbox(tenantId: string, userId: string) {
  return prisma.inboxNotification.findMany({
    where: { tenantId, userId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export async function markInboxRead(tenantId: string, userId: string, id: string) {
  const row = await prisma.inboxNotification.findFirst({ where: { id, tenantId, userId } });
  if (!row) throw notFound("Notification not found.");
  if (row.readAt) return row;
  return prisma.inboxNotification.update({ where: { id }, data: { readAt: new Date() } });
}

export async function notifyUsers(input: {
  tenantId: string;
  userIds: string[];
  type: string;
  title: string;
  body: string;
  href?: string | null;
  entityId: string;
}) {
  const unique = [...new Set(input.userIds.filter(Boolean))];
  for (const userId of unique) {
    try {
      await prisma.inboxNotification.upsert({
        where: {
          tenantId_userId_type_entityId: {
            tenantId: input.tenantId,
            userId,
            type: input.type,
            entityId: input.entityId,
          },
        },
        create: {
          tenantId: input.tenantId,
          userId,
          type: input.type,
          title: input.title,
          body: input.body,
          href: input.href ?? null,
          entityId: input.entityId,
        },
        update: {},
      });
    } catch {
      /* notification failure must not undo the clinical action */
    }
  }
}
