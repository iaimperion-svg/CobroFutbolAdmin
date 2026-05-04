import { ReceiptResolutionPromptStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  promptFindFirst: vi.fn(),
  promptUpdate: vi.fn(),
  receiptUpdate: vi.fn(),
  reviewTaskUpsert: vi.fn(),
  processReceiptReconciliation: vi.fn(),
  reconcileReceiptWithCharges: vi.fn(),
  queueSystemReply: vi.fn()
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    receiptResolutionPrompt: {
      findFirst: mocks.promptFindFirst,
      update: mocks.promptUpdate
    },
    receipt: {
      update: mocks.receiptUpdate
    },
    reviewTask: {
      upsert: mocks.reviewTaskUpsert
    }
  }
}));

vi.mock("@/server/services/reconciliation.service", () => ({
  processReceiptReconciliation: mocks.processReceiptReconciliation,
  reconcileReceiptWithCharges: mocks.reconcileReceiptWithCharges
}));

vi.mock("@/server/services/messaging.service", () => ({
  queueSystemReply: mocks.queueSystemReply
}));

import { handleReceiptResolutionPromptReply } from "@/server/services/receipt-resolution.service";

describe("receipt-resolution.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("toma una respuesta numerica y reprocesa forzando el alumno elegido", async () => {
    mocks.promptFindFirst.mockResolvedValue({
      id: "prompt-1",
      schoolId: "school-1",
      receiptId: "receipt-1",
      type: "SELECT_STUDENT",
      status: ReceiptResolutionPromptStatus.OPEN,
      options: [
        { key: "student-1", number: 1, label: "Ignacio Perez" },
        { key: "student-2", number: 2, label: "Lucas Perez" }
      ],
      expiresAt: new Date(Date.now() + 60_000),
      receipt: {
        channel: "TELEGRAM",
        message: {
          senderHandle: "6001",
          conversationId: "conv-1",
          externalChatId: "6001",
          externalUserId: "5001",
          senderUsername: "mauro"
        }
      }
    });

    const result = await handleReceiptResolutionPromptReply({
      schoolId: "school-1",
      senderHandle: "6001",
      externalChatId: "6001",
      bodyText: "1"
    });

    expect(result).toEqual({
      handled: true,
      action: "answered",
      receiptId: "receipt-1",
      promptId: "prompt-1",
      selectedOption: "student-1"
    });
    expect(mocks.promptUpdate).toHaveBeenCalledWith({
      where: { id: "prompt-1" },
      data: expect.objectContaining({
        status: ReceiptResolutionPromptStatus.ANSWERED,
        selectedOption: "student-1",
        freeTextAnswer: "1"
      })
    });
    expect(mocks.processReceiptReconciliation).toHaveBeenCalledWith("receipt-1", {
      source: "payer_reply",
      forcedStudentId: "student-1"
    });
  });

  it("pide reintento cuando la respuesta no coincide con ninguna opcion", async () => {
    mocks.promptFindFirst.mockResolvedValue({
      id: "prompt-2",
      schoolId: "school-1",
      receiptId: "receipt-2",
      type: "SELECT_PERIOD",
      status: ReceiptResolutionPromptStatus.OPEN,
      options: [
        { key: "charge-1", number: 1, label: "marzo 2026" },
        { key: "charge-2", number: 2, label: "abril 2026" }
      ],
      expiresAt: new Date(Date.now() + 60_000),
      receipt: {
        channel: "WHATSAPP",
        message: {
          senderHandle: "+56911111111",
          conversationId: "conv-2",
          externalChatId: null,
          externalUserId: null,
          senderUsername: null
        }
      }
    });

    const result = await handleReceiptResolutionPromptReply({
      schoolId: "school-1",
      senderHandle: "+56911111111",
      bodyText: "quiero pagar mayo"
    });

    expect(result).toEqual({
      handled: true,
      action: "invalid_reply"
    });
    expect(mocks.processReceiptReconciliation).not.toHaveBeenCalled();
    expect(mocks.queueSystemReply).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining("responde solo con el numero")
      })
    );
  });

  it("confirma un abono parcial y reprocesa el comprobante con el cargo elegido", async () => {
    mocks.promptFindFirst.mockResolvedValue({
      id: "prompt-3",
      schoolId: "school-1",
      receiptId: "receipt-3",
      type: "CONFIRM_PARTIAL_PAYMENT",
      status: ReceiptResolutionPromptStatus.OPEN,
      options: [
        { key: "confirm_partial:charge-1", number: 1, label: "Abono a abril 2026" },
        { key: "manual_review", number: 2, label: "Revision manual" }
      ],
      context: {
        chargeId: "charge-1",
        studentId: "student-1"
      },
      expiresAt: new Date(Date.now() + 60_000),
      receipt: {
        channel: "WHATSAPP",
        message: {
          senderHandle: "+56911111111",
          conversationId: "conv-3",
          externalChatId: null,
          externalUserId: null,
          senderUsername: null
        }
      }
    });

    const result = await handleReceiptResolutionPromptReply({
      schoolId: "school-1",
      senderHandle: "+56911111111",
      bodyText: "1"
    });

    expect(result).toEqual({
      handled: true,
      action: "answered",
      receiptId: "receipt-3",
      promptId: "prompt-3",
      selectedOption: "confirm_partial:charge-1"
    });
    expect(mocks.processReceiptReconciliation).toHaveBeenCalledWith("receipt-3", {
      source: "payer_reply",
      forcedChargeId: "charge-1"
    });
  });

  it("distribuye un pago mayor cuando el apoderado confirma aplicar el excedente", async () => {
    mocks.promptFindFirst.mockResolvedValue({
      id: "prompt-4",
      schoolId: "school-1",
      receiptId: "receipt-4",
      type: "CONFIRM_OVERPAYMENT",
      status: ReceiptResolutionPromptStatus.OPEN,
      options: [
        { key: "apply_oldest_debts", number: 1, label: "Aplicar a mensualidades mas antiguas" },
        { key: "manual_review", number: 2, label: "Revision manual" }
      ],
      context: {
        chargeIds: ["charge-1", "charge-2"],
        studentId: "student-1"
      },
      expiresAt: new Date(Date.now() + 60_000),
      receipt: {
        channel: "WHATSAPP",
        message: {
          senderHandle: "+56911111111",
          conversationId: "conv-4",
          externalChatId: null,
          externalUserId: null,
          senderUsername: null
        }
      }
    });

    const result = await handleReceiptResolutionPromptReply({
      schoolId: "school-1",
      senderHandle: "+56911111111",
      bodyText: "1"
    });

    expect(result).toEqual({
      handled: true,
      action: "answered",
      receiptId: "receipt-4",
      promptId: "prompt-4",
      selectedOption: "apply_oldest_debts"
    });
    expect(mocks.reconcileReceiptWithCharges).toHaveBeenCalledWith({
      receiptId: "receipt-4",
      chargeIds: ["charge-1", "charge-2"],
      mode: "automatic",
      strategy: "payer_confirmed_overpayment_distribution",
      notes: "El apoderado confirmo aplicar el excedente a las mensualidades mas antiguas.",
      resolutionMetadata: {
        source: "payer_reply",
        chargeIds: ["charge-1", "charge-2"],
        overpaymentConfirmed: true
      }
    });
  });
});
