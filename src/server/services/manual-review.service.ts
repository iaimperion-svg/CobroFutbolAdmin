import {
  ManualDecisionType,
  PaymentStatus,
  Prisma,
  ReconciliationStatus,
  ReceiptStatus,
  ReviewTaskStatus
} from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { AppError } from "@/server/http/errors";
import { createAuditLog, listReceiptAuditTrail } from "@/server/services/audit.service";
import {
  processReceiptReconciliation,
  reconcileReceiptWithCharge,
  restoreReconciliationAllocations
} from "@/server/services/reconciliation.service";

export const rejectionReasonCatalog = [
  "COMPROBANTE_ILEGIBLE",
  "MONTO_NO_COINCIDE",
  "REMITENTE_NO_IDENTIFICADO",
  "COMPROBANTE_DUPLICADO",
  "NO_CORRESPONDE_A_ESTA_ACADEMIA",
  "OTRO"
] as const;

export type RejectionReason = (typeof rejectionReasonCatalog)[number];

function ensureRejectionReason(reason: string): RejectionReason {
  if (rejectionReasonCatalog.includes(reason as RejectionReason)) {
    return reason as RejectionReason;
  }

  throw new AppError("Selecciona un motivo de rechazo valido");
}

async function getReceiptOrThrow(receiptId: string, schoolId: string) {
  const receipt = await prisma.receipt.findFirst({
    where: { id: receiptId, schoolId },
    include: {
      message: {
        include: {
          conversation: true
        }
      },
      guardian: true,
      student: true,
      payment: true,
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
        take: 5,
        include: {
          charge: {
            include: {
              student: true,
              guardian: true
            }
          },
          student: true,
          guardian: true
        }
      }
    }
  });

  if (!receipt) {
    throw new AppError("Comprobante no encontrado", 404);
  }

  return receipt;
}

async function getChargeOrThrow(chargeId: string, schoolId: string) {
  const charge = await prisma.charge.findFirst({
    where: {
      id: chargeId,
      schoolId
    },
    include: {
      student: true,
      guardian: true
    }
  });

  if (!charge) {
    throw new AppError("Cargo no encontrado", 404);
  }

  if (charge.outstandingCents <= 0) {
    throw new AppError("El cargo seleccionado ya se encuentra pagado");
  }

  return charge;
}

export async function listReviewTasks(schoolId: string) {
  return prisma.reviewTask.findMany({
    where: {
      schoolId,
      status: {
        in: [ReviewTaskStatus.OPEN, ReviewTaskStatus.IN_PROGRESS]
      }
    },
    include: {
      receipt: {
        include: {
          candidateMatches: {
            orderBy: { confidence: "desc" },
            take: 3,
            include: {
              student: true,
              guardian: true,
              charge: true
            }
          }
        }
      },
      suggestedStudent: true,
      suggestedGuardian: true,
      assignedUser: true,
      notes: {
        orderBy: { createdAt: "desc" },
        include: {
          authorUser: true
        }
      }
    },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }]
  });
}

