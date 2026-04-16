import { env } from "@/server/config/env";

type TelegramUserLike = {
  id?: number;
  first_name?: string;
  last_name?: string;
  username?: string;
};

type TelegramChatLike = {
  id?: number;
  type?: string;
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
};

type TelegramFileLike = {
  file_id?: string;
  file_name?: string;
  mime_type?: string;
};

type TelegramPhotoLike = {
  file_id?: string;
};

type TelegramMessageLike = {
  message_id?: number;
  date?: number;
  from?: TelegramUserLike;
  chat?: TelegramChatLike;
  text?: string;
  caption?: string;
  document?: TelegramFileLike;
  photo?: TelegramPhotoLike[];
};

export type TelegramInboundAttachment = {
  fileUrl: string;
  mimeType: string;
  originalFileName: string;
};

export type TelegramInboundMessage = {
  externalId: string;
  externalChatId: string;
  externalUserId?: string;
  senderHandle: string;
  senderName?: string;
  senderUsername?: string;
  conversationTitle?: string;
  conversationUsername?: string;
  bodyText?: string;
  sentAt?: Date;
  attachments: TelegramInboundAttachment[];
  rawPayload: Record<string, unknown>;
};

type TelegramApiResponse<T> = {
  ok: boolean;
  description?: string;
  result?: T;
};

