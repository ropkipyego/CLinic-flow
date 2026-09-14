-- CreateEnum
CREATE TYPE "VisitType" AS ENUM ('STANDARD', 'WALK_IN_LAB', 'OTC_PHARMACY');

-- AlterTable
ALTER TABLE "Encounter" ADD COLUMN "visitType" "VisitType" NOT NULL DEFAULT 'STANDARD';
ALTER TABLE "Encounter" ADD COLUMN "clientRequestId" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "clientRequestId" TEXT;

-- CreateIndex
CREATE INDEX "Encounter_tenantId_visitType_idx" ON "Encounter"("tenantId", "visitType");

-- CreateIndex
CREATE UNIQUE INDEX "Encounter_tenantId_clientRequestId_key" ON "Encounter"("tenantId", "clientRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_tenantId_clientRequestId_key" ON "Payment"("tenantId", "clientRequestId");
