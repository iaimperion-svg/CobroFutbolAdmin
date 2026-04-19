import {
  ChargeStatus,
  ManualDecisionType,
  MessageChannel,
  PaymentStatus,
  Prisma,
  ReconciliationStatus,
  ReceiptStatus,
  ReviewTaskStatus
} from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { env } from "@/server/config/env";
import { AppError } from "@/server/http/errors";
import { rankReceiptCandidates } from "@/server/services/matching.service";
import { queueSystemReply } from "@/server/services/messaging.service";
import { createAuditLog } from "@/server/services/audit.service";

function getChargeStatus(outstandingCents: number, dueDate: Date) {
  if (outstandingCents <= 0) {
    return ChargeStatus.PAID;
  }

  return dueDate.getTime() < Date.now() ? ChargeStatus.OVERDUE : ChargeStatus.PENDING;
}

function getUpdatedChargeStatus(charge: {
  outstandingCents: number;
  amountCents: number;
  dueDate: Date;
}) {
  if (charge.outstandingCents <= 0) {
    return ChargeStatus.PAID;
  }

  if (charge.outstandingCents >= charge.amountCents) {
    return getChargeStatus(charge.outstandingCents, charge.dueDate);
  }

  return charge.dueDate.getTime() < Date.now() ? ChargeStatus.OVERDUE : ChargeStatus.PARTIALLY_PAID;
}

type TransactionClient = Prisma.TransactionClient;

export async function restoreReconciliationAllocations(
  tx: TransactionClient,
  reconciliationId: string
) {
  const allocations = await tx.reconciliationAllocation.findMany({
    where: { reconciliationId },
    include: {
      charge: true
    }
  });

  for (const allocation of allocations) {
    const restoredOutstanding = Math.min(
      allocation.charge.outstandingCents + allocation.amountCents,
      allocation.charge.amountCents
    );

    await tx.charge.update({
      where: { id: allocation.chargeId },
      data: {
        outstandingCents: restoredOutstanding,
        status: getUpdatedChargeStatus({
          outstandingCents: restoredOutstanding,
          amountCents: allocation.charge.amountCents,
          dueDate: allocation.charge.dueDate
        })
      }
    });
  }

  if (allocations.length > 0) {
    await tx.reconciliationAllocation.deleteMany({
      where: { reconciliationId }
    });
  }

  return allocations;
}

function getManualActionLabel(decisionType: ManualDecisionType | null | undefined) {
  switch (decisionType) {
    case ManualDecisionType.REASSIGNED:
      return "receipt.review.reassigned";
    case ManualDecisionType.MANUAL_PAYMENT:
      return "receipt.review.manual_payment_confirmed";
    case ManualDecisionType.REPROCESSED:
      return "receipt.review.reprocessed_and_confirmed";
    case ManualDecisionType.APPROVED_SUGGESTION:
      return "receipt.review.approved";
    default:
      return "receipt.manual.reconciled";
  }
}

async function queueReceiptStatusReply(input: {
  receipt: {
    schoolId: string;
    channel: MessageChannel;
    message?: {
      senderHandle?: string | null;
      conversationId?: string | null;
      externalChatId?: string | null;
      externalUserId?: string | null;
      senderUsername?: string | null;
    } | null;
  };
  body: string;
}) {
  if (!input.receipt.message?.senderHandle) {
    return;
  }

  await queueSystemReply({
    schoolId: input.receipt.schoolId,
    channel: input.receipt.channel,
    recipient: input.receipt.message.senderHandle,
    conversationId: input.receipt.message.conversationId ?? undefined,
    externalChatId: input.receipt.message.externalChatId ?? undefined,
    externalUserId: input.receipt.message.externalUserId ?? undefined,
    senderUsername: input.receipt.message.senderUsername ?? undefined,
    body: input.body
  });
}

