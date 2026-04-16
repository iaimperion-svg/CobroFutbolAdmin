import { ManualDecisionType, PaymentStatus, ReceiptStatus, ReconciliationStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addReceiptInternalNote,
  approveSuggestedReconciliation,
  rejectSuggestedReconciliation,
  reassignSuggestedReconciliation,
  reprocessReceipt
} from "@/server/services/manual-review.service";

const {
  prismaMock,
  reconcileReceiptWithCharge,
  processReceiptReconciliation,
  restoreReconciliationAllocations,
  createAuditLog,
  listReceiptAuditTrail
} = vi.hoisted(() => ({
  prismaMock: {
    receipt: {
      findFirst: vi.fn()
    },
    charge: {
      findFirst: vi.fn()
    },
    reviewTask: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      upsert: vi.fn()
    },
    reviewNote: {
      findMany: vi.fn(),
      create: vi.fn()
    },
    auditLog: {
      findMany: vi.fn()
    },
    $transaction: vi.fn()
  },
  reconcileReceiptWithCharge: vi.fn(),
  processReceiptReconciliation: vi.fn(),
  restoreReconciliationAllocations: vi.fn(),
  createAuditLog: vi.fn(),
  listReceiptAuditTrail: vi.fn()
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: prismaMock
}));

vi.mock("@/server/services/reconciliation.service", () => ({
  reconcileReceiptWithCharge,
  processReceiptReconciliation,
  restoreReconciliationAllocations
}));

vi.mock("@/server/services/audit.service", () => ({
  createAuditLog,
  listReceiptAuditTrail
}));

function buildReceipt() {
  return {
    id: "receipt-1",
    schoolId: "school-1",
    status: ReceiptStatus.MANUAL_REVIEW,
    guardian: null,
    student: null,
    payment: {
      id: "payment-1",
      status: PaymentStatus.RECEIVED
    },
    reviewTask: {
      id: "review-1"
    },
    reconciliations: [
      {
        id: "reconciliation-1",
        status: ReconciliationStatus.SUGGESTED,
        strategy: "manual_review_seed",
        notes: "Caso abierto",
        payment: null,
        allocations: []
      }
    ],
    candidateMatches: []
  };
}

function buildCharge(overrides?: Partial<{
  id: string;
  schoolId: string;
  studentId: string;
  guardianId: string | null;
  outstandingCents: number;
  student: { fullName: string };
  guardian: { fullName: string } | null;
}>) {
  return {
    id: "charge-1",
    schoolId: "school-1",
    studentId: "student-1",
    guardianId: "guardian-1",
    outstandingCents: 3500000,
    student: { fullName: "Ignacio Perez" },
    guardian: { fullName: "Andrea Perez" },
    ...overrides
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.receipt.findFirst.mockResolvedValue(buildReceipt());
  prismaMock.charge.findFirst.mockResolvedValue(buildCharge());
  prismaMock.reviewNote.findMany.mockResolvedValue([]);
  prismaMock.auditLog.findMany.mockResolvedValue([]);
  prismaMock.reviewTask.upsert.mockResolvedValue({ id: "review-1" });
  prismaMock.reviewNote.create.mockResolvedValue({
    id: "note-1",
    body: "Llamar al apoderado",
    createdAt: new Date("2026-04-09T12:00:00.000Z"),
    authorUser: { fullName: "Matias Soto" }
  });
  restoreReconciliationAllocations.mockResolvedValue([]);
  listReceiptAuditTrail.mockResolvedValue([]);
  prismaMock.$transaction.mockImplementation(async (callback) =>
    callback({
      receipt: { update: vi.fn() },
      payment: { update: vi.fn() },
      reconciliation: { update: vi.fn() },
      reconciliationAllocation: { deleteMany: vi.fn(), findMany: vi.fn() },
      charge: { update: vi.fn() },
      reviewTask: { upsert: vi.fn() },
      auditLog: { create: vi.fn() }
    })
  );
});

