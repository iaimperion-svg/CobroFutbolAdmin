import { Prisma, ReceiptResolutionPromptStatus, ReviewTaskStatus, ReceiptStatus } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import {
  processReceiptReconciliation,
  reconcileReceiptWithCharges
} from "@/server/services/reconciliation.service";
import { queueSystemReply } from "@/server/services/messaging.service";
import { normalizeText } from "@/server/utils/strings";

type PromptOption = {
  key: string;
  number: number;
  label: string;
  helperText?: string;
};

function readPromptOptions(value: Prisma.JsonValue | null | undefined): PromptOption[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const option = item as Record<string, unknown>;
    const key = typeof option.key === "string" ? option.key : null;
    const number = typeof option.number === "number" ? option.number : null;
    const label = typeof option.label === "string" ? option.label : null;

    if (!key || !number || !label) {
      return [];
    }

    return [{
      key,
      number,
      label,
      helperText: typeof option.helperText === "string" ? option.helperText : undefined
    }];
  });
}

function resolvePromptAnswer(options: PromptOption[], answer: string) {
  const normalizedAnswer = normalizeText(answer);
  if (!normalizedAnswer) {
    return null;
  }

  const byNumber = options.find((option) => normalizedAnswer === String(option.number));
  if (byNumber) {
    return byNumber;
  }

  const byLabel = options.filter((option) => {
    const normalizedLabel = normalizeText(option.label);
    return normalizedAnswer === normalizedLabel || normalizedAnswer.includes(normalizedLabel);
  });

  if (byLabel.length === 1) {
    return byLabel[0] ?? null;
  }

  return null;
}

function readPromptContext(value: Prisma.JsonValue | null | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function readPayerChargeIds(context: Record<string, unknown>, selectedKey: string) {
  const payerOptions = Array.isArray(context.payerOptions) ? context.payerOptions : [];
  const selectedPayer = payerOptions.find((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return false;
    }

    return (item as Record<string, unknown>).key === selectedKey;
  });

  if (!selectedPayer || typeof selectedPayer !== "object" || Array.isArray(selectedPayer)) {
    return [];
  }

  const chargeIds = (selectedPayer as Record<string, unknown>).chargeIds;
  return Array.isArray(chargeIds)
    ? chargeIds.filter((value): value is string => typeof value === "string")
    : [];
}

async function expirePrompt(prompt: {
  id: string;
  schoolId: string;
  receiptId: string;
  receipt: {
    channel: "WHATSAPP" | "TELEGRAM" | "INTERNAL";
    message?: {
      senderHandle?: string | null;
      conversationId?: string | null;
      externalChatId?: string | null;
      externalUserId?: string | null;
      senderUsername?: string | null;
    } | null;
  };
}) {
  await prisma.receiptResolutionPrompt.update({
    where: { id: prompt.id },
    data: {
      status: ReceiptResolutionPromptStatus.EXPIRED
    }
  });

  await prisma.receipt.update({
    where: { id: prompt.receiptId },
    data: {
      status: ReceiptStatus.MANUAL_REVIEW,
      processedAt: new Date()
    }
  });

  await prisma.reviewTask.upsert({
    where: { receiptId: prompt.receiptId },
    create: {
      schoolId: prompt.schoolId,
      receiptId: prompt.receiptId,
      status: ReviewTaskStatus.OPEN,
      priority: 1,
      reason: "No hubo respuesta del apoderado a la consulta automatica"
    },
    update: {
      status: ReviewTaskStatus.OPEN,
      priority: 1,
      reason: "No hubo respuesta del apoderado a la consulta automatica",
      decisionType: null,
      rejectionReason: null,
      resolutionNotes: null,
      resolutionMetadata: Prisma.JsonNull,
      resolvedAt: null
    }
  });

  if (prompt.receipt.message?.senderHandle) {
    await queueSystemReply({
      schoolId: prompt.schoolId,
      channel: prompt.receipt.channel,
      recipient: prompt.receipt.message.senderHandle,
      conversationId: prompt.receipt.message.conversationId ?? undefined,
      externalChatId: prompt.receipt.message.externalChatId ?? undefined,
      externalUserId: prompt.receipt.message.externalUserId ?? undefined,
      senderUsername: prompt.receipt.message.senderUsername ?? undefined,
      body:
        "Gracias. Como la respuesta llego fuera de tiempo, dejamos el comprobante en revision manual para que el equipo lo valide."
    });
  }
}