export async function reconcileReceiptWithCharge(input: {
  receiptId: string;
  chargeId: string;
  mode: "automatic" | "manual";
  actorUserId?: string;
  matchScore?: number;
  strategy?: string;
  notes?: string;
  reviewDecisionType?: ManualDecisionType;
  resolutionNotes?: string;
  resolutionMetadata?: Record<string, unknown>;
}) {
  const receipt = await prisma.receipt.findUnique({
    where: { id: input.receiptId },
    include: {
      message: true,
      reviewTask: true,
      payment: true
    }
  });

  if (!receipt || !receipt.extractedAmountCents) {
    throw new AppError("Comprobante invalido para conciliacion");
  }

  const receiptAmountCents = receipt.extractedAmountCents;

  const charge = await prisma.charge.findUnique({
    where: { id: input.chargeId },
    include: {
      student: true,
      guardian: true
    }
  });

  if (!charge || charge.schoolId !== receipt.schoolId) {
    throw new AppError("Cargo no encontrado");
  }

  if (charge.outstandingCents <= 0) {
    throw new AppError("El cargo seleccionado ya no tiene saldo pendiente");
  }

  return prisma.$transaction(async (tx) => {
    const existingPayment = await tx.payment.findUnique({
      where: { receiptId: receipt.id }
    });

    const payment =
      existingPayment ??
      (await tx.payment.create({
        data: {
          schoolId: receipt.schoolId,
          studentId: charge.studentId,
          guardianId: charge.guardianId ?? undefined,
          receiptId: receipt.id,
          amountCents: receiptAmountCents,
          paidAt: receipt.extractedPaidAt ?? receipt.receivedAt,
          senderName: receipt.extractedSenderName,
          senderReference: receipt.extractedReference,
          bankName: receipt.extractedBankName,
          source: receipt.channel,
          status: PaymentStatus.RECONCILED
        }
      }));

    const currentReconciliation = await tx.reconciliation.findUnique({
      where: {
        paymentId_receiptId: {
          paymentId: payment.id,
          receiptId: receipt.id
        }
      }
    });

    if (currentReconciliation) {
      await restoreReconciliationAllocations(tx, currentReconciliation.id);
    }

    const targetCharge = await tx.charge.findUnique({
      where: { id: charge.id }
    });

    if (!targetCharge || targetCharge.schoolId !== receipt.schoolId) {
      throw new AppError("Cargo no encontrado");
    }

    const appliedCents = Math.min(targetCharge.outstandingCents, payment.amountCents);
    const remainingOutstanding = Math.max(targetCharge.outstandingCents - appliedCents, 0);
    const reconciliationStatus =
      input.mode === "automatic"
        ? ReconciliationStatus.AUTO_CONFIRMED
        : ReconciliationStatus.CONFIRMED;

    const reconciliation = await tx.reconciliation.upsert({
      where: {
        paymentId_receiptId: {
          paymentId: payment.id,
          receiptId: receipt.id
        }
      },
      create: {
        schoolId: receipt.schoolId,
        paymentId: payment.id,
        receiptId: receipt.id,
        status: reconciliationStatus,
        matchScore: input.matchScore ?? (input.mode === "automatic" ? 0.95 : 0.85),
        strategy: input.strategy ?? `${input.mode}_reconciliation`,
        notes: input.notes,
        executedAt: new Date()
      },
      update: {
        status: reconciliationStatus,
        matchScore: input.matchScore ?? (input.mode === "automatic" ? 0.95 : 0.85),
        strategy: input.strategy ?? `${input.mode}_reconciliation`,
        notes: input.notes,
        executedAt: new Date()
      }
    });

    await tx.reconciliationAllocation.deleteMany({
      where: {
        reconciliationId: reconciliation.id,
        chargeId: {
          not: charge.id
        }
      }
    });

    await tx.reconciliationAllocation.upsert({
      where: {
        reconciliationId_chargeId: {
          reconciliationId: reconciliation.id,
          chargeId: charge.id
        }
      },
      create: {
        reconciliationId: reconciliation.id,
        chargeId: charge.id,
        amountCents: appliedCents
      },
      update: {
        amountCents: appliedCents
      }
    });

    await tx.charge.update({
      where: { id: targetCharge.id },
      data: {
        outstandingCents: remainingOutstanding,
        status: getUpdatedChargeStatus({
          outstandingCents: remainingOutstanding,
          amountCents: targetCharge.amountCents,
          dueDate: targetCharge.dueDate
        })
      }
    });

    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.RECONCILED,
        studentId: charge.studentId,
        guardianId: charge.guardianId ?? undefined
      }
    });

    await tx.receipt.update({
      where: { id: receipt.id },
      data: {
        studentId: charge.studentId,
        guardianId: charge.guardianId ?? undefined,
        status:
          input.mode === "automatic" ? ReceiptStatus.AUTO_RECONCILED : ReceiptStatus.MATCHED,
        processedAt: new Date()
      }
    });

    if (receipt.reviewTask) {
      await tx.reviewTask.update({
        where: { id: receipt.reviewTask.id },
        data: {
          reconciliationId: reconciliation.id,
          status: ReviewTaskStatus.RESOLVED,
          decisionType:
            input.reviewDecisionType ??
            (input.mode === "manual" ? ManualDecisionType.APPROVED_SUGGESTION : null),
          rejectionReason: null,
          resolutionNotes: input.resolutionNotes ?? input.notes ?? receipt.reviewTask.resolutionNotes,
          resolutionMetadata: input.resolutionMetadata as Prisma.InputJsonValue | undefined,
          resolvedAt: new Date()
        }
      });
    }

    await createAuditLog(
      {
        schoolId: receipt.schoolId,
        actorUserId: input.actorUserId,
        action:
          input.mode === "automatic"
            ? "receipt.automatic.reconciled"
            : getManualActionLabel(input.reviewDecisionType),
        entityType: "Receipt",
        entityId: receipt.id,
        metadata: {
          chargeId: charge.id,
          paymentId: payment.id,
          reconciliationId: reconciliation.id,
          mode: input.mode,
          reviewDecisionType: input.reviewDecisionType ?? null,
          resolutionNotes: input.resolutionNotes ?? null,
          ...input.resolutionMetadata
        }
      },
      tx
    );

    await queueReceiptStatusReply({
      receipt: {
        schoolId: receipt.schoolId,
        channel: receipt.channel,
        message: receipt.message
      },
      body:
        input.mode === "automatic"
          ? "Recibimos tu comprobante y validamos el pago automaticamente."
          : "Tu comprobante fue conciliado por nuestro equipo."
    });

    return reconciliation;
  });
}

