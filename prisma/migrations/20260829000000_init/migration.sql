-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RECOVERED', 'FAILED', 'EXPIRED', 'MANUAL_REVIEW');

-- CreateEnum
CREATE TYPE "AttemptChannel" AS ENUM ('PAYMENT_LINK', 'SMS', 'EMAIL', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'CLICKED', 'PAID', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "WebhookStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED');

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('SYSTEM', 'AGENT', 'OPERATOR', 'MERCHANT');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED', 'MANUAL_REVIEW');

-- CreateTable
CREATE TABLE "MerchantPolicy" (
    "id" UUID NOT NULL,
    "merchantId" TEXT NOT NULL,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "coolingPeriodMinutes" INTEGER NOT NULL DEFAULT 30,
    "linkExpiryMinutes" INTEGER NOT NULL DEFAULT 1440,
    "autoRefundEnabled" BOOLEAN NOT NULL DEFAULT false,
    "autoRefundThresholdMinor" BIGINT NOT NULL DEFAULT 0,
    "allowPartialPayment" BOOLEAN NOT NULL DEFAULT false,
    "preferredChannels" "AttemptChannel"[] DEFAULT ARRAY['PAYMENT_LINK', 'EMAIL']::"AttemptChannel"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecoveryCase" (
    "id" UUID NOT NULL,
    "merchantId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "orderId" TEXT,
    "customerEmail" TEXT,
    "customerPhone" TEXT,
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "CaseStatus" NOT NULL DEFAULT 'OPEN',
    "failureCode" TEXT,
    "failureReason" TEXT,
    "strategy" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "failedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recoveredAt" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecoveryCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecoveryAttempt" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "channel" "AttemptChannel" NOT NULL DEFAULT 'PAYMENT_LINK',
    "status" "AttemptStatus" NOT NULL DEFAULT 'PENDING',
    "paymentLinkId" TEXT,
    "paymentLinkUrl" TEXT,
    "errorMessage" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecoveryAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" UUID NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "WebhookStatus" NOT NULL DEFAULT 'RECEIVED',
    "signature" TEXT NOT NULL,
    "error" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseAuditLog" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "actorType" "AuditActorType" NOT NULL DEFAULT 'SYSTEM',
    "actorId" TEXT,
    "previousState" JSONB,
    "newState" JSONB,
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefundTask" (
    "id" UUID NOT NULL,
    "caseId" UUID,
    "paymentId" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "refundId" TEXT,
    "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
    "failureReason" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RefundTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MerchantPolicy_merchantId_key" ON "MerchantPolicy"("merchantId");

-- CreateIndex
CREATE INDEX "MerchantPolicy_merchantId_idx" ON "MerchantPolicy"("merchantId");

-- CreateIndex
CREATE INDEX "RecoveryCase_merchantId_status_idx" ON "RecoveryCase"("merchantId", "status");

-- CreateIndex
CREATE INDEX "RecoveryCase_paymentId_idx" ON "RecoveryCase"("paymentId");

-- CreateIndex
CREATE INDEX "RecoveryCase_orderId_idx" ON "RecoveryCase"("orderId");

-- CreateIndex
CREATE INDEX "RecoveryCase_status_idx" ON "RecoveryCase"("status");

-- CreateIndex
CREATE INDEX "RecoveryCase_createdAt_idx" ON "RecoveryCase"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RecoveryCase_merchantId_paymentId_key" ON "RecoveryCase"("merchantId", "paymentId");

-- CreateIndex
CREATE INDEX "RecoveryAttempt_caseId_idx" ON "RecoveryAttempt"("caseId");

-- CreateIndex
CREATE INDEX "RecoveryAttempt_paymentLinkId_idx" ON "RecoveryAttempt"("paymentLinkId");

-- CreateIndex
CREATE INDEX "RecoveryAttempt_status_idx" ON "RecoveryAttempt"("status");

-- CreateIndex
CREATE UNIQUE INDEX "RecoveryAttempt_caseId_attemptNumber_key" ON "RecoveryAttempt"("caseId", "attemptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_eventId_key" ON "WebhookEvent"("eventId");

-- CreateIndex
CREATE INDEX "WebhookEvent_eventId_idx" ON "WebhookEvent"("eventId");

-- CreateIndex
CREATE INDEX "WebhookEvent_eventType_idx" ON "WebhookEvent"("eventType");

-- CreateIndex
CREATE INDEX "WebhookEvent_status_idx" ON "WebhookEvent"("status");

-- CreateIndex
CREATE INDEX "WebhookEvent_createdAt_idx" ON "WebhookEvent"("createdAt");

-- CreateIndex
CREATE INDEX "CaseAuditLog_caseId_idx" ON "CaseAuditLog"("caseId");

-- CreateIndex
CREATE INDEX "CaseAuditLog_action_idx" ON "CaseAuditLog"("action");

-- CreateIndex
CREATE INDEX "CaseAuditLog_createdAt_idx" ON "CaseAuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RefundTask_idempotencyKey_key" ON "RefundTask"("idempotencyKey");

-- CreateIndex
CREATE INDEX "RefundTask_caseId_idx" ON "RefundTask"("caseId");

-- CreateIndex
CREATE INDEX "RefundTask_paymentId_idx" ON "RefundTask"("paymentId");

-- CreateIndex
CREATE INDEX "RefundTask_refundId_idx" ON "RefundTask"("refundId");

-- CreateIndex
CREATE INDEX "RefundTask_status_idx" ON "RefundTask"("status");

-- CreateIndex
CREATE INDEX "RefundTask_idempotencyKey_idx" ON "RefundTask"("idempotencyKey");

-- AddForeignKey
ALTER TABLE "RecoveryCase" ADD CONSTRAINT "RecoveryCase_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "MerchantPolicy"("merchantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryAttempt" ADD CONSTRAINT "RecoveryAttempt_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "RecoveryCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseAuditLog" ADD CONSTRAINT "CaseAuditLog_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "RecoveryCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundTask" ADD CONSTRAINT "RefundTask_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "RecoveryCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
