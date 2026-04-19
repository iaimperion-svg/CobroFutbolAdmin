import { MessageChannel } from "@prisma/client";
import { env } from "@/server/config/env";
import { prisma } from "@/server/db/prisma";
import { AppError } from "@/server/http/errors";
import { queueSystemReply } from "@/server/services/messaging.service";
import {
  handleOnboardingTelegramUpdate,
  shouldHandleOnboardingTelegramUpdate
} from "@/server/services/onboarding.service";
import { createInboundMessageWithReceipts, type InboundAttachment } from "@/server/services/receipts.service";
import { parseTelegramUpdate } from "@/server/services/telegram.service";

async function resolveSchoolId(schoolSlug: string) {
  const school = await prisma.school.findUnique({
    where: { slug: schoolSlug }
  });

  if (!school) {
    throw new AppError("Escuela no encontrada", 404);
  }

  return school.id;
}

export async function ingestWhatsappWebhook(payload: Record<string, unknown>, schoolSlug: string) {
  const schoolId = await resolveSchoolId(schoolSlug);

  const attachments: InboundAttachment[] = Array.isArray(payload.media)
    ? payload.media.map((item) => ({
        fileUrl: typeof item === "object" && item ? String((item as Record<string, unknown>).url ?? "") : undefined,
        mimeType:
          typeof item === "object" && item ? String((item as Record<string, unknown>).mimeType ?? "") : undefined,
        originalFileName:
          typeof item === "object" && item
            ? String((item as Record<string, unknown>).fileName ?? "comprobante.jpg")
            : undefined,
        inlineBase64:
          typeof item === "object" && item ? String((item as Record<string, unknown>).base64 ?? "") : undefined
      }))
    : [];

  return createInboundMessageWithReceipts({
    schoolId,
    channel: MessageChannel.WHATSAPP,
    externalId: typeof payload.id === "string" ? payload.id : undefined,
    senderHandle: typeof payload.from === "string" ? payload.from : undefined,
    senderName: typeof payload.senderName === "string" ? payload.senderName : undefined,
    bodyText: typeof payload.message === "string" ? payload.message : undefined,
    attachments,
    rawPayload: payload
  });
}

export async function ingestTelegramWebhook(payload: Record<string, unknown>, schoolSlug: string) {
  if (!env.TELEGRAM_ENABLED) {
    throw new AppError("Telegram no esta habilitado", 503);
  }

  const parsed = parseTelegramUpdate(payload);

  if (!parsed) {
    return {
      ignored: true,
      reason: "Update de Telegram sin mensaje compatible"
    };
  }

  if (await shouldHandleOnboardingTelegramUpdate(parsed)) {
    return handleOnboardingTelegramUpdate(parsed);
  }

  const schoolId = await resolveSchoolId(schoolSlug);
  const result = await createInboundMessageWithReceipts({
    schoolId,
    channel: MessageChannel.TELEGRAM,
    externalId: parsed.externalId,
    externalChatId: parsed.externalChatId,
    externalUserId: parsed.externalUserId,
    senderHandle: parsed.senderHandle,
    senderName: parsed.senderName,
    senderUsername: parsed.senderUsername,
    bodyText: parsed.bodyText,
    sentAt: parsed.sentAt,
    conversationTitle: parsed.conversationTitle,
    conversationUsername: parsed.conversationUsername,
    attachments: parsed.attachments satisfies InboundAttachment[],
    rawPayload: parsed.rawPayload
  });

  if (!result.isDuplicate && result.receipts.length > 0) {
    const acknowledgement = queueSystemReply({
      schoolId,
      channel: MessageChannel.TELEGRAM,
      recipient: parsed.senderHandle,
      body:
        "Recibimos tu comprobante y ya lo estamos analizando. En breve te confirmaremos por este mismo chat si el pago pudo validarse automaticamente o si quedo en revision.",
      conversationId: result.message.conversationId,
      externalChatId: parsed.externalChatId,
      externalUserId: parsed.externalUserId,
      senderUsername: parsed.senderUsername
    });

    void Promise.resolve(acknowledgement).catch((error) => {
      console.error("[telegram] failed to enqueue acknowledgement", {
        schoolId,
        externalChatId: parsed.externalChatId,
        error: error instanceof Error ? error.message : "Unknown error"
      });
    });
  }

  return result;
}
