import { beforeEach, describe, expect, it, vi } from "vitest";
import { MessageChannel } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  guardianFindFirst: vi.fn(),
  messageFindFirst: vi.fn(),
  messageCreate: vi.fn(),
  conversationUpsert: vi.fn(),
  receiptCreate: vi.fn(),
  queueAdd: vi.fn()
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    guardian: {
      findFirst: mocks.guardianFindFirst
    },
    message: {
      findFirst: mocks.messageFindFirst,
      create: mocks.messageCreate
    },
    conversation: {
      upsert: mocks.conversationUpsert
    },
    receipt: {
      create: mocks.receiptCreate
    }
  }
}));

vi.mock("@/server/queues", () => ({
  getReceiptProcessingQueue: () => ({
    add: mocks.queueAdd
  })
}));

import { createInboundMessageWithReceipts } from "@/server/services/receipts.service";

describe("createInboundMessageWithReceipts", () => {
  beforeEach(() => {
    mocks.guardianFindFirst.mockReset();
    mocks.messageFindFirst.mockReset();
    mocks.messageCreate.mockReset();
    mocks.conversationUpsert.mockReset();
    mocks.receiptCreate.mockReset();
    mocks.queueAdd.mockReset();

    mocks.messageFindFirst.mockResolvedValue(null);
    mocks.conversationUpsert.mockResolvedValue({
      id: "conversation-1"
    });
    mocks.messageCreate.mockResolvedValue({
      id: "message-1"
    });
    mocks.receiptCreate.mockResolvedValue({
      id: "receipt-1"
    });
    mocks.queueAdd.mockResolvedValue({
      id: "job-1"
    });
  });

  it("crea conversacion, mensaje, comprobante y encola procesamiento para Telegram", async () => {
    const sentAt = new Date("2026-04-09T12:00:00.000Z");

    const result = await createInboundMessageWithReceipts({
      schoolId: "school-1",
      channel: MessageChannel.TELEGRAM,
      externalId: "6001:77",
      externalChatId: "6001",
      externalUserId: "5001",
      senderHandle: "6001",
      senderName: "Mauro",
      senderUsername: "mauro_dev",
      bodyText: "Pago abril",
      sentAt,
      conversationTitle: "Mauro",
      conversationUsername: "mauro_dev",
      attachments: [
        {
          fileUrl: "telegram://photo-large",
          mimeType: "image/jpeg",
          originalFileName: "telegram-photo-77.jpg"
        }
      ],
      rawPayload: {
        update_id: 20001
      }
    });

    expect(result.isDuplicate).toBe(false);
    expect(mocks.guardianFindFirst).not.toHaveBeenCalled();
    expect(mocks.conversationUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          schoolId_channel_externalChatId: {
            schoolId: "school-1",
            channel: MessageChannel.TELEGRAM,
            externalChatId: "6001"
          }
        }
      })
    );
    expect(mocks.messageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          conversationId: "conversation-1",
          externalId: "6001:77",
          externalChatId: "6001",
          externalUserId: "5001",
          senderHandle: "6001",
          senderUsername: "mauro_dev",
          sentAt
        })
      })
    );
    expect(mocks.receiptCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          schoolId: "school-1",
          messageId: "message-1",
          fileUrl: "telegram://photo-large",
          originalFileName: "telegram-photo-77.jpg"
        })
      })
    );
    expect(mocks.queueAdd).toHaveBeenCalledWith("process-receipt", {
      receiptId: "receipt-1"
    });
  });

  it("devuelve el mensaje existente si Telegram reintenta el mismo update", async () => {
    mocks.messageFindFirst.mockResolvedValue({
      id: "message-1",
      receipts: [{ id: "receipt-1" }]
    });

    const result = await createInboundMessageWithReceipts({
      schoolId: "school-1",
      channel: MessageChannel.TELEGRAM,
      externalId: "6001:77",
      externalChatId: "6001",
      senderHandle: "6001",
      attachments: []
    });

    expect(result).toEqual({
      message: {
        id: "message-1",
        receipts: [{ id: "receipt-1" }]
      },
      receipts: [{ id: "receipt-1" }],
      isDuplicate: true
    });
    expect(mocks.messageCreate).not.toHaveBeenCalled();
    expect(mocks.receiptCreate).not.toHaveBeenCalled();
    expect(mocks.queueAdd).not.toHaveBeenCalled();
  });
});
