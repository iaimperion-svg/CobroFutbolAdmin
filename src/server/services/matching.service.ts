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
  confidence: number;
  rationale: string;
};

export function scoreCandidateAgainstReceipt(candidate: ChargeCandidate, extracted: ExtractedPaymentData) {
  let score = 0;
  const reasons: string[] = [];

  if (extracted.amountCents && candidate.outstandingCents === extracted.amountCents) {
    score += 0.48;
    reasons.push("monto exacto");
  } else if (
    extracted.amountCents &&
    Math.abs(candidate.outstandingCents - extracted.amountCents) <= 500000
  ) {
    score += 0.22;
    reasons.push("monto cercano");
  }

  const senderVsGuardian = tokenOverlapScore(extracted.senderName, candidate.guardian?.fullName);
  const senderVsStudent = tokenOverlapScore(extracted.senderName, candidate.student.fullName);
  const textVsStudent = tokenOverlapScore(extracted.rawText, candidate.student.fullName);

  if (senderVsGuardian > 0) {
    score += Math.min(0.22, senderVsGuardian * 0.22);
    reasons.push("remitente similar a apoderado");
  }

  if (Math.max(senderVsStudent, textVsStudent) > 0) {
    score += Math.min(0.2, Math.max(senderVsStudent, textVsStudent) * 0.2);
    reasons.push("alumno mencionado");
  }

  if (extracted.paidAt) {
    const dayDiff = Math.abs(candidate.dueDate.getTime() - extracted.paidAt.getTime()) / 86400000;
    if (dayDiff <= 5) {
      score += 0.12;
      reasons.push("fecha cercana al vencimiento");
    } else if (dayDiff <= 20) {
      score += 0.06;
      reasons.push("fecha compatible");
    }
  }

  if (normalizeText(extracted.rawText).includes(normalizeText(candidate.periodLabel))) {
    score += 0.08;
    reasons.push("periodo detectado");
  }

  return {
    confidence: Math.min(score, 0.99),
    rationale: reasons.join(", ") || "sin senales fuertes"
  };
}

export async function rankReceiptCandidates(receiptId: string) {
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
      }
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
        confidence: scored.confidence,
        rationale: scored.rationale
      } satisfies MatchCandidate;
    })
    .filter((candidate) => candidate.confidence > 0.2)
    .sort((left, right) => right.confidence - left.confidence);
}
