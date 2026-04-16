import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/config/env", () => ({
  env: {
    TELEGRAM_BOT_TOKEN: "bot-token",
    TELEGRAM_WEBHOOK_URL: "https://example.test/api/v1/webhooks/telegram?schoolSlug=academia-central",
    TELEGRAM_WEBHOOK_SECRET: "secret-token"
  }
}));

import {
  parseTelegramUpdate,
  resolveTelegramFileDownloadUrl,
  sendTelegramTextMessage
} from "@/server/services/telegram.service";

describe("telegram.service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("parsea foto con caption y contexto del chat", () => {
    const parsed = parseTelegramUpdate({
      update_id: 10001,
      message: {
        message_id: 55,
        date: 1_775_712_000,
        from: {
          id: 9001,
          first_name: "Ana",
          last_name: "Perez",
          username: "ana_perez"
        },
        chat: {
          id: 7001,
          type: "private",
          first_name: "Ana",
          username: "ana_perez"
        },
        caption: "Comprobante abril",
        photo: [{ file_id: "small" }, { file_id: "largest" }]
      }
    });

    expect(parsed).not.toBeNull();
    expect(parsed?.externalId).toBe("7001:55");
    expect(parsed?.senderHandle).toBe("7001");
    expect(parsed?.externalUserId).toBe("9001");
    expect(parsed?.senderUsername).toBe("ana_perez");
    expect(parsed?.bodyText).toBe("Comprobante abril");
    expect(parsed?.attachments).toEqual([
      {
        fileUrl: "telegram://largest",
        mimeType: "image/jpeg",
        originalFileName: "telegram-photo-55.jpg"
      }
    ]);
  });

  it("parsea PDF enviado como documento", () => {
    const parsed = parseTelegramUpdate({
      message: {
        message_id: 99,
        chat: {
          id: 8001,
          type: "private"
        },
        document: {
          file_id: "pdf-file",
          file_name: "transferencia.pdf",
          mime_type: "application/pdf"
        },
        text: "ignorado por caption/document"
      }
    });

    expect(parsed?.attachments).toEqual([
      {
        fileUrl: "telegram://pdf-file",
        mimeType: "application/pdf",
        originalFileName: "transferencia.pdf"
      }
    ]);
  });

  it("resuelve y envia mensajes usando la API de Telegram", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          result: {
            file_path: "documents/receipt.pdf"
          }
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          result: true
        })
      });

    vi.stubGlobal("fetch", fetchMock);

    await expect(resolveTelegramFileDownloadUrl("pdf-file")).resolves.toBe(
      "https://api.telegram.org/file/botbot-token/documents/receipt.pdf"
    );
    await expect(sendTelegramTextMessage("7001", "Hola")).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.telegram.org/botbot-token/getFile",
      expect.objectContaining({
        method: "POST"
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.telegram.org/botbot-token/sendMessage",
      expect.objectContaining({
        method: "POST"
      })
    );
  });
});
