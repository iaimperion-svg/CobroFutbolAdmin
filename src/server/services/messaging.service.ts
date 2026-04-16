import { MessageChannel, MessageDirection, MessageStatus } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { env } from "@/server/config/env";
import { getOutboundMessageQueue } from "@/server/queues";
import { sendTelegramTextMessage } from "@/server/services/telegram.service";

export async function queueSystemReply(input: {
  schoolId: string;
  channel: MessageChannel;
  recipient: string;
  body: string;
  guardianId?: string | null;
  studentId?: string | null;
  conversationId?: string | null;
  externalChatId?: string | null;
  externalUserId?: string | null;
  senderUsername?: string | null;
}) {
  const message = await prisma.message.create({
    data: {
      schoolId: input.schoolId,
      conversationId: input.conversationId ?? undefined,
      guardianId: input.guardianId ?? undefined,
      studentId: input.studentId ?? undefined,
      channel: input.channel,
      direction: MessageDirection.OUTBOUND,
      externalChatId: input.externalChatId ?? input.recipient,
      externalUserId: input.externalUserId ?? undefined,
      senderHandle: input.recipient,
      senderUsername: input.senderUsername ?? undefined,
      bodyText: input.body,
      status: MessageStatus.RECEIVED
    }
  });

  await getOutboundMessageQueue().add("deliver-message", { messageId: message.id });

  return message;
}

export async function deliverOutboundMessage(messageId: string) {
  const message = await prisma.message.findUnique({
    where: { id: messageId }
  });

  if (!message) {
    throw new Error("Message saliente no encontrado");
  }

  try {
    if (message.channel === MessageChannel.TELEGRAM && env.TELEGRAM_BOT_TOKEN && message.senderHandle) {
      await sendTelegramTextMessage(message.senderHandle, message.bodyText ?? "");
    } else if (message.channel === MessageChannel.WHATSAPP && env.WHATSAPP_REPLY_URL) {
      const response = await fetch(env.WHATSAPP_REPLY_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          to: message.senderHandle,
          body: message.bodyText
        })
      });

      if (!response.ok) {
        throw new Error(`Proveedor WhatsApp respondio ${response.status}`);
      }
    }

    await prisma.message.update({
      where: { id: messageId },
      data: {
        status: MessageStatus.SENT,
        processedAt: new Date()
      }
    });
  } catch (error) {
    await prisma.message.update({
      where: { id: messageId },
      data: {
        status: MessageStatus.FAILED,
        processedAt: new Date()
      }
    });

    throw error;
  }
}
