CREATE TYPE "OnboardingPlan" AS ENUM (
  'SEMILLERO',
  'ACADEMIA',
  'CLUB_PRO'
);

CREATE TYPE "OnboardingRequestStatus" AS ENUM (
  'PENDING_PAYMENT',
  'TELEGRAM_LINKED',
  'RECEIPT_RECEIVED',
  'UNDER_REVIEW',
  'APPROVED_PENDING_ACTIVATION',
  'ACTIVE',
  'REJECTED',
  'EXPIRED',
  'CANCELED'
);

CREATE TYPE "OnboardingReceiptStatus" AS ENUM (
  'RECEIVED',
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
  'FAILED'
);

CREATE TABLE "OnboardingRequest" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT,
  "createdUserId" TEXT,
  "fullName" TEXT NOT NULL,
  "academyName" TEXT NOT NULL,
  "academySlug" TEXT,
  "email" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "city" TEXT,
  "notes" TEXT,
  "plan" "OnboardingPlan" NOT NULL,
  "expectedAmountCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'CLP',
  "publicCode" TEXT NOT NULL,
  "telegramStartToken" TEXT NOT NULL,
  "telegramChatId" TEXT,
  "telegramUserId" TEXT,
  "telegramUsername" TEXT,
  "status" "OnboardingRequestStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
  "approvedAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  "activatedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "rejectionReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OnboardingRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OnboardingPaymentReceipt" (
  "id" TEXT NOT NULL,
  "onboardingRequestId" TEXT NOT NULL,
  "status" "OnboardingReceiptStatus" NOT NULL DEFAULT 'RECEIVED',
  "externalMessageId" TEXT,
  "externalChatId" TEXT,
  "externalUserId" TEXT,
  "senderName" TEXT,
  "senderUsername" TEXT,
  "bodyText" TEXT,
  "fileUrl" TEXT,
  "storagePath" TEXT,
  "originalFileName" TEXT,
  "mimeType" TEXT,
  "extractedText" TEXT,
  "extractedAmountCents" INTEGER,
  "extractionConfidence" DOUBLE PRECISION,
  "rawPayload" JSONB,
  "metadata" JSONB,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OnboardingPaymentReceipt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OnboardingActivationToken" (
  "id" TEXT NOT NULL,
  "onboardingRequestId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OnboardingActivationToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OnboardingRequest_schoolId_key" ON "OnboardingRequest"("schoolId");
CREATE UNIQUE INDEX "OnboardingRequest_createdUserId_key" ON "OnboardingRequest"("createdUserId");
CREATE UNIQUE INDEX "OnboardingRequest_publicCode_key" ON "OnboardingRequest"("publicCode");
CREATE UNIQUE INDEX "OnboardingRequest_telegramStartToken_key" ON "OnboardingRequest"("telegramStartToken");
CREATE INDEX "OnboardingRequest_status_createdAt_idx" ON "OnboardingRequest"("status", "createdAt");
CREATE INDEX "OnboardingRequest_email_createdAt_idx" ON "OnboardingRequest"("email", "createdAt");
CREATE INDEX "OnboardingRequest_telegramChatId_idx" ON "OnboardingRequest"("telegramChatId");

CREATE INDEX "OnboardingPaymentReceipt_onboardingRequestId_status_createdAt_idx" ON "OnboardingPaymentReceipt"("onboardingRequestId", "status", "createdAt");
CREATE INDEX "OnboardingPaymentReceipt_externalChatId_createdAt_idx" ON "OnboardingPaymentReceipt"("externalChatId", "createdAt");

CREATE UNIQUE INDEX "OnboardingActivationToken_tokenHash_key" ON "OnboardingActivationToken"("tokenHash");
CREATE INDEX "OnboardingActivationToken_onboardingRequestId_expiresAt_idx" ON "OnboardingActivationToken"("onboardingRequestId", "expiresAt");
CREATE INDEX "OnboardingActivationToken_userId_expiresAt_idx" ON "OnboardingActivationToken"("userId", "expiresAt");

ALTER TABLE "OnboardingRequest"
ADD CONSTRAINT "OnboardingRequest_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "OnboardingRequest_createdUserId_fkey" FOREIGN KEY ("createdUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OnboardingPaymentReceipt"
ADD CONSTRAINT "OnboardingPaymentReceipt_onboardingRequestId_fkey" FOREIGN KEY ("onboardingRequestId") REFERENCES "OnboardingRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OnboardingActivationToken"
ADD CONSTRAINT "OnboardingActivationToken_onboardingRequestId_fkey" FOREIGN KEY ("onboardingRequestId") REFERENCES "OnboardingRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "OnboardingActivationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
