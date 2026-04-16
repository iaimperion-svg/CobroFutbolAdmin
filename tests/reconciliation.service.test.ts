import {
  ChargeStatus,
  MessageChannel,
  PaymentStatus,
  ReviewTaskStatus
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  receiptFindUnique: vi.fn(),
  chargeFindUnique: vi.fn(),
  txPaymentFindUnique: vi.fn(),
  txPaymentCreate: vi.fn(),
  txReconciliationFindUnique: vi.fn(),
  txReconciliationUpsert: vi.fn(),
  txAllocationFindMany: vi.fn(),
  txAllocationDeleteMany: vi.fn(),
  txAllocationUpsert: vi.fn(),
  txChargeFindUnique: vi.fn(),
  txChargeUpdate: vi.fn(),
  txPaymentUpdate: vi.fn(),
  txReceiptUpdate: vi.fn(),
  txReviewTaskUpdate: vi.fn(),
  prismaTransaction: vi.fn(),
  queueSystemReply: vi.fn(),
  createAuditLog: vi.fn()
}));

vi.mock("@/server/config/env", () => ({
  env: {
    AUTO_RECONCILIATION_THRESHOLD: 0.86,
    MANUAL_REVIEW_THRESHOLD: 0.72
  }
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    receipt: {
      findUnique: mocks.receiptFindUnique
    },
    charge: {
      findUnique: mocks.chargeFindUnique
    },
    $transaction: mocks.prismaTransaction
  }
}));

vi.mock("@/server/services/matching.service", () => ({
  rankReceiptCandidates: vi.fn()
}));

vi.mock("@/server/services/messaging.service", () => ({
  queueSystemReply: mocks.queueSystemReply
}));

vi.mock("@/server/services/audit.service", () => ({
  createAuditLog: mocks.createAuditLog
}));

import { reconcileReceiptWithCharge } from "@/server/services/reconciliation.service";

describe("reconciliation.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.receiptFindUnique.mockResolvedValue({
      id: "receipt-1",
      schoolId: "school-1",
      extractedAmountCents: 1500,
      extractedPaidAt: new Date("2026-04-10T12:00:00.000Z"),
      extractedSenderName: "Andrea Perez",
      extractedReference: "REF-1",
      extractedBankName: "Banco Estado",
      receivedAt: new Date("2026-04-10T12:00:00.000Z"),
      channel: MessageChannel.WHATSAPP,
      reviewTask: {
        id: "review-1",
        resolutionNotes: null
      },
      payment: {
        id: "payment-1"
      },
      message: {
        senderHandle: "+56911111111"
      }
    });
    mocks.chargeFindUnique.mockResolvedValue({
      id: "charge-new",
      schoolId: "school-1",
      studentId: "student-2",
      guardianId: "guardian-2",
      outstandingCents: 2000,
      amountCents: 2000,
      dueDate: new Date("2026-05-10T12:00:00.000Z"),
      student: { fullName: "Lucas Morales" },
      guardian: { fullName: "Valentina Morales" }
    });
    mocks.txPaymentFindUnique.mockResolvedValue({
      id: "payment-1",
      amountCents: 1500
    });
    mocks.txReconciliationFindUnique.mockResolvedValue({
      id: "reconciliation-1"
    });
    mocks.txAllocationFindMany.mockResolvedValue([
      {
        reconciliationId: "reconciliation-1",
        chargeId: "charge-old",
        amountCents: 1000,
        charge: {
          id: "charge-old",
          outstandingCents: 0,
          amountCents: 1000,
          dueDate: new Date("2026-05-01T12:00:00.000Z")
        }
      }
    ]);
    mocks.txChargeFindUnique.mockResolvedValue({
      id: "charge-new",
      schoolId: "school-1",
      outstandingCents: 2000,
      amountCents: 2000,
      dueDate: new Date("2026-05-10T12:00:00.000Z")
    });
    mocks.txReconciliationUpsert.mockResolvedValue({
      id: "reconciliation-1"
    });
    mocks.prismaTransaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback({
        payment: {
          findUnique: mocks.txPaymentFindUnique,
          create: mocks.txPaymentCreate,
          update: mocks.txPaymentUpdate
        },
        reconciliation: {
          findUnique: mocks.txReconciliationFindUnique,
          upsert: mocks.txReconciliationUpsert
        },
        reconciliationAllocation: {
          findMany: mocks.txAllocationFindMany,
          deleteMany: mocks.txAllocationDeleteMany,
          upsert: mocks.txAllocationUpsert
        },
        charge: {
          findUnique: mocks.txChargeFindUnique,
          update: mocks.txChargeUpdate
        },
        receipt: {
          update: mocks.txReceiptUpdate
        },
        reviewTask: {
          update: mocks.txReviewTaskUpdate
        }
      })
    );
  });

  it("restaura el saldo previo antes de aplicar una nueva conciliacion", async () => {
    await reconcileReceiptWithCharge({
      receiptId: "receipt-1",
      chargeId: "charge-new",
      mode: "manual"
    });

    expect(mocks.txChargeUpdate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { id: "charge-old" },
        data: expect.objectContaining({
          outstandingCents: 1000,
          status: ChargeStatus.PENDING
        })
      })
    );
    expect(mocks.txAllocationDeleteMany).toHaveBeenCalledWith({
      where: { reconciliationId: "reconciliation-1" }
    });
    expect(mocks.txChargeUpdate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { id: "charge-new" },
        data: expect.objectContaining({
          outstandingCents: 500,
          status: ChargeStatus.PARTIALLY_PAID
        })
      })
    );
    expect(mocks.txPaymentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: PaymentStatus.RECONCILED
        })
      })
    );
    expect(mocks.txReviewTaskUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: ReviewTaskStatus.RESOLVED
        })
      })
    );
  });
});
