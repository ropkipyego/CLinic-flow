-- Lab result verification (existing results are treated as already verified)
ALTER TABLE "LabResult" ADD COLUMN "verifiedAt" TIMESTAMP(3);
ALTER TABLE "LabResult" ADD COLUMN "verifiedById" TEXT;
UPDATE "LabResult" SET "verifiedAt" = "createdAt", "verifiedById" = "performedById" WHERE "verifiedAt" IS NULL;
ALTER TABLE "LabResult" ADD CONSTRAINT "LabResult_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Medicine" ADD COLUMN "category" TEXT;

ALTER TABLE "Prescription" ADD COLUMN "treatmentNumber" TEXT;
WITH numbered AS (
  SELECT id, "tenantId", ROW_NUMBER() OVER (PARTITION BY "tenantId" ORDER BY "createdAt") AS n
  FROM "Prescription"
)
UPDATE "Prescription" p
SET "treatmentNumber" = 'TR-' || LPAD(numbered.n::text, 4, '0')
FROM numbered
WHERE p.id = numbered.id AND p."treatmentNumber" IS NULL;
CREATE UNIQUE INDEX "Prescription_tenantId_treatmentNumber_key" ON "Prescription"("tenantId", "treatmentNumber");

ALTER TABLE "StockTakeLine" ADD COLUMN "batchNumber" TEXT;
ALTER TABLE "StockTakeLine" ADD COLUMN "expiryDate" DATE;
ALTER TABLE "StockTakeLine" ADD COLUMN "notes" TEXT;

CREATE TABLE "InboxNotification" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "href" TEXT,
    "entityId" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InboxNotification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InboxNotification_tenantId_userId_type_entityId_key" ON "InboxNotification"("tenantId", "userId", "type", "entityId");
CREATE INDEX "InboxNotification_tenantId_userId_createdAt_idx" ON "InboxNotification"("tenantId", "userId", "createdAt");
ALTER TABLE "InboxNotification" ADD CONSTRAINT "InboxNotification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InboxNotification" ADD CONSTRAINT "InboxNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CatalogueImportMap" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "medicineId" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CatalogueImportMap_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CatalogueImportMap_tenantId_sourceKey_key" ON "CatalogueImportMap"("tenantId", "sourceKey");
CREATE INDEX "CatalogueImportMap_tenantId_idx" ON "CatalogueImportMap"("tenantId");
ALTER TABLE "CatalogueImportMap" ADD CONSTRAINT "CatalogueImportMap_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CatalogueImportMap" ADD CONSTRAINT "CatalogueImportMap_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "Medicine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
