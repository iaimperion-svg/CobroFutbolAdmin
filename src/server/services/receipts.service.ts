import {
  Conversation,
  MessageChannel,
  MessageDirection,
  MessageStatus,
  Prisma,
  ReceiptFileType,
  ReceiptStatus
} from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { getReceiptProcessingQueue } from "@/server/queues";

export type InboundAttachment = {
  fileUrl?: string | null;
  inlineBase64?: string | null;
  mimeType?: string | null;
  originalFileName?: string | null;
};

export async function listReceipts(schoolId: string) {
  return prisma.receipt.findMany({
    where: { schoolId },
    include: {
      message: {
        include: {
          conversation: true
        }
      },
      guardian: true,
      student: true,
      reviewTask: true,
      reconciliations: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: {
          payment: true,
          allocations: {
            include: {
              charge: {
                include: {
                  student: true,
                  guardian: true
                }
              }
            }
          }
        }
      },
      candidateMatches: {
        orderBy: { confidence: "desc" },
        take: 3,
        include: {
          student: true,
          guardian: true,
          charge: {
            include: {
              student: true,
              guardian: true
            }
          }
        }
      }
    },
    orderBy: { receivedAt: "desc" }
  });
}

async function enqueueReceiptProcessing(receiptId: string) {
  const job = await getReceiptProcessingQueue().add("process-receipt", { receiptId });
  console.info("[receipts] queued receipt for processing", {
    receiptId,
    jobId: job.id
  });
  return job;
}

export async function createInboundMessageWithReceipts(input: {
  schoolId: string;
  channel: MessageChannel;
  externalId?: string;
  externalChatId?: string | null;
  externalUserId?: string | null;
  senderHandle?: string | null;
  senderName?: string | null;
  senderUsername?: string | null;
  bodyText?: string | null;
  sentAt?: Date | null;
  conversationTitle?: string | null;
  conversationUsername?: string | null;
  attachments: InboundAttachment[];
  rawPayload?: Record<string, unknown>;
}) {
  const shouldMatchGuardianByPhone =
    input.channel === MessageChannel.WHATSAPP && !!input.senderHandle;

  const guardian = shouldMatchGuardianByPhone
    ? await prisma.guardian.findFirst({
        where: {
          schoolId: input.schoolId,
          phone: input.senderHandle
        }
      })
    : null;

  const existingMessage = input.externalId
    ? await prisma.message.findFirst({
        where: {
          schoolId: input.schoolId,
          channel: input.channel,
          externalId: input.externalId
        },
        include: {
          receipts: true
        }
      })
    : null;

  if (existingMessage) {
    return { message: existingMessage, receipts: existingMessage.receipts, isDuplicate: true };
  }

  let conversation: Conversation | null = null;

  if (input.externalChatId) {
    conversation = await prisma.conversation.upsert({
      where: {
        schoolId_channel_externalChatId: {
          schoolId: input.schoolId,
          channel: input.channel,
          externalChatId: input.externalChatId
        }
      },
      create: {
        schoolId: input.schoolId,
        channel: input.channel,
        externalChatId: input.externalChatId,
        externalUserId: input.externalUserId ?? undefined,
        title: input.conversationTitle ?? input.senderName ?? undefined,
        username: input.conversationUsername ?? input.senderUsername ?? undefined,
        lastMessageAt: input.sentAt ?? new Date()
      },
      update: {
        externalUserId: input.externalUserId ?? undefined,
        title: input.conversationTitle ?? input.senderName ?? undefined,
        username: input.conversationUsername ?? input.senderUsername ?? undefined,
        lastMessageAt: input.sentAt ?? new Date()
      }
    });
  }

  const message = await prisma.message.create({
    data: {
      schoolId: input.schoolId,
      conversationId: conversation?.id,
      guardianId: guardian?.id,
      channel: input.channel,
      direction: MessageDirection.INBOUND,
      externalId: input.externalId,
      externalChatId: input.externalChatId ?? undefined,
      externalUserId: input.externalUserId ?? undefined,
      senderHandle: input.senderHandle,
      senderName: input.senderName,
      senderUsername: input.senderUsername ?? undefined,
      bodyText: input.bodyText,
      mediaCount: input.attachments.length,
      rawPayload: input.rawPayload as Prisma.InputJsonValue | undefined,
      sentAt: input.sentAt ?? undefined,
      status: MessageStatus.PROCESSED
    }
  });

  const receipts = await Promise.all(
    input.attachments.map(async (attachment) => {
      const receipt = await prisma.receipt.create({
        data: {
          schoolId: input.schoolId,
          guardianId: guardian?.id,
          channel: input.channel,
          status: ReceiptStatus.RECEIVED,
          messageId: message.id,
          fileType: attachment.mimeType?.includes("pdf") ? ReceiptFileType.PDF : ReceiptFileType.IMAGE,
          fileUrl: attachment.fileUrl,
          mimeType: attachment.mimeType,
          originalFileName: attachment.originalFileName,
          rawPayload: {
            inlineBase64: attachment.inlineBase64,
            bodyText: input.bodyText,
            externalChatId: input.externalChatId,
            externalUserId: input.externalUserId,
            senderUsername: input.senderUsername
          } as Prisma.InputJsonValue
        }
      });

      await enqueueReceiptProcessing(receipt.id);
      return receipt;
    })
  );

  return { message, receipts, isDuplicate: false };
}



const terminalStatuses = new Set<ReceiptStatus>([
  ReceiptStatus.MATCHED,
  ReceiptStatus.AUTO_RECONCILED,
  ReceiptStatus.MANUAL_REVIEW,
  ReceiptStatus.FAILED
]);

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function waitForReceiptProcessing(receiptId: string, timeoutMs = 8000) {
  const startedAt = Date.now();
  let receipt = await prisma.receipt.findUnique({
    where: { id: receiptId },
    include: {
      guardian: true,
      student: true,
      reconciliations: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: {
          allocations: {
            include: {
              charge: {
                include: {
                  student: true
                }
              }
            }
          },
          payment: true
        }
      }
    }
  });

  while (receipt && !terminalStatuses.has(receipt.status) && Date.now() - startedAt < timeoutMs) {
    await delay(400);
    receipt = await prisma.receipt.findUnique({
      where: { id: receiptId },
      include: {
        guardian: true,
        student: true,
        reconciliations: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: {
            allocations: {
              include: {
                charge: {
                  include: {
                    student: true
                  }
                }
              }
            },
            payment: true
          }
        }
      }
    });
  }

  console.info("[receipts] wait for processing finished", {
    receiptId,
    waitedMs: Date.now() - startedAt,
    status: receipt?.status ?? "NOT_FOUND"
  });

  return receipt;
}

