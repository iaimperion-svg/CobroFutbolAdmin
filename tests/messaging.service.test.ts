import { beforeEach, describe, expect, it, vi } from "vitest";
import { MessageChannel, MessageStatus } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  messageCreate: vi.fn(),
  messageFindUnique: vi.fn(),
  messageUpdate: vi.fn(),
  queueAdd: vi.fn(),
  sendTelegramTextMessage: vi.fn()
}));

vi.mock("@/server/config/env", () => ({
  env: {
    TELEGRAM_BOT_TOKEN: "bot-token",
    WHATSAPP_REPLY_URL: ""
  }
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    message: {
      create: mocks.messageCreate,
      findUnique: mocks.messageFindUnique,
      update: mocks.messageUpdate
    }
  }
}));

vi.mock("@/server/queues", () => ({
  getOutboundMessageQueue: () => ({
    add: mocks.queueAdd
  })
}));

vi.mock("@/server/services/telegram.service", () => ({
  sendTelegramTextMessage: mocks.sendTelegramTextMessage
}));

import { deliverOutboundMessage, queueSystemReply } from "@/server/services/messaging.service";

describe("messaging.service", () => {
  beforeEach(() => {
    mocks.messageCreate.mockReset();
    mocks.messageFindUnique.mockReset();
    mocks.messageUpdate.mockReset();
    mocks.queueAdd.mockReset();
    mocks.sendTelegramTextMessage.mockReset();
  });

  it("crea una respuesta automatica y la encola", async () => {
    mocks.messageCreate.mockResolvedValue({
      id: "message-1"
    });

    const result = await queueSystemReply({
      schoolId: "school-1",
      channel: MessageChannel.TELEGRAM,
      recipient: "6001",
      body: "Recibimos tu comprobante.",
      conversationId: "conversation-1",
      externalChatId: "6001",
      externalUserId: "5001",
      senderUsername: "mauro_dev"
    });

    expect(result).toEqual({
      id: "message-1"
    });
    expect(mocks.messageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          schoolId: "school-1",
          channel: MessageChannel.TELEGRAM,
          conversationId: "conversation-1",
          externalChatId: "6001",
          externalUserId: "5001",
          senderHandle: "6001",
          senderUsername: "mauro_dev",
          bodyText: "Recibimos tu comprobante."
        })
      })
    );
    expect(mocks.queueAdd).toHaveBeenCalledWith("deliver-message", {
      messageId: "message-1"
    });
  });

  it("envia respuestas de Telegram y marca el mensaje como enviado", async () => {
    mocks.messageFindUnique.mockResolvedValue({
      id: "message-1",
      channel: MessageChannel.TELEGRAM,
      senderHandle: "6001",
      bodyText: "Pago validado",
      status: MessageStatus.RECEIVED
    });

    await deliverOutboundMessage("message-1");

    expect(mocks.sendTelegramTextMessage).toHaveBeenCalledWith("6001", "Pago validado");
    expect(mocks.messageUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "message-1"
        },
        data: expect.objectContaining({
          status: MessageStatus.SENT
        })
      })
    );
  });
});
