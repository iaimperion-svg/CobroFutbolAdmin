import { MessageChannel } from "@prisma/client";
import { env } from "@/server/config/env";
import { prisma } from "@/server/db/prisma";
import { AppError } from "@/server/http/errors";
import { queueSystemReply } from "@/server/services/messaging.service";
import {
  handleOnboardingTelegramUpdate,
  shouldHandleOnboardingTelegramUpdate
} from "@/server/services/onboarding.service";
import { handleReceiptResolutionPromptReply } from "@/server/services/receipt-resolution.service";
import { createInboundMessageWithReceipts, type InboundAttachment } from "@/server/services/receipts.service";
import { resolveSchoolFromInboundAttachments } from "@/server/services/school-resolution.service";
import { parseTelegramUpdate, sendTelegramTextMessage } from "@/server/services/telegram.service";

async function resolveSchoolId(schoolSlug: string) {
  const school = await prisma.school.findUnique({
    where: { slug: schoolSlug }
  });

  if (!school) {
    throw new AppError("Escuela no encontrada", 404);
  }

  return school.id;
}

async function resolveRecentSchoolIdFromChat(input: {
  channel: MessageChannel;
  externalChatId?: string | null;
  senderHandle?: string | null;
}) {
  if (!input.externalChatId && !input.senderHandle) {
    return null;
  }

  const recentMessage = await prisma.message.findFirst({
    where: {
      channel: input.channel,
      OR: [
        ...(input.externalChatId ? [{ externalChatId: input.externalChatId }] : []),
        ...(input.senderHandle ? [{ senderHandle: input.senderHandle }] : [])
      ]
    },
    orderBy: { createdAt: "desc" },
    select: { schoolId: true }
  });

  return recentMessage?.schoolId ?? null;
}

export async function ingestWhatsappWebhook(payload: Record<string, unknown>, schoolSlug?: string) {
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

  if (attachments.length === 0 && typeof payload.message === "string" && !schoolSlug) {
    const replyResult = await handleReceiptResolutionPromptReply({
      senderHandle: typeof payload.from === "string" ? payload.from : undefined,
      bodyText: payload.message
    });

    if (replyResult) {
      return replyResult;
    }
  }

  const schoolId = schoolSlug
    ? await resolveSchoolId(schoolSlug)
    : (
        await resolveSchoolFromInboundAttachments({
          attachments,
          bodyText: typeof payload.message === "string" ? payload.message : undefined,
          rawPayload: payload
        })
      )?.schoolId;

  if (!schoolId) {
    return {
      ignored: true,
      reason: "No pudimos identificar la escuela para este mensaje"
    };
  }

  const result = await createInboundMessageWithReceipts({
    schoolId,
    channel: MessageChannel.WHATSAPP,
    externalId: typeof payload.id === "string" ? payload.id : undefined,
    senderHandle: typeof payload.from === "string" ? payload.from : undefined,
    senderName: typeof payload.senderName === "string" ? payload.senderName : undefined,
    bodyText: typeof payload.message === "string" ? payload.message : undefined,
    attachments,
    rawPayload: payload
  });

  if (attachments.length === 0 && typeof payload.message === "string") {
    const replyResult = await handleReceiptResolutionPromptReply({
      schoolId,
      senderHandle: typeof payload.from === "string" ? payload.from : undefined,
      bodyText: payload.message
    });

    if (replyResult) {
      return replyResult;
    }
  }

  return result;
}

export async function ingestTelegramWebhook(payload: Record<string, unknown>, schoolSlug?: string) {
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

  if (parsed.attachments.length === 0 && parsed.bodyText && !schoolSlug) {
    const replyResult = await handleReceiptResolutionPromptReply({
      senderHandle: parsed.senderHandle,
      externalChatId: parsed.externalChatId,
      bodyText: parsed.bodyText
    });

    if (replyResult) {
      return replyResult;
    }
  }

  const resolvedSchool = schoolSlug
    ? { schoolId: await resolveSchoolId(schoolSlug) }
    : await resolveSchoolFromInboundAttachments({
        attachments: parsed.attachments,
        bodyText: parsed.bodyText,
        rawPayload: parsed.rawPayload,
        telegramBotToken: env.TELEGRAM_BOT_TOKEN
      });

  const schoolId =
    resolvedSchool?.schoolId ??
    (parsed.attachments.length === 0
      ? await resolveRecentSchoolIdFromChat({
          channel: MessageChannel.TELEGRAM,
          externalChatId: parsed.externalChatId,
          senderHandle: parsed.senderHandle
        })
      : null);

  if (!schoolId) {
    const reason = parsed.attachments.length > 0
      ? "No pude identificar la escuela de este comprobante. Reenvialo indicando el codigo de la escuela o con una imagen donde se vea claramente la cuenta destino."
      : "No pude identificar la escuela para este mensaje. Enviame un comprobante claro o el codigo de la escuela.";

    await sendTelegramTextMessage(parsed.senderHandle, reason).catch((error) => {
      console.error("[telegram] failed to send unidentified-school reply", {
        externalChatId: parsed.externalChatId,
        error: error instanceof Error ? error.message : "Unknown error"
      });
    });

    return {
      ignored: true,
      reason
    };
  }

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

  if (parsed.attachments.length === 0 && parsed.bodyText) {
    const replyResult = await handleReceiptResolutionPromptReply({
      schoolId,
      senderHandle: parsed.senderHandle,
      externalChatId: parsed.externalChatId,
      bodyText: parsed.bodyText
    });

    if (replyResult) {
      return replyResult;
    }
  }

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

  if (!result.isDuplicate && result.receipts.length === 0 && parsed.bodyText) {
    const fallbackReply = queueSystemReply({
      schoolId,
      channel: MessageChannel.TELEGRAM,
      recipient: parsed.senderHandle,
      body:
        "Estoy activo. Para registrar un pago, enviame una foto clara del comprobante. Si estabas respondiendo una pregunta anterior, escribe solo el numero de la opcion.",
      conversationId: result.message.conversationId,
      externalChatId: parsed.externalChatId,
      externalUserId: parsed.externalUserId,
      senderUsername: parsed.senderUsername
    });

    void Promise.resolve(fallbackReply).catch((error) => {
      console.error("[telegram] failed to enqueue fallback reply", {
        schoolId,
        externalChatId: parsed.externalChatId,
        error: error instanceof Error ? error.message : "Unknown error"
      });
    });
  }

  return result;
}
