CREATE TYPE "ManualDecisionType" AS ENUM (
  'APPROVED_SUGGESTION',
  'REJECTED_SUGGESTION',
  'REASSIGNED',
  'MANUAL_PAYMENT',
  'REPROCESSED'
);

ALTER TYPE "ReceiptStatus" ADD VALUE 'REJECTED';

ALTER TABLE "ReviewTask"
ADD COLUMN "decisionType" "ManualDecisionType",
ADD COLUMN "rejectionReason" TEXT,
ADD COLUMN "resolutionMetadata" JSONB;

CREATE TABLE "ReviewNote" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "receiptId" TEXT NOT NULL,
  "reviewTaskId" TEXT,
  "authorUserId" TEXT,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReviewNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReviewNote_schoolId_receiptId_createdAt_idx" ON "ReviewNote"("schoolId", "receiptId", "createdAt");
CREATE INDEX "ReviewNote_reviewTaskId_createdAt_idx" ON "ReviewNote"("reviewTaskId", "createdAt");

ALTER TABLE "ReviewNote"
ADD CONSTRAINT "ReviewNote_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "ReviewNote_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Receipt"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "ReviewNote_reviewTaskId_fkey" FOREIGN KEY ("reviewTaskId") REFERENCES "ReviewTask"("id") ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "ReviewNote_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