export async function listReconciliations(schoolId: string) {
  return prisma.reconciliation.findMany({
    where: { schoolId },
    include: {
      receipt: {
        include: {
          student: true,
          guardian: true,
          reviewTask: true
        }
      },
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
    },
    orderBy: [{ executedAt: "desc" }, { createdAt: "desc" }]
  });
}

export async function processReceiptReconciliation(
  receiptId: string,
  options?: {
    source?: "ingest" | "reprocess";
    actorUserId?: string;
  }
) {
  const receipt = await prisma.receipt.findUnique({
    where: { id: receiptId },
    include: {
      message: true,
      reviewTask: true,
      payment: true,
      reconciliations: {
        orderBy: { createdAt: "desc" },
        take: 1
      }
    }
  });

  if (!receipt) {
    throw new AppError("Comprobante no encontrado");
  }

  const ranked = await rankReceiptCandidates(receiptId);
  const topCandidate = ranked[0];

  await prisma.receiptCandidateMatch.deleteMany({
    where: { receiptId }
  });

  if (ranked.length > 0) {
    await prisma.receiptCandidateMatch.createMany({
      data: ranked.slice(0, 5).map((candidate) => ({
        schoolId: receipt.schoolId,
        receiptId,
        chargeId: candidate.chargeId,
        studentId: candidate.studentId,
        guardianId: candidate.guardianId ?? undefined,
        matchType: "CHARGE",
        confidence: candidate.confidence,
        rationale: candidate.rationale
      }))
    });
  }

  if (topCandidate && topCandidate.confidence >= env.AUTO_RECONCILIATION_THRESHOLD) {
    return reconcileReceiptWithCharge({
      receiptId,
      chargeId: topCandidate.chargeId,
      mode: "automatic",
      actorUserId: options?.actorUserId,
      matchScore: topCandidate.confidence,
      strategy:
        options?.source === "reprocess"
          ? "automatic_reprocessing_threshold"
          : "automatic_matching_threshold",
      notes: topCandidate.rationale,
      reviewDecisionType:
        options?.source === "reprocess" ? ManualDecisionType.REPROCESSED : undefined,
      resolutionNotes:
        options?.source === "reprocess"
          ? "El comprobante fue reprocesado y se concilio automaticamente."
          : undefined,
      resolutionMetadata:
        options?.source === "reprocess"
          ? { source: "reprocess", matchedChargeId: topCandidate.chargeId }
          : undefined
    });
  }

  const review = await prisma.reviewTask.upsert({
    where: { receiptId },
    create: {
      schoolId: receipt.schoolId,
      receiptId,
      reconciliationId: receipt.reconciliations[0]?.id,
      suggestedStudentId: topCandidate?.studentId,
      suggestedGuardianId: topCandidate?.guardianId ?? undefined,
      priority: topCandidate && topCandidate.confidence >= env.MANUAL_REVIEW_THRESHOLD ? 1 : 2,
      reason:
        topCandidate && ranked.length > 1 && topCandidate.confidence >= env.MANUAL_REVIEW_THRESHOLD
          ? "Hay multiples candidatos y se requiere validacion humana"
          : topCandidate && topCandidate.confidence >= env.MANUAL_REVIEW_THRESHOLD
            ? "Coincidencia parcial requiere validacion humana"
            : "No se encontro una coincidencia confiable"
    },
    update: {
      reconciliationId: receipt.reconciliations[0]?.id,
      suggestedStudentId: topCandidate?.studentId,
      suggestedGuardianId: topCandidate?.guardianId ?? undefined,
      status: ReviewTaskStatus.OPEN,
      decisionType: null,
      rejectionReason: null,
      resolutionNotes: null,
      resolutionMetadata: Prisma.JsonNull,
      resolvedAt: null,
      priority: topCandidate && topCandidate.confidence >= env.MANUAL_REVIEW_THRESHOLD ? 1 : 2,
      reason:
        topCandidate && ranked.length > 1 && topCandidate.confidence >= env.MANUAL_REVIEW_THRESHOLD
          ? "Hay multiples candidatos y se requiere validacion humana"
          : topCandidate && topCandidate.confidence >= env.MANUAL_REVIEW_THRESHOLD
            ? "Coincidencia parcial requiere validacion humana"
            : "No se encontro una coincidencia confiable"
    }
  });

  await prisma.receipt.update({
    where: { id: receiptId },
    data: {
      status: ReceiptStatus.MANUAL_REVIEW,
      processedAt: new Date()
    }
  });

  if (receipt.payment) {
    await prisma.payment.update({
      where: { id: receipt.payment.id },
      data: {
        status: PaymentStatus.RECEIVED
      }
    });
  }

  if (receipt.reconciliations[0]) {
    await prisma.reconciliation.update({
      where: { id: receipt.reconciliations[0].id },
      data: {
        status: ReconciliationStatus.SUGGESTED,
        strategy:
          options?.source === "reprocess"
            ? "reprocessed_pending_review"
            : receipt.reconciliations[0].strategy,
        executedAt: null
      }
    });
  }

  if (options?.source === "reprocess") {
    await createAuditLog({
      schoolId: receipt.schoolId,
      actorUserId: options.actorUserId,
      action: "receipt.review.reprocessed",
      entityType: "Receipt",
      entityId: receiptId,
      metadata: {
        topCandidateChargeId: topCandidate?.chargeId ?? null,
        topCandidateConfidence: topCandidate?.confidence ?? null,
        candidatesFound: ranked.length
      }
    });
  }

  if (options?.source !== "reprocess") {
    await queueReceiptStatusReply({
      receipt,
      body:
        topCandidate && topCandidate.confidence >= env.MANUAL_REVIEW_THRESHOLD
          ? "Recibimos tu comprobante y detectamos un pago posible, pero necesita confirmacion. Ya quedo en revision y te avisaremos por este mismo chat cuando termine la validacion."
          : "Recibimos tu comprobante, pero con la informacion visible no pudimos identificar el pago automaticamente. Ya lo derivamos a revision manual y te avisaremos por este mismo chat cuando quede validado. No necesitas reenviarlo por ahora."
    });
  }

  return review;
}
