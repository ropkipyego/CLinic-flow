import { Prisma } from "@prisma/client";

export function isUniqueConstraintError(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return true;
  const code = typeof err === "object" && err && "code" in err ? String((err as { code: unknown }).code) : "";
  if (code === "23505") return true;
  const message = err instanceof Error ? err.message : String(err);
  return (
    message.includes("ImportBatch_opening_stock_posted_uniq") ||
    message.includes("GoodsReceipt_tenantId_clientRequestId")
  );
}
