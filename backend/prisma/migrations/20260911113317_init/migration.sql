-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'RECEPTION', 'DOCTOR', 'LAB', 'PHARMACY', 'CASHIER');

-- CreateEnum
CREATE TYPE "EncounterStatus" AS ENUM ('REGISTERED', 'WAITING_CONSULTATION', 'IN_CONSULTATION', 'WAITING_LAB', 'LAB_PROCESSING', 'WAITING_PHARMACY', 'WAITING_PAYMENT', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Sex" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentPreference" AS ENUM ('CASH', 'INSURANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "LabResultType" AS ENUM ('TEXT', 'NUMERIC', 'POSITIVE_NEGATIVE', 'SELECT');

-- CreateEnum
CREATE TYPE "LabOrderStatus" AS ENUM ('REQUESTED', 'ACCEPTED', 'PROCESSING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PrescriptionStatus" AS ENUM ('PENDING', 'PARTIALLY_DISPENSED', 'DISPENSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('PURCHASE', 'DISPENSE', 'ADJUSTMENT', 'RETURN', 'OPENING_BALANCE');

-- CreateEnum
CREATE TYPE "ChargeStatus" AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'VOIDED');

-- CreateEnum
CREATE TYPE "ChargeSource" AS ENUM ('CONSULTATION', 'LABORATORY', 'PHARMACY', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'MPESA', 'CARD', 'INSURANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "SmsCampaignStatus" AS ENUM ('DRAFT', 'QUEUED', 'SENDING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "SmsMessageStatus" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED', 'DISABLED');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logoUrl" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#0F766E',
    "secondaryColor" TEXT NOT NULL DEFAULT '#0EA5E9',
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "website" TEXT,
    "receiptFooter" TEXT,
    "smsSenderId" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Nairobi',
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Patient" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientNumber" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "middleName" TEXT,
    "lastName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "alternativePhone" TEXT,
    "dateOfBirth" DATE,
    "ageYears" INTEGER,
    "sex" "Sex" NOT NULL,
    "address" TEXT,
    "nextOfKin" TEXT,
    "nextOfKinPhone" TEXT,
    "paymentMethod" "PaymentPreference" NOT NULL DEFAULT 'CASH',
    "insuranceProvider" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Patient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Encounter" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "visitNumber" TEXT NOT NULL,
    "status" "EncounterStatus" NOT NULL DEFAULT 'REGISTERED',
    "assignedDoctorId" TEXT,
    "createdById" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Encounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consultation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "chiefComplaint" TEXT,
    "historyOfPresentingComplaint" TEXT,
    "examination" TEXT,
    "assessment" TEXT,
    "plan" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Consultation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vitals" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "recordedById" TEXT NOT NULL,
    "systolicBp" INTEGER,
    "diastolicBp" INTEGER,
    "pulse" INTEGER,
    "temperature" DECIMAL(4,1),
    "spo2" INTEGER,
    "respiratoryRate" INTEGER,
    "weightKg" DECIMAL(5,1),
    "heightCm" DECIMAL(5,1),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vitals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Diagnosis" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icd10Code" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Diagnosis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabTest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'RAPID',
    "price" DECIMAL(12,2) NOT NULL,
    "resultType" "LabResultType" NOT NULL,
    "referenceRange" TEXT,
    "selectOptions" JSONB,
    "serviceId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabTest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabOrder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "orderedById" TEXT NOT NULL,
    "status" "LabOrderStatus" NOT NULL DEFAULT 'REQUESTED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabOrderItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "labOrderId" TEXT NOT NULL,
    "labTestId" TEXT NOT NULL,
    "chargeId" TEXT,
    "status" "LabOrderStatus" NOT NULL DEFAULT 'REQUESTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LabOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabResult" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "labOrderId" TEXT NOT NULL,
    "labOrderItemId" TEXT NOT NULL,
    "labTestId" TEXT NOT NULL,
    "performedById" TEXT NOT NULL,
    "valueText" TEXT,
    "valueNumeric" DECIMAL(12,3),
    "flag" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Medicine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "genericName" TEXT,
    "strength" TEXT,
    "dosageForm" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'unit',
    "sku" TEXT NOT NULL,
    "sellingPrice" DECIMAL(12,2) NOT NULL,
    "costPrice" DECIMAL(12,2) NOT NULL,
    "reorderLevel" INTEGER NOT NULL DEFAULT 10,
    "quantityOnHand" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Medicine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "medicineId" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "previousQuantity" INTEGER NOT NULL,
    "newQuantity" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prescription" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "status" "PrescriptionStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prescription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrescriptionItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "prescriptionId" TEXT NOT NULL,
    "medicineId" TEXT NOT NULL,
    "dose" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "duration" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "instructions" TEXT,
    "dispensedQty" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrescriptionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dispense" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "prescriptionId" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "pharmacistId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Dispense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DispenseItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dispenseId" TEXT NOT NULL,
    "prescriptionItemId" TEXT NOT NULL,
    "medicineId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "chargeId" TEXT,

    CONSTRAINT "DispenseItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Charge" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "serviceId" TEXT,
    "medicineId" TEXT,
    "source" "ChargeSource" NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "amountPaid" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "ChargeStatus" NOT NULL DEFAULT 'UNPAID',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Charge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "receivedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "issuedById" TEXT NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "amountPaid" DECIMAL(12,2) NOT NULL,
    "balance" DECIMAL(12,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsCampaign" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "SmsCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "queuedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmsCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsMessage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT,
    "toPhone" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "SmsMessageStatus" NOT NULL DEFAULT 'QUEUED',
    "provider" TEXT,
    "providerResponse" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmsMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "toEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "status" "EmailStatus" NOT NULL DEFAULT 'QUEUED',
    "provider" TEXT,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sequence" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL DEFAULT '',
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Sequence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");

-- CreateIndex
CREATE INDEX "User_tenantId_role_idx" ON "User"("tenantId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_email_key" ON "User"("tenantId", "email");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "PasswordResetToken_tokenHash_idx" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "Patient_tenantId_idx" ON "Patient"("tenantId");

-- CreateIndex
CREATE INDEX "Patient_tenantId_phone_idx" ON "Patient"("tenantId", "phone");

-- CreateIndex
CREATE INDEX "Patient_tenantId_lastName_firstName_idx" ON "Patient"("tenantId", "lastName", "firstName");

-- CreateIndex
CREATE INDEX "Patient_tenantId_patientNumber_idx" ON "Patient"("tenantId", "patientNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_tenantId_patientNumber_key" ON "Patient"("tenantId", "patientNumber");

-- CreateIndex
CREATE INDEX "Encounter_tenantId_idx" ON "Encounter"("tenantId");

-- CreateIndex
CREATE INDEX "Encounter_tenantId_startedAt_idx" ON "Encounter"("tenantId", "startedAt");

-- CreateIndex
CREATE INDEX "Encounter_tenantId_status_idx" ON "Encounter"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Encounter_tenantId_patientId_idx" ON "Encounter"("tenantId", "patientId");

-- CreateIndex
CREATE UNIQUE INDEX "Encounter_tenantId_visitNumber_key" ON "Encounter"("tenantId", "visitNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Consultation_encounterId_key" ON "Consultation"("encounterId");

-- CreateIndex
CREATE INDEX "Consultation_tenantId_idx" ON "Consultation"("tenantId");

-- CreateIndex
CREATE INDEX "Consultation_tenantId_patientId_idx" ON "Consultation"("tenantId", "patientId");

-- CreateIndex
CREATE INDEX "Vitals_tenantId_idx" ON "Vitals"("tenantId");

-- CreateIndex
CREATE INDEX "Vitals_tenantId_encounterId_idx" ON "Vitals"("tenantId", "encounterId");

-- CreateIndex
CREATE INDEX "Diagnosis_tenantId_idx" ON "Diagnosis"("tenantId");

-- CreateIndex
CREATE INDEX "Diagnosis_tenantId_encounterId_idx" ON "Diagnosis"("tenantId", "encounterId");

-- CreateIndex
CREATE INDEX "Service_tenantId_idx" ON "Service"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Service_tenantId_code_key" ON "Service"("tenantId", "code");

-- CreateIndex
CREATE INDEX "LabTest_tenantId_idx" ON "LabTest"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "LabTest_tenantId_code_key" ON "LabTest"("tenantId", "code");

-- CreateIndex
CREATE INDEX "LabOrder_tenantId_idx" ON "LabOrder"("tenantId");

-- CreateIndex
CREATE INDEX "LabOrder_tenantId_status_idx" ON "LabOrder"("tenantId", "status");

-- CreateIndex
CREATE INDEX "LabOrder_tenantId_encounterId_idx" ON "LabOrder"("tenantId", "encounterId");

-- CreateIndex
CREATE INDEX "LabOrderItem_tenantId_idx" ON "LabOrderItem"("tenantId");

-- CreateIndex
CREATE INDEX "LabOrderItem_tenantId_labOrderId_idx" ON "LabOrderItem"("tenantId", "labOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "LabResult_labOrderItemId_key" ON "LabResult"("labOrderItemId");

-- CreateIndex
CREATE INDEX "LabResult_tenantId_idx" ON "LabResult"("tenantId");

-- CreateIndex
CREATE INDEX "LabResult_tenantId_encounterId_idx" ON "LabResult"("tenantId", "encounterId");

-- CreateIndex
CREATE INDEX "Medicine_tenantId_idx" ON "Medicine"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Medicine_tenantId_sku_key" ON "Medicine"("tenantId", "sku");

-- CreateIndex
CREATE INDEX "StockMovement_tenantId_idx" ON "StockMovement"("tenantId");

-- CreateIndex
CREATE INDEX "StockMovement_tenantId_medicineId_idx" ON "StockMovement"("tenantId", "medicineId");

-- CreateIndex
CREATE INDEX "StockMovement_tenantId_createdAt_idx" ON "StockMovement"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Prescription_tenantId_idx" ON "Prescription"("tenantId");

-- CreateIndex
CREATE INDEX "Prescription_tenantId_status_idx" ON "Prescription"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Prescription_tenantId_encounterId_idx" ON "Prescription"("tenantId", "encounterId");

-- CreateIndex
CREATE INDEX "PrescriptionItem_tenantId_idx" ON "PrescriptionItem"("tenantId");

-- CreateIndex
CREATE INDEX "Dispense_tenantId_idx" ON "Dispense"("tenantId");

-- CreateIndex
CREATE INDEX "DispenseItem_tenantId_idx" ON "DispenseItem"("tenantId");

-- CreateIndex
CREATE INDEX "Charge_tenantId_idx" ON "Charge"("tenantId");

-- CreateIndex
CREATE INDEX "Charge_tenantId_encounterId_idx" ON "Charge"("tenantId", "encounterId");

-- CreateIndex
CREATE INDEX "Charge_tenantId_status_idx" ON "Charge"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Payment_tenantId_idx" ON "Payment"("tenantId");

-- CreateIndex
CREATE INDEX "Payment_tenantId_createdAt_idx" ON "Payment"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_tenantId_encounterId_idx" ON "Payment"("tenantId", "encounterId");

-- CreateIndex
CREATE INDEX "Receipt_tenantId_idx" ON "Receipt"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_tenantId_receiptNumber_key" ON "Receipt"("tenantId", "receiptNumber");

-- CreateIndex
CREATE INDEX "SmsCampaign_tenantId_idx" ON "SmsCampaign"("tenantId");

-- CreateIndex
CREATE INDEX "SmsMessage_tenantId_idx" ON "SmsMessage"("tenantId");

-- CreateIndex
CREATE INDEX "SmsMessage_status_idx" ON "SmsMessage"("status");

-- CreateIndex
CREATE INDEX "SmsMessage_campaignId_idx" ON "SmsMessage"("campaignId");

-- CreateIndex
CREATE INDEX "EmailRecord_tenantId_idx" ON "EmailRecord"("tenantId");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_idx" ON "AuditLog"("tenantId");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_entity_idx" ON "AuditLog"("tenantId", "entity");

-- CreateIndex
CREATE UNIQUE INDEX "Sequence_tenantId_name_dateKey_key" ON "Sequence"("tenantId", "name", "dateKey");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_assignedDoctorId_fkey" FOREIGN KEY ("assignedDoctorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vitals" ADD CONSTRAINT "Vitals_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vitals" ADD CONSTRAINT "Vitals_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vitals" ADD CONSTRAINT "Vitals_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vitals" ADD CONSTRAINT "Vitals_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Diagnosis" ADD CONSTRAINT "Diagnosis_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Diagnosis" ADD CONSTRAINT "Diagnosis_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Diagnosis" ADD CONSTRAINT "Diagnosis_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Diagnosis" ADD CONSTRAINT "Diagnosis_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabTest" ADD CONSTRAINT "LabTest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabOrder" ADD CONSTRAINT "LabOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabOrder" ADD CONSTRAINT "LabOrder_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabOrder" ADD CONSTRAINT "LabOrder_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabOrder" ADD CONSTRAINT "LabOrder_orderedById_fkey" FOREIGN KEY ("orderedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabOrderItem" ADD CONSTRAINT "LabOrderItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabOrderItem" ADD CONSTRAINT "LabOrderItem_labOrderId_fkey" FOREIGN KEY ("labOrderId") REFERENCES "LabOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabOrderItem" ADD CONSTRAINT "LabOrderItem_labTestId_fkey" FOREIGN KEY ("labTestId") REFERENCES "LabTest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabResult" ADD CONSTRAINT "LabResult_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabResult" ADD CONSTRAINT "LabResult_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabResult" ADD CONSTRAINT "LabResult_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabResult" ADD CONSTRAINT "LabResult_labOrderId_fkey" FOREIGN KEY ("labOrderId") REFERENCES "LabOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabResult" ADD CONSTRAINT "LabResult_labOrderItemId_fkey" FOREIGN KEY ("labOrderItemId") REFERENCES "LabOrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabResult" ADD CONSTRAINT "LabResult_labTestId_fkey" FOREIGN KEY ("labTestId") REFERENCES "LabTest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabResult" ADD CONSTRAINT "LabResult_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Medicine" ADD CONSTRAINT "Medicine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "Medicine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionItem" ADD CONSTRAINT "PrescriptionItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionItem" ADD CONSTRAINT "PrescriptionItem_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionItem" ADD CONSTRAINT "PrescriptionItem_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "Medicine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispense" ADD CONSTRAINT "Dispense_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispense" ADD CONSTRAINT "Dispense_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispense" ADD CONSTRAINT "Dispense_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispense" ADD CONSTRAINT "Dispense_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispense" ADD CONSTRAINT "Dispense_pharmacistId_fkey" FOREIGN KEY ("pharmacistId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispenseItem" ADD CONSTRAINT "DispenseItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispenseItem" ADD CONSTRAINT "DispenseItem_dispenseId_fkey" FOREIGN KEY ("dispenseId") REFERENCES "Dispense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispenseItem" ADD CONSTRAINT "DispenseItem_prescriptionItemId_fkey" FOREIGN KEY ("prescriptionItemId") REFERENCES "PrescriptionItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispenseItem" ADD CONSTRAINT "DispenseItem_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "Medicine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "Medicine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Receipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsCampaign" ADD CONSTRAINT "SmsCampaign_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsCampaign" ADD CONSTRAINT "SmsCampaign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsMessage" ADD CONSTRAINT "SmsMessage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsMessage" ADD CONSTRAINT "SmsMessage_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "SmsCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailRecord" ADD CONSTRAINT "EmailRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sequence" ADD CONSTRAINT "Sequence_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
