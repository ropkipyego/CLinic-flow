-- Additive: session invalidation, phone search, patient create idempotency.
-- Does not drop or rewrite existing patient, encounter, billing, or stock rows.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "tokenVersion" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "phoneNormalized" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "clientRequestId" TEXT;

UPDATE "Patient"
SET "phoneNormalized" = right(regexp_replace(coalesce("phone", ''), '\D', '', 'g'), 9)
WHERE "phoneNormalized" = '' AND coalesce("phone", '') <> '';

CREATE INDEX IF NOT EXISTS "Patient_tenantId_phoneNormalized_idx"
ON "Patient" ("tenantId", "phoneNormalized");

CREATE UNIQUE INDEX IF NOT EXISTS "Patient_tenantId_clientRequestId_key"
ON "Patient" ("tenantId", "clientRequestId");