describe("manual review operations", () => {
  it("aprueba una conciliacion sugerida con decision manual", async () => {
    await approveSuggestedReconciliation({
      receiptId: "receipt-1",
      schoolId: "school-1",
      chargeId: "charge-1",
      actorUserId: "user-1",
      resolutionNotes: "Validado por operaciones"
    });

    expect(reconcileReceiptWithCharge).toHaveBeenCalledWith(
      expect.objectContaining({
        receiptId: "receipt-1",
        chargeId: "charge-1",
        actorUserId: "user-1",
        reviewDecisionType: ManualDecisionType.APPROVED_SUGGESTION
      })
    );
  });

  it("rechaza un comprobante y registra auditoria", async () => {
    const txReceiptUpdate = vi.fn();
    const txPaymentUpdate = vi.fn();
    const txReconciliationUpdate = vi.fn();
    const txReviewUpsert = vi.fn();

    prismaMock.$transaction.mockImplementationOnce(async (callback) =>
      callback({
        receipt: { update: txReceiptUpdate },
        payment: { update: txPaymentUpdate },
        reconciliation: { update: txReconciliationUpdate },
        reconciliationAllocation: { deleteMany: vi.fn() },
        reviewTask: { upsert: txReviewUpsert },
        auditLog: { create: vi.fn() }
      })
    );

    await rejectSuggestedReconciliation({
      receiptId: "receipt-1",
      schoolId: "school-1",
      actorUserId: "user-1",
      rejectionReason: "MONTO_NO_COINCIDE",
      resolutionNotes: "El monto del comprobante no coincide con el cargo."
    });

    expect(txReceiptUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: ReceiptStatus.REJECTED
        })
      })
    );
    expect(txPaymentUpdate).toHaveBeenCalled();
    expect(txReconciliationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: ReconciliationStatus.REJECTED
        })
      })
    );
    expect(restoreReconciliationAllocations).toHaveBeenCalledWith(
      expect.anything(),
      "reconciliation-1"
    );
    expect(txReviewUpsert).toHaveBeenCalled();
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "receipt.review.rejected",
        entityId: "receipt-1"
      }),
      expect.anything()
    );
  });

  it("reasigna la conciliacion a otro cargo", async () => {
    prismaMock.charge.findFirst.mockResolvedValueOnce(
      buildCharge({
        id: "charge-2",
        studentId: "student-2",
        guardianId: "guardian-2",
        student: { fullName: "Lucas Morales" },
        guardian: { fullName: "Valentina Morales" }
      })
    );

    await reassignSuggestedReconciliation({
      receiptId: "receipt-1",
      schoolId: "school-1",
      chargeId: "charge-2",
      studentId: "student-2",
      guardianId: "guardian-2",
      actorUserId: "user-1",
      resolutionNotes: "Se reasigna al alumno correcto."
    });

    expect(reconcileReceiptWithCharge).toHaveBeenCalledWith(
      expect.objectContaining({
        chargeId: "charge-2",
        reviewDecisionType: ManualDecisionType.REASSIGNED,
        actorUserId: "user-1"
      })
    );
  });

  it("guarda una observacion interna y deja auditoria", async () => {
    await addReceiptInternalNote({
      receiptId: "receipt-1",
      schoolId: "school-1",
      actorUserId: "user-1",
      body: "Llamar al apoderado antes de cerrar el caso."
    });

    expect(prismaMock.reviewNote.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          receiptId: "receipt-1",
          authorUserId: "user-1"
        })
      })
    );
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "receipt.review.note_added",
        entityId: "receipt-1"
      })
    );
  });

  it("reprocesa el comprobante y reabre el flujo", async () => {
    const txAllocationDelete = vi.fn();
    const txReconciliationUpdate = vi.fn();
    const txReviewUpsert = vi.fn();

    prismaMock.$transaction.mockImplementationOnce(async (callback) =>
      callback({
        receipt: { update: vi.fn() },
        payment: { update: vi.fn() },
        reconciliation: { update: txReconciliationUpdate },
        reconciliationAllocation: { deleteMany: txAllocationDelete, findMany: vi.fn() },
        charge: { update: vi.fn() },
        reviewTask: { upsert: txReviewUpsert },
        auditLog: { create: vi.fn() }
      })
    );

    await reprocessReceipt({
      receiptId: "receipt-1",
      schoolId: "school-1",
      actorUserId: "user-1",
      resolutionNotes: "Se reprocesa despues de corregir el remitente."
    });

    expect(txAllocationDelete).not.toHaveBeenCalled();
    expect(restoreReconciliationAllocations).toHaveBeenCalledWith(
      expect.anything(),
      "reconciliation-1"
    );
    expect(txReconciliationUpdate).toHaveBeenCalled();
    expect(txReviewUpsert).toHaveBeenCalled();
    expect(processReceiptReconciliation).toHaveBeenCalledWith("receipt-1", {
      source: "reprocess",
      actorUserId: "user-1"
    });
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "receipt.review.reprocess_requested"
      }),
      expect.anything()
    );
  });
});