export async function handleReceiptResolutionPromptReply(input: {
  schoolId?: string;
  senderHandle?: string | null;
  externalChatId?: string | null;
  bodyText?: string | null;
}) {
  const bodyText = input.bodyText?.trim();
  if (!bodyText || (!input.senderHandle && !input.externalChatId)) {
    return null;
  }

  const messageFilters: Prisma.MessageWhereInput[] = [];

  if (input.senderHandle) {
    messageFilters.push({ senderHandle: input.senderHandle });
  }

  if (input.externalChatId) {
    messageFilters.push({ externalChatId: input.externalChatId });
  }

  if (messageFilters.length === 0) {
    return null;
  }

  const prompt = await prisma.receiptResolutionPrompt.findFirst({
    where: {
      schoolId: input.schoolId,
      status: ReceiptResolutionPromptStatus.OPEN,
      receipt: {
        message: {
          OR: messageFilters
        }
      }
    },
    include: {
      receipt: {
        include: {
          message: true
        }
      }
    },
    orderBy: {
      askedAt: "desc"
    }
  });

  if (!prompt) {
    return null;
  }

  if (prompt.expiresAt && prompt.expiresAt.getTime() < Date.now()) {
    await expirePrompt(prompt);
    return {
      handled: true,
      action: "expired"
    } as const;
  }

  const options = readPromptOptions(prompt.options);
  const selectedOption = resolvePromptAnswer(options, bodyText);

  if (!selectedOption) {
    if (prompt.receipt.message?.senderHandle) {
      await queueSystemReply({
        schoolId: prompt.schoolId,
        channel: prompt.receipt.channel,
        recipient: prompt.receipt.message.senderHandle,
        conversationId: prompt.receipt.message.conversationId ?? undefined,
        externalChatId: prompt.receipt.message.externalChatId ?? undefined,
        externalUserId: prompt.receipt.message.externalUserId ?? undefined,
        senderUsername: prompt.receipt.message.senderUsername ?? undefined,
        body: "No pude interpretar tu respuesta. Por favor responde solo con el numero de una de las opciones indicadas."
      });
    }

    return {
      handled: true,
      action: "invalid_reply"
    } as const;
  }

  await prisma.receiptResolutionPrompt.update({
    where: { id: prompt.id },
    data: {
      status: ReceiptResolutionPromptStatus.ANSWERED,
      selectedOption: selectedOption.key,
      freeTextAnswer: bodyText,
      answeredAt: new Date()
    }
  });

  if (prompt.type === "SELECT_PAYER") {
    const context = readPromptContext(prompt.context);

    if (selectedOption.key === "manual_review") {
      await prisma.receipt.update({
        where: { id: prompt.receiptId },
        data: {
          status: ReceiptStatus.MANUAL_REVIEW,
          processedAt: new Date()
        }
      });

      await prisma.reviewTask.upsert({
        where: { receiptId: prompt.receiptId },
        create: {
          schoolId: prompt.schoolId,
          receiptId: prompt.receiptId,
          status: ReviewTaskStatus.OPEN,
          priority: 1,
          reason: "El pagador prefirio revision manual para identificar el pago"
        },
        update: {
          status: ReviewTaskStatus.OPEN,
          priority: 1,
          decisionType: null,
          rejectionReason: null,
          resolutionNotes: null,
          resolutionMetadata: Prisma.JsonNull,
          resolvedAt: null,
          reason: "El pagador prefirio revision manual para identificar el pago"
        }
      });

      if (prompt.receipt.message?.senderHandle) {
        await queueSystemReply({
          schoolId: prompt.schoolId,
          channel: prompt.receipt.channel,
          recipient: prompt.receipt.message.senderHandle,
          conversationId: prompt.receipt.message.conversationId ?? undefined,
          externalChatId: prompt.receipt.message.externalChatId ?? undefined,
          externalUserId: prompt.receipt.message.externalUserId ?? undefined,
          senderUsername: prompt.receipt.message.senderUsername ?? undefined,
          body: "Perfecto. Dejamos tu comprobante en revision manual para que el equipo lo valide."
        });
      }
    } else {
      const chargeIds = readPayerChargeIds(context, selectedOption.key);

      if (chargeIds.length === 0) {
        await prisma.receipt.update({
          where: { id: prompt.receiptId },
          data: {
            status: ReceiptStatus.MANUAL_REVIEW,
            processedAt: new Date()
          }
        });

        await prisma.reviewTask.upsert({
          where: { receiptId: prompt.receiptId },
          create: {
            schoolId: prompt.schoolId,
            receiptId: prompt.receiptId,
            status: ReviewTaskStatus.OPEN,
            priority: 1,
            reason: "No se pudo reconstruir la seleccion del pagador"
          },
          update: {
            status: ReviewTaskStatus.OPEN,
            priority: 1,
            decisionType: null,
            rejectionReason: null,
            resolutionNotes: null,
            resolutionMetadata: Prisma.JsonNull,
            resolvedAt: null,
            reason: "No se pudo reconstruir la seleccion del pagador"
          }
        });
      } else {
        await reconcileReceiptWithCharges({
          receiptId: prompt.receiptId,
          chargeIds,
          mode: "automatic",
          strategy: "payer_identified_household_distribution",
          notes: "El pagador identifico el grupo familiar para aplicar el comprobante.",
          resolutionMetadata: {
            source: "payer_reply",
            selectedPayer: selectedOption.key,
            chargeIds
          }
        });
      }
    }
  } else if (prompt.type === "SELECT_STUDENT") {
    await processReceiptReconciliation(prompt.receiptId, {
      source: "payer_reply",
      forcedStudentId: selectedOption.key
    });
  } else if (prompt.type === "SELECT_PERIOD") {
    await processReceiptReconciliation(prompt.receiptId, {
      source: "payer_reply",
      forcedChargeId: selectedOption.key
    });
  } else if (prompt.type === "CONFIRM_PARTIAL_PAYMENT") {
    if (selectedOption.key.startsWith("confirm_partial:")) {
      const confirmedChargeId = selectedOption.key.replace("confirm_partial:", "").trim();

      await processReceiptReconciliation(prompt.receiptId, {
        source: "payer_reply",
        forcedChargeId: confirmedChargeId
      });
    } else {
      const context = readPromptContext(prompt.context);

      await prisma.receipt.update({
        where: { id: prompt.receiptId },
        data: {
          status: ReceiptStatus.MANUAL_REVIEW,
          processedAt: new Date()
        }
      });

      await prisma.reviewTask.upsert({
        where: { receiptId: prompt.receiptId },
        create: {
          schoolId: prompt.schoolId,
          receiptId: prompt.receiptId,
          status: ReviewTaskStatus.OPEN,
          priority: 1,
          suggestedStudentId: typeof context.studentId === "string" ? context.studentId : undefined,
          reason: "El apoderado prefirio que el abono parcial se revise manualmente"
        },
        update: {
          status: ReviewTaskStatus.OPEN,
          priority: 1,
          suggestedStudentId: typeof context.studentId === "string" ? context.studentId : undefined,
          decisionType: null,
          rejectionReason: null,
          resolutionNotes: null,
          resolutionMetadata: Prisma.JsonNull,
          resolvedAt: null,
          reason: "El apoderado prefirio que el abono parcial se revise manualmente"
        }
      });

      if (prompt.receipt.message?.senderHandle) {
        await queueSystemReply({
          schoolId: prompt.schoolId,
          channel: prompt.receipt.channel,
          recipient: prompt.receipt.message.senderHandle,
          conversationId: prompt.receipt.message.conversationId ?? undefined,
          externalChatId: prompt.receipt.message.externalChatId ?? undefined,
          externalUserId: prompt.receipt.message.externalUserId ?? undefined,
          senderUsername: prompt.receipt.message.senderUsername ?? undefined,
          body: "Perfecto. Dejamos tu comprobante en revision manual para que el equipo valide ese abono."
        });
      }
    }
  } else if (prompt.type === "CONFIRM_OVERPAYMENT") {
    if (selectedOption.key === "apply_oldest_debts") {
      const context = readPromptContext(prompt.context);
      const chargeIds = Array.isArray(context.chargeIds)
        ? context.chargeIds.filter((value): value is string => typeof value === "string")
        : [];

      await reconcileReceiptWithCharges({
        receiptId: prompt.receiptId,
        chargeIds,
        mode: "automatic",
        strategy: "payer_confirmed_overpayment_distribution",
        notes: "El apoderado confirmo aplicar el excedente a las mensualidades mas antiguas.",
        resolutionMetadata: {
          source: "payer_reply",
          chargeIds,
          overpaymentConfirmed: true
        }
      });
    } else {
      const context = readPromptContext(prompt.context);

      await prisma.receipt.update({
        where: { id: prompt.receiptId },
        data: {
          status: ReceiptStatus.MANUAL_REVIEW,
          processedAt: new Date()
        }
      });

      await prisma.reviewTask.upsert({
        where: { receiptId: prompt.receiptId },
        create: {
          schoolId: prompt.schoolId,
          receiptId: prompt.receiptId,
          status: ReviewTaskStatus.OPEN,
          priority: 1,
          suggestedStudentId: typeof context.studentId === "string" ? context.studentId : undefined,
          reason: "El apoderado prefirio revisar manualmente el uso del monto excedente"
        },
        update: {
          status: ReviewTaskStatus.OPEN,
          priority: 1,
          suggestedStudentId: typeof context.studentId === "string" ? context.studentId : undefined,
          decisionType: null,
          rejectionReason: null,
          resolutionNotes: null,
          resolutionMetadata: Prisma.JsonNull,
          resolvedAt: null,
          reason: "El apoderado prefirio revisar manualmente el uso del monto excedente"
        }
      });

      if (prompt.receipt.message?.senderHandle) {
        await queueSystemReply({
          schoolId: prompt.schoolId,
          channel: prompt.receipt.channel,
          recipient: prompt.receipt.message.senderHandle,
          conversationId: prompt.receipt.message.conversationId ?? undefined,
          externalChatId: prompt.receipt.message.externalChatId ?? undefined,
          externalUserId: prompt.receipt.message.externalUserId ?? undefined,
          senderUsername: prompt.receipt.message.senderUsername ?? undefined,
          body: "Perfecto. Dejamos tu comprobante en revision manual para que el equipo valide como aplicar ese monto."
        });
      }
    }
  }

  return {
    handled: true,
    action: "answered",
    receiptId: prompt.receiptId,
    promptId: prompt.id,
    selectedOption: selectedOption.key
  } as const;
}
