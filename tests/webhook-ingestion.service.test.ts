import { beforeEach, describe, expect, it, vi } from "vitest";
import { MessageChannel } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  findSchool: vi.fn(),
  createInboundMessageWithReceipts: vi.fn(),
  queueSystemReply: vi.fn(),
  shouldHandleOnboardingTelegramUpdate: vi.fn(),
  handleOnboardingTelegramUpdate: vi.fn()
}));

vi.mock("@/server/config/env", () => ({
  env: {
    TELEGRAM_ENABLED: true
  }
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    school: {
      findUnique: mocks.findSchool
    }
  }
}));

vi.mock("@/server/services/receipts.service", () => ({
  createInboundMessageWithReceipts: mocks.createInboundMessageWithReceipts
}));

vi.mock("@/server/services/messaging.service", () => ({
  queueSystemReply: mocks.queueSystemReply
}));

vi.mock("@/server/services/onboarding.service", () => ({
  shouldHandleOnboardingTelegramUpdate: mocks.shouldHandleOnboardingTelegramUpdate,
  handleOnboardingTelegramUpdate: mocks.handleOnboardingTelegramUpdate
}));

import { ingestTelegramWebhook } from "@/server/services/webhook-ingestion.service";

describe("ingestTelegramWebhook", () => {
  beforeEach(() => {
    mocks.findSchool.mockReset();
    mocks.createInboundMessageWithReceipts.mockReset();
    mocks.queueSystemReply.mockReset();
    mocks.shouldHandleOnboardingTelegramUpdate.mockReset();
    mocks.handleOnboardingTelegramUpdate.mockReset();

    mocks.findSchool.mockResolvedValue({
      id: "school-1"
    });
    mocks.shouldHandleOnboardingTelegramUpdate.mockResolvedValue(false);
  });

  it("normaliza el update y crea mensaje con comprobante", async () => {
    mocks.createInboundMessageWithReceipts.mockResolvedValue({
      message: {
        id: "message-1",
        conversationId: "conversation-1"
      },
      receipts: [{ id: "receipt-1" }],
      isDuplicate: false
    });

    const result = await ingestTelegramWebhook(
      {
        update_id: 20001,
        message: {
          message_id: 77,
          date: 1_775_712_000,
          from: {
            id: 5001,
            first_name: "Mauro",
            username: "mauro_dev"
          },
          chat: {
            id: 6001,
            type: "private",
            first_name: "Mauro",
            username: "mauro_dev"
          },
          caption: "Pago abril",
          photo: [{ file_id: "photo-small" }, { file_id: "photo-large" }]
        }
      },
      "academia-central"
    );

    if (!("receipts" in result)) {
      throw new Error("Se esperaba un resultado con comprobantes");
    }

    expect(result.receipts).toHaveLength(1);
    expect(mocks.createInboundMessageWithReceipts).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: "school-1",
        channel: MessageChannel.TELEGRAM,
        externalId: "6001:77",
        externalChatId: "6001",
        externalUserId: "5001",
        senderHandle: "6001",
        senderUsername: "mauro_dev",
        bodyText: "Pago abril",
        attachments: [
          {
            fileUrl: "telegram://photo-large",
            mimeType: "image/jpeg",
            originalFileName: "telegram-photo-77.jpg"
          }
        ]
      })
    );
    expect(mocks.queueSystemReply).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: "school-1",
        channel: MessageChannel.TELEGRAM,
        recipient: "6001",
        body: expect.stringContaining("ya lo estamos analizando")
      })
    );
  });

  it("ignora updates no compatibles y no responde automaticamente", async () => {
    const result = await ingestTelegramWebhook(
      {
        update_id: 20002,
        callback_query: {
          id: "cb-1"
        }
      },
      "academia-central"
    );

    expect(result).toEqual({
      ignored: true,
      reason: "Update de Telegram sin mensaje compatible"
    });
    expect(mocks.createInboundMessageWithReceipts).not.toHaveBeenCalled();
    expect(mocks.queueSystemReply).not.toHaveBeenCalled();
  });

  it("deriva al flujo de onboarding cuando el chat corresponde a una solicitud de alta", async () => {
    mocks.handleOnboardingTelegramUpdate.mockResolvedValue({
      linked: true,
      publicCode: "PG-ONB123"
    });
    mocks.shouldHandleOnboardingTelegramUpdate.mockResolvedValue(true);

    const result = await ingestTelegramWebhook(
      {
        update_id: 20003,
        message: {
          message_id: 78,
          date: 1_775_712_120,
          from: {
            id: 5002,
            first_name: "Patricio",
            username: "pato_dev"
          },
          chat: {
            id: 6002,
            type: "private",
            first_name: "Patricio",
            username: "pato_dev"
          },
          text: "/start onb_token-demo"
        }
      },
      "academia-central"
    );

    expect(result).toEqual({
      linked: true,
      publicCode: "PG-ONB123"
    });
    expect(mocks.handleOnboardingTelegramUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        externalId: "6002:78",
        externalChatId: "6002",
        bodyText: "/start onb_token-demo"
      })
    );
    expect(mocks.createInboundMessageWithReceipts).not.toHaveBeenCalled();
    expect(mocks.queueSystemReply).not.toHaveBeenCalled();
  });
});
