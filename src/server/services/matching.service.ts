import type { Guardian, Charge, Student } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { tokenOverlapScore, normalizeText } from "@/server/utils/strings";
import type { ExtractedPaymentData } from "@/server/services/extraction.service";

type ChargeCandidate = Charge & {
  student: Student;
  guardian: Guardian | null;
};

export type MatchCandidate = {
  chargeId: string;
  studentId: string;
  guardianId: string | null;
  studentName: string;
  guardianName: string | null;
  periodLabel: string | null;
  dueDate: Date;
  outstandingCents: number;
  confidence: number;
  rationale: string;
  signals: MatchSignals;
};

export type MatchSignals = {
  exactAmountMatch: boolean;
  closeAmountMatch: boolean;
  senderGuardianMatch: boolean;
  senderStudentMatch: boolean;
  textStudentMatch: boolean;
  dueDateClose: boolean;
  dueDateCompatible: boolean;
  periodDetected: boolean;
};

export function scoreCandidateAgainstReceipt(candidate: ChargeCandidate, extracted: ExtractedPaymentData) {
  let score = 0;
  const reasons: string[] = [];
  const signals: MatchSignals = {
    exactAmountMatch: false,
    closeAmountMatch: false,
    senderGuardianMatch: false,
    senderStudentMatch: false,
    textStudentMatch: false,
    dueDateClose: false,
    dueDateCompatible: false,
    periodDetected: false
  };

  if (extracted.amountCents && candidate.outstandingCents === extracted.amountCents) {
    score += 0.48;
    reasons.push("monto exacto");
    signals.exactAmountMatch = true;
  } else if (
    extracted.amountCents &&
    Math.abs(candidate.outstandingCents - extracted.amountCents) <= 500000
  ) {
    score += 0.22;
    reasons.push("monto cercano");
    signals.closeAmountMatch = true;
  }

  const senderVsGuardian = tokenOverlapScore(extracted.senderName, candidate.guardian?.fullName);
  const senderVsStudent = tokenOverlapScore(extracted.senderName, candidate.student.fullName);
  const textVsStudent = tokenOverlapScore(extracted.rawText, candidate.student.fullName);

  if (senderVsGuardian > 0) {
    score += Math.min(0.22, senderVsGuardian * 0.22);
    reasons.push("remitente similar a apoderado");
    signals.senderGuardianMatch = true;
  }

  if (Math.max(senderVsStudent, textVsStudent) > 0) {
    score += Math.min(0.2, Math.max(senderVsStudent, textVsStudent) * 0.2);
    reasons.push("alumno mencionado");
    if (senderVsStudent > 0) {
      signals.senderStudentMatch = true;
    }
    if (textVsStudent > 0) {
      signals.textStudentMatch = true;
    }
  }

  if (extracted.paidAt) {
    const dayDiff = Math.abs(candidate.dueDate.getTime() - extracted.paidAt.getTime()) / 86400000;
    if (dayDiff <= 5) {
      score += 0.12;
      reasons.push("fecha cercana al vencimiento");
      signals.dueDateClose = true;
    } else if (dayDiff <= 20) {
      score += 0.06;
      reasons.push("fecha compatible");
      signals.dueDateCompatible = true;
    }
  }

  if (normalizeText(extracted.rawText).includes(normalizeText(candidate.periodLabel))) {
    score += 0.08;
    reasons.push("periodo detectado");
    signals.periodDetected = true;
  }

  return {
    confidence: Math.min(score, 0.99),
    rationale: reasons.join(", ") || "sin senales fuertes",
    signals
  };
}

export async function rankReceiptCandidates(
  receiptId: string,
  options?: {
    forcedStudentId?: string;
    forcedChargeIds?: string[];
  }
) {
  const receipt = await prisma.receipt.findUnique({
    where: { id: receiptId }
  });

  if (!receipt) {
    throw new Error("Comprobante no encontrado");
  }

  const candidates = await prisma.charge.findMany({
    where: {
      schoolId: receipt.schoolId,
      status: {
        in: ["PENDING", "PARTIALLY_PAID", "OVERDUE"]
      },
      studentId: options?.forcedStudentId,
      id: options?.forcedChargeIds?.length
        ? {
            in: options.forcedChargeIds
          }
        : undefined
    },
    include: {
      student: true,
      guardian: true
    },
    take: 30,
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }]
  });

  const extracted: ExtractedPaymentData = {
    amountCents: receipt.extractedAmountCents,
    paidAt: receipt.extractedPaidAt,
    senderName: receipt.extractedSenderName,
    reference: receipt.extractedReference,
    bankName: receipt.extractedBankName,
    destinationAccountNumber: null,
    rawText: receipt.extractedText ?? "",
    confidence: receipt.extractionConfidence ?? 0
  };

  return candidates
    .map((candidate) => {
      const scored = scoreCandidateAgainstReceipt(candidate, extracted);
      return {
        chargeId: candidate.id,
        studentId: candidate.studentId,
        guardianId: candidate.guardianId,
        studentName: candidate.student.fullName,
        guardianName: candidate.guardian?.fullName ?? null,
        periodLabel: candidate.periodLabel ?? null,
        dueDate: candidate.dueDate,
        outstandingCents: candidate.outstandingCents,
        confidence: scored.confidence,
        rationale: scored.rationale,
        signals: scored.signals
      } satisfies MatchCandidate;
    })
    .filter((candidate) => candidate.confidence > 0.2)
    .sort((left, right) => right.confidence - left.confidence);
}