export async function getReviewDetail(reviewId: string, schoolId: string) {
  return prisma.reviewTask.findFirst({
    where: { id: reviewId, schoolId },
    include: {
      receipt: {
        include: {
          candidateMatches: {
            include: {
              charge: true,
              student: true,
              guardian: true
            }
          }
        }
      },
      reconciliation: {
        include: {
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
      suggestedStudent: true,
      suggestedGuardian: true,
      notes: {
        orderBy: { createdAt: "desc" },
        include: {
          authorUser: true
        }
      }
    }
  });
}

export async function getReceiptReviewCase(receiptId: string, schoolId: string) {
  const receipt = await getReceiptOrThrow(receiptId, schoolId);
  const [notes, auditTrail] = await Promise.all([
    prisma.reviewNote.findMany({
      where: {
        schoolId,
        receiptId
      },
      include: {
        authorUser: true
      },
      orderBy: {
        createdAt: "desc"
      }
    }),
    listReceiptAuditTrail(schoolId, receiptId)
  ]);

  return {
    ...receipt,
    notes,
    auditTrail
  };
}

export async function resolveReviewTask(input: {
  reviewId: string;
  schoolId: string;
  chargeId: string;
  actorUserId?: string;
  resolutionNotes?: string;
}) {
  const review = await prisma.reviewTask.findFirst({
    where: {
      id: input.reviewId,
      schoolId: input.schoolId
    }
  });

  if (!review) {
    throw new AppError("Revision no encontrada", 404);
  }

  return approveSuggestedReconciliation({
    receiptId: review.receiptId,
    schoolId: input.schoolId,
    chargeId: input.chargeId,
    actorUserId: input.actorUserId,
    resolutionNotes: input.resolutionNotes
  });
}

export async function approveSuggestedReconciliation(input: {
  receiptId: string;
  schoolId: string;
  chargeId: string;
  actorUserId?: string;
  resolutionNotes?: string;
}) {
  await getChargeOrThrow(input.chargeId, input.schoolId);

  await reconcileReceiptWithCharge({
    receiptId: input.receiptId,
    chargeId: input.chargeId,
    mode: "manual",
    actorUserId: input.actorUserId,
    strategy: "manual_review_approval",
    reviewDecisionType: ManualDecisionType.APPROVED_SUGGESTION,
    resolutionNotes: input.resolutionNotes,
    notes: input.resolutionNotes ?? "La sugerencia fue aprobada por el equipo."
  });

  return getReceiptReviewCase(input.receiptId, input.schoolId);
}

export async function rejectSuggestedReconciliation(input: {
  receiptId: string;
  schoolId: string;
  actorUserId?: string;
  rejectionReason: string;
  resolutionNotes?: string;
}) {
  const receipt = await getReceiptOrThrow(input.receiptId, input.schoolId);
  const rejectionReason = ensureRejectionReason(input.rejectionReason);

  if (rejectionReason === "OTRO" && !(input.resolutionNotes ?? "").trim()) {
    throw new AppError("Agrega una observacion para el motivo Otro");
  }

  const reconciliation = receipt.reconciliations[0] ?? null;

  await prisma.$transaction(async (tx) => {
    await tx.receipt.update({
      where: { id: receipt.id },
      data: {
        status: ReceiptStatus.REJECTED,
        processedAt: new Date()
      }
    });

    if (receipt.payment) {
      await tx.payment.update({
        where: { id: receipt.payment.id },
        data: {
          status: PaymentStatus.REJECTED
        }
      });
    }

    if (reconciliation) {
      await restoreReconciliationAllocations(tx, reconciliation.id);

      await tx.reconciliation.update({
        where: { id: reconciliation.id },
        data: {
          status: ReconciliationStatus.REJECTED,
          executedAt: new Date(),
          notes: input.resolutionNotes ?? reconciliation.notes
        }
      });
    }

    await tx.reviewTask.upsert({
      where: { receiptId: receipt.id },
      create: {
        schoolId: receipt.schoolId,
        receiptId: receipt.id,
        reconciliationId: reconciliation?.id,
        status: ReviewTaskStatus.RESOLVED,
        priority: 2,
        reason: "Conciliacion rechazada por el equipo",
        decisionType: ManualDecisionType.REJECTED_SUGGESTION,
        rejectionReason,
        resolutionNotes: input.resolutionNotes,
        resolutionMetadata: {
          previousReceiptStatus: receipt.status,
          previousReconciliationStatus: reconciliation?.status ?? null
        } as Prisma.InputJsonValue,
        resolvedAt: new Date()
      },
      update: {
        reconciliationId: reconciliation?.id,
        status: ReviewTaskStatus.RESOLVED,
        reason: "Conciliacion rechazada por el equipo",
        decisionType: ManualDecisionType.REJECTED_SUGGESTION,
        rejectionReason,
        resolutionNotes: input.resolutionNotes,
        resolutionMetadata: {
          previousReceiptStatus: receipt.status,
          previousReconciliationStatus: reconciliation?.status ?? null
        } as Prisma.InputJsonValue,
        resolvedAt: new Date()
      }
    });

    await createAuditLog(
      {
        schoolId: receipt.schoolId,
        actorUserId: input.actorUserId,
        action: "receipt.review.rejected",
        entityType: "Receipt",
        entityId: receipt.id,
        metadata: {
          rejectionReason,
          resolutionNotes: input.resolutionNotes ?? null,
          previousReceiptStatus: receipt.status,
          newReceiptStatus: ReceiptStatus.REJECTED,
          previousReconciliationStatus: reconciliation?.status ?? null,
          newReconciliationStatus: ReconciliationStatus.REJECTED
        }
      },
      tx
    );
  });

  return getReceiptReviewCase(input.receiptId, input.schoolId);
}

export async function reassignSuggestedReconciliation(input: {
  receiptId: string;
  schoolId: string;
  chargeId: string;
  actorUserId?: string;
  studentId?: string;
  guardianId?: string;
  resolutionNotes?: string;
}) {
  const charge = await getChargeOrThrow(input.chargeId, input.schoolId);

  if (input.studentId && input.studentId !== charge.studentId) {
    throw new AppError("El cargo seleccionado no corresponde al alumno elegido");
  }

  if (input.guardianId && input.guardianId !== charge.guardianId) {
    throw new AppError("El cargo seleccionado no corresponde al apoderado elegido");
  }

  await reconcileReceiptWithCharge({
    receiptId: input.receiptId,
    chargeId: charge.id,
    mode: "manual",
    actorUserId: input.actorUserId,
    strategy: "manual_reassignment",
    reviewDecisionType: ManualDecisionType.REASSIGNED,
    resolutionNotes: input.resolutionNotes,
    notes:
      input.resolutionNotes ??
      `Reasignado manualmente a ${charge.student.fullName}${charge.guardian ? ` / ${charge.guardian.fullName}` : ""}.`,
    resolutionMetadata: {
      targetStudentId: charge.studentId,
      targetGuardianId: charge.guardianId ?? null,
      chargeId: charge.id
    }
  });

  return getReceiptReviewCase(input.receiptId, input.schoolId);
}

export async function confirmManualPayment(input: {
  receiptId: string;
  schoolId: string;
  chargeId: string;
  actorUserId?: string;
  resolutionNotes?: string;
}) {
  const charge = await getChargeOrThrow(input.chargeId, input.schoolId);

  await reconcileReceiptWithCharge({
    receiptId: input.receiptId,
    chargeId: charge.id,
    mode: "manual",
    actorUserId: input.actorUserId,
    strategy: "manual_payment_confirmation",
    reviewDecisionType: ManualDecisionType.MANUAL_PAYMENT,
    resolutionNotes: input.resolutionNotes,
    notes:
      input.resolutionNotes ??
      `Pago manual confirmado por el equipo para ${charge.student.fullName}.`,
    resolutionMetadata: {
      chargeId: charge.id,
      targetStudentId: charge.studentId,
      targetGuardianId: charge.guardianId ?? null
    }
  });

  return getReceiptReviewCase(input.receiptId, input.schoolId);
}

export async function reprocessReceipt(input: {
  receiptId: string;
  schoolId: string;
  actorUserId?: string;
  resolutionNotes?: string;
}) {
  const receipt = await getReceiptOrThrow(input.receiptId, input.schoolId);
  const currentReconciliation = receipt.reconciliations[0] ?? null;

  await prisma.$transaction(async (tx) => {
    await tx.receipt.update({
      where: { id: receipt.id },
      data: {
        status: ReceiptStatus.PROCESSING,
        processedAt: null
      }
    });

    if (receipt.payment) {
      await tx.payment.update({
        where: { id: receipt.payment.id },
        data: {
          status: PaymentStatus.RECEIVED
        }
      });
    }

    if (currentReconciliation) {
      await restoreReconciliationAllocations(tx, currentReconciliation.id);

      await tx.reconciliation.update({
        where: { id: currentReconciliation.id },
        data: {
          status: ReconciliationStatus.SUGGESTED,
          executedAt: null,
          strategy: "reprocessed_receipt",
          notes: input.resolutionNotes ?? "El comprobante fue enviado nuevamente a procesamiento."
        }
      });
    }

    await tx.reviewTask.upsert({
      where: { receiptId: receipt.id },
      create: {
        schoolId: receipt.schoolId,
        receiptId: receipt.id,
        reconciliationId: currentReconciliation?.id,
        status: ReviewTaskStatus.IN_PROGRESS,
        priority: 2,
        reason: "Comprobante reprocesado por el equipo"
      },
      update: {
        reconciliationId: currentReconciliation?.id,
        status: ReviewTaskStatus.IN_PROGRESS,
        reason: "Comprobante reprocesado por el equipo",
        decisionType: null,
        rejectionReason: null,
        resolutionNotes: null,
        resolutionMetadata: Prisma.JsonNull,
        resolvedAt: null
      }
    });

    await createAuditLog(
      {
        schoolId: receipt.schoolId,
        actorUserId: input.actorUserId,
        action: "receipt.review.reprocess_requested",
        entityType: "Receipt",
        entityId: receipt.id,
        metadata: {
          previousReceiptStatus: receipt.status,
          note: input.resolutionNotes ?? null
        }
      },
      tx
    );
  });

  await processReceiptReconciliation(input.receiptId, {
    source: "reprocess",
    actorUserId: input.actorUserId
  });

  return getReceiptReviewCase(input.receiptId, input.schoolId);
}

export async function addReceiptInternalNote(input: {
  receiptId: string;
  schoolId: string;
  actorUserId?: string;
  body: string;
}) {
  const trimmedBody = input.body.trim();

  if (trimmedBody.length < 3) {
    throw new AppError("Escribe una observacion mas descriptiva");
  }

  const receipt = await getReceiptOrThrow(input.receiptId, input.schoolId);

  const note = await prisma.reviewNote.create({
    data: {
      schoolId: input.schoolId,
      receiptId: input.receiptId,
      reviewTaskId: receipt.reviewTask?.id,
      authorUserId: input.actorUserId,
      body: trimmedBody
    },
    include: {
      authorUser: true
    }
  });

  await createAuditLog({
    schoolId: input.schoolId,
    actorUserId: input.actorUserId,
    action: "receipt.review.note_added",
    entityType: "Receipt",
    entityId: input.receiptId,
    metadata: {
      noteId: note.id,
      preview: trimmedBody.slice(0, 120)
    }
  });

  return note;
}
