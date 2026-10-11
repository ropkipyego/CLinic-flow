-- AlterEnum
ALTER TYPE "PurchaseOrderStatus" ADD VALUE IF NOT EXISTS 'PENDING_APPROVAL';
ALTER TYPE "PurchaseOrderStatus" ADD VALUE IF NOT EXISTS 'APPROVED';

-- AlterTable Tenant
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "taxPin" TEXT;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "lpoDeliveryLocation" TEXT;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "lpoPaymentTerms" TEXT;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "lpoStandardTerms" TEXT;

-- AlterTable Medicine: selling price may be unset; never infer from cost
ALTER TABLE "Medicine" ALTER COLUMN "sellingPrice" DROP NOT NULL;

-- AlterTable Supplier
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "contactName" TEXT;
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "address" TEXT;
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "taxPin" TEXT;

-- AlterTable PurchaseOrder
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "orderDate" DATE NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMP(3);
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3);
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "deliveryLocation" TEXT;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "paymentTerms" TEXT;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "deliveryInstructions" TEXT;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "quotationNumber" TEXT;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "taxPercent" DECIMAL(6,2) NOT NULL DEFAULT 0;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "deliveryCharge" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "reprintCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "duplicatedFromId" TEXT;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "approvedById" TEXT;

ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_duplicatedFromId_fkey" FOREIGN KEY ("duplicatedFromId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable GoodsReceipt
ALTER TABLE "GoodsReceipt" ADD COLUMN IF NOT EXISTS "clientRequestId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "GoodsReceipt_tenantId_clientRequestId_key" ON "GoodsReceipt"("tenantId", "clientRequestId");

-- CreateTable ImportBatch
CREATE TABLE IF NOT EXISTS "ImportBatch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "sourceFilename" TEXT,
    "dryRun" BOOLEAN NOT NULL DEFAULT true,
    "summary" JSONB,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ImportBatch_tenantId_kind_sourceHash_idx" ON "ImportBatch"("tenantId", "kind", "sourceHash");
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