type TelegramGetFileResult = {
  file_path?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readTelegramMessage(payload: Record<string, unknown>): TelegramMessageLike | null {
  const supportedKeys = [
    "message",
    "edited_message",
    "channel_post",
    "edited_channel_post",
    "business_message",
    "edited_business_message"
  ] as const;

  for (const key of supportedKeys) {
    const value = payload[key];
    if (isRecord(value)) {
      return value as TelegramMessageLike;
    }
  }

  return null;
}

function buildDisplayName(entity?: TelegramUserLike | TelegramChatLike) {
  if (!entity) {
    return undefined;
  }

  const fullName = [entity.first_name, entity.last_name].filter(Boolean).join(" ").trim();

  if (fullName.length > 0) {
    return fullName;
  }

  if ("title" in entity && typeof entity.title === "string" && entity.title.trim().length > 0) {
    return entity.title.trim();
  }

  if (typeof entity.username === "string" && entity.username.trim().length > 0) {
    return `@${entity.username.trim()}`;
  }

  return undefined;
}

function hasSupportedDocument(document: TelegramFileLike | undefined) {
  if (!document?.file_id) {
    return false;
  }

  const mimeType = document.mime_type?.toLowerCase() ?? "";
  const fileName = document.file_name?.toLowerCase() ?? "";

  return mimeType.startsWith("image/") || mimeType === "application/pdf" || fileName.endsWith(".pdf");
}

function normalizeDocumentAttachment(document: TelegramFileLike): TelegramInboundAttachment {
  const mimeType = document.mime_type?.toLowerCase() ?? "application/octet-stream";
  const isPdf = mimeType === "application/pdf" || document.file_name?.toLowerCase().endsWith(".pdf");
  const fileName =
    document.file_name?.trim() ||
    (isPdf ? `telegram-document-${document.file_id}.pdf` : `telegram-image-${document.file_id}.jpg`);

  return {
    fileUrl: `telegram://${document.file_id}`,
    mimeType: isPdf ? "application/pdf" : mimeType,
    originalFileName: fileName
  };
}

function normalizePhotoAttachment(photo: TelegramPhotoLike, messageId: number | undefined): TelegramInboundAttachment {
  return {
    fileUrl: `telegram://${photo.file_id}`,
    mimeType: "image/jpeg",
    originalFileName: `telegram-photo-${messageId ?? "message"}.jpg`
  };
}

export function parseTelegramUpdate(payload: Record<string, unknown>): TelegramInboundMessage | null {
  const message = readTelegramMessage(payload);

  if (!message?.chat?.id || !message.message_id) {
    return null;
  }

  const chatId = String(message.chat.id);
  const senderName = buildDisplayName(message.from) ?? buildDisplayName(message.chat);
  const senderUsername =
    typeof message.from?.username === "string" && message.from.username.trim().length > 0
      ? message.from.username.trim()
      : typeof message.chat.username === "string" && message.chat.username.trim().length > 0
        ? message.chat.username.trim()
        : undefined;

  const attachments: TelegramInboundAttachment[] = [];

  if (hasSupportedDocument(message.document)) {
    attachments.push(normalizeDocumentAttachment(message.document as TelegramFileLike));
  } else if (Array.isArray(message.photo) && message.photo.length > 0) {
    const bestPhoto = message.photo.at(-1);
    if (bestPhoto?.file_id) {
      attachments.push(normalizePhotoAttachment(bestPhoto, message.message_id));
    }
  }

  return {
    externalId: `${chatId}:${message.message_id}`,
    externalChatId: chatId,
    externalUserId: typeof message.from?.id === "number" ? String(message.from.id) : undefined,
    senderHandle: chatId,
    senderName,
    senderUsername,
    conversationTitle: buildDisplayName(message.chat),
    conversationUsername:
      typeof message.chat.username === "string" && message.chat.username.trim().length > 0
        ? message.chat.username.trim()
        : undefined,
    bodyText:
      typeof message.caption === "string"
        ? message.caption
        : typeof message.text === "string"
          ? message.text
          : undefined,
    sentAt: typeof message.date === "number" ? new Date(message.date * 1000) : undefined,
    attachments,
    rawPayload: payload
  };
}

async function telegramApiRequestWithToken<T>(
  botToken: string,
  method: string,
  body?: Record<string, unknown>
): Promise<T> {
  if (!botToken) {
    throw new Error("Telegram bot token no configurado");
  }

  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const payload = (await response.json()) as TelegramApiResponse<T>;

  if (!response.ok || !payload.ok || payload.result == null) {
    throw new Error(payload.description ?? `Telegram API respondio ${response.status}`);
  }

  return payload.result;
}

async function telegramApiRequest<T>(method: string, body?: Record<string, unknown>): Promise<T> {
  if (!env.TELEGRAM_BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN no configurado");
  }

  return telegramApiRequestWithToken<T>(env.TELEGRAM_BOT_TOKEN, method, body);
}

export async function resolveTelegramFileDownloadUrlWithToken(fileId: string, botToken: string) {
  const result = await telegramApiRequestWithToken<TelegramGetFileResult>(botToken, "getFile", {
    file_id: fileId
  });

  if (!result.file_path) {
    throw new Error("Telegram no devolvio file_path para el archivo solicitado");
  }

  return `https://api.telegram.org/file/bot${botToken}/${result.file_path}`;
}

export async function resolveTelegramFileDownloadUrl(fileId: string) {
  return resolveTelegramFileDownloadUrlWithToken(fileId, env.TELEGRAM_BOT_TOKEN);
}

export async function sendTelegramTextMessageWithToken(chatId: string, text: string, botToken: string) {
  await telegramApiRequestWithToken(botToken, "sendMessage", {
    chat_id: chatId,
    text
  });
}

export async function sendTelegramTextMessage(chatId: string, text: string) {
  await sendTelegramTextMessageWithToken(chatId, text, env.TELEGRAM_BOT_TOKEN);
}

export async function setTelegramWebhookWithToken(input: {
  botToken: string;
  webhookUrl: string;
  secretToken?: string;
}) {
  return telegramApiRequestWithToken<boolean>(input.botToken, "setWebhook", {
    url: input.webhookUrl,
    secret_token: input.secretToken || undefined,
    allowed_updates: ["message", "edited_message"]
  });
}

export async function setTelegramWebhook() {
  if (!env.TELEGRAM_WEBHOOK_URL) {
    throw new Error("TELEGRAM_WEBHOOK_URL no configurado");
  }

  return setTelegramWebhookWithToken({
    botToken: env.TELEGRAM_BOT_TOKEN,
    webhookUrl: env.TELEGRAM_WEBHOOK_URL,
    secretToken: env.TELEGRAM_WEBHOOK_SECRET
  });
}

export async function getTelegramWebhookInfo() {
  return telegramApiRequest<Record<string, unknown>>("getWebhookInfo");
}
