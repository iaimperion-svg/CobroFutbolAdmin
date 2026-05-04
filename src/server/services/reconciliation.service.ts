import {
  ChargeStatus,
  ManualDecisionType,
  MessageChannel,
  PaymentStatus,
  Prisma,
  ReconciliationStatus,
  ReceiptResolutionPromptStatus,
  ReceiptResolutionPromptType,
  ReceiptStatus,
  ReviewTaskStatus
} from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { env } from "@/server/config/env";
import { AppError } from "@/server/http/errors";
import { rankReceiptCandidates, type MatchCandidate } from "@/server/services/matching.service";
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
const payerReplyPromptTtlMs = 12 * 60 * 60 * 1000;

function hasIdentitySignals(candidate: MatchCandidate | undefined) {
  if (!candidate) {
    return false;
  }

  return (
    candidate.signals.senderGuardianMatch ||
    candidate.signals.senderStudentMatch ||
    candidate.signals.textStudentMatch ||
    candidate.signals.periodDetected
  );
}

function decideAutomaticReconciliation(
  topCandidate: MatchCandidate | undefined,
  secondCandidate: MatchCandidate | undefined
) {
  if (!topCandidate || topCandidate.confidence < env.AUTO_RECONCILIATION_THRESHOLD) {
    return {
      shouldAutoReconcile: false,
      reason: "top_candidate_below_threshold"
    } as const;
  }

  const confidenceGap = topCandidate.confidence - (secondCandidate?.confidence ?? 0);
  const topHasIdentitySignals = hasIdentitySignals(topCandidate);
  const secondIsCompetitive =
    secondCandidate != null &&
    secondCandidate.confidence >= env.MANUAL_REVIEW_THRESHOLD &&
    confidenceGap < 0.08;

  if (!topHasIdentitySignals && !topCandidate.signals.exactAmountMatch) {
    return {
      shouldAutoReconcile: false,
      reason: "weak_top_candidate_signals"
    } as const;
  }

  if (secondIsCompetitive) {
    return {
      shouldAutoReconcile: false,
      reason: "ambiguous_top_candidates"
    } as const;
  }

  if (!topHasIdentitySignals && confidenceGap < 0.14) {
    return {
      shouldAutoReconcile: false,
      reason: "amount_only_match_needs_review"
    } as const;
  }

  return {
    shouldAutoReconcile: true,
    reason: "clear_high_confidence_match"
  } as const;
}

function buildReviewReason(topCandidate: MatchCandidate | undefined, ranked: MatchCandidate[], blockedAutoReason?: string) {
  if (blockedAutoReason === "ambiguous_top_candidates") {
    return "La coincidencia mas fuerte compite con otro cargo similar y requiere validacion humana";
  }

  if (blockedAutoReason === "amount_only_match_needs_review") {
    return "El monto coincide, pero faltan senales de identidad suficientes para conciliar automaticamente";
  }

  if (blockedAutoReason === "weak_top_candidate_signals") {
    return "No hay senales suficientes para identificar con seguridad al alumno o apoderado";
  }

  if (topCandidate && ranked.length > 1 && topCandidate.confidence >= env.MANUAL_REVIEW_THRESHOLD) {
    return "Hay multiples candidatos y se requiere validacion humana";
  }

  if (topCandidate && topCandidate.confidence >= env.MANUAL_REVIEW_THRESHOLD) {
    return "Coincidencia parcial requiere validacion humana";
  }

  return "No se encontro una coincidencia confiable";
}

function formatChargePeriodLabel(candidate: MatchCandidate) {
  if (candidate.periodLabel?.trim()) {
    return candidate.periodLabel.trim();
  }

  return new Intl.DateTimeFormat("es-CL", {
    month: "long",
    year: "numeric",
    timeZone: "America/Santiago"
  }).format(candidate.dueDate);
}

function groupCandidatesByStudent(candidates: MatchCandidate[]) {
  const map = new Map<string, MatchCandidate[]>();

  for (const candidate of candidates) {
    const current = map.get(candidate.studentId) ?? [];
    current.push(candidate);
    map.set(candidate.studentId, current);
  }

  return map;
}

function pickOldestCandidate(candidates: MatchCandidate[]) {
  return [...candidates].sort((left, right) => left.dueDate.getTime() - right.dueDate.getTime())[0];
}

function buildHouseholdChargePlan(ranked: MatchCandidate[], receiptAmountCents?: number | null) {
  if (!receiptAmountCents || ranked.length < 2) {
    return null;
  }

  const guardianGroups = new Map<string, MatchCandidate[]>();

  for (const candidate of ranked) {
    if (!candidate.guardianId) {
      continue;
    }

    const current = guardianGroups.get(candidate.guardianId) ?? [];
    current.push(candidate);
    guardianGroups.set(candidate.guardianId, current);
  }

  const plans = [...guardianGroups.entries()]
    .flatMap(([guardianId, candidates]) => {
      const mentionedStudentIds = new Set(
        candidates
          .filter((candidate) => candidate.signals.senderStudentMatch || candidate.signals.textStudentMatch)
          .map((candidate) => candidate.studentId)
      );

      const scopedCandidates = candidates.filter((candidate) => {
        if (mentionedStudentIds.size > 0) {
          return mentionedStudentIds.has(candidate.studentId);
        }

        return (
          candidate.signals.senderGuardianMatch ||
          candidate.signals.senderStudentMatch ||
          candidate.signals.textStudentMatch ||
          candidate.signals.periodDetected
        );
      });

      const uniqueByCharge = [...new Map(scopedCandidates.map((candidate) => [candidate.chargeId, candidate])).values()];
      const uniqueStudents = [...new Set(uniqueByCharge.map((candidate) => candidate.studentId))];

      if (uniqueByCharge.length < 2 || uniqueStudents.length < 2) {
        return [];
      }

      const orderedCandidates = [...uniqueByCharge].sort((left, right) => {
        const dueDateDiff = left.dueDate.getTime() - right.dueDate.getTime();
        if (dueDateDiff !== 0) {
          return dueDateDiff;
        }

        if (left.studentId !== right.studentId) {
          return left.studentName.localeCompare(right.studentName, "es");
        }

        return right.confidence - left.confidence;
      });

      let runningAmount = 0;
      const chargeOptions: MatchCandidate[] = [];

      for (const candidate of orderedCandidates) {
        if (runningAmount >= receiptAmountCents) {
          break;
        }

        chargeOptions.push(candidate);
        runningAmount += candidate.outstandingCents;
      }

      if (runningAmount !== receiptAmountCents || chargeOptions.length < 2) {
        return [];
      }

      const score =
        chargeOptions.reduce((sum, candidate) => sum + candidate.confidence, 0) +
        uniqueStudents.length * 0.15 +
        (mentionedStudentIds.size > 0 ? 0.2 : 0) +
        (chargeOptions.some((candidate) => candidate.signals.senderGuardianMatch) ? 0.1 : 0);

      return [{
        guardianId,
        chargeOptions,
        score
      }];
    })
    .sort((left, right) => right.score - left.score);

  const bestPlan = plans[0];
  const secondPlan = plans[1];

  if (!bestPlan) {
    return null;
  }

  if (secondPlan && bestPlan.score - secondPlan.score < 0.12) {
    return null;
  }

  return bestPlan;
}

function determinePayerResolutionAction(ranked: MatchCandidate[]) {
  const relevant = ranked.filter((candidate) => candidate.confidence >= env.MANUAL_REVIEW_THRESHOLD);
  const uniqueStudents = [...new Set(relevant.map((candidate) => candidate.studentId))];
  const oldestRelevantCandidate = relevant.length > 0 ? pickOldestCandidate(relevant) : null;

  if (uniqueStudents.length >= 2) {
    return {
      type: "ask_student",
      studentOptions: uniqueStudents
        .map((studentId) => relevant.find((candidate) => candidate.studentId === studentId))
        .filter((candidate): candidate is MatchCandidate => Boolean(candidate))
        .slice(0, 3)
    } as const;
  }

  if (uniqueStudents.length === 1) {
    const studentCandidates = relevant.filter((candidate) => candidate.studentId === uniqueStudents[0]);
    const oldestStudentCandidate = studentCandidates.length > 0 ? pickOldestCandidate(studentCandidates) : null;

    if (oldestStudentCandidate && studentCandidates.length === 1) {
      return {
        type: "candidate_available",
        targetCandidate: oldestStudentCandidate
      } as const;
    }

    if (oldestStudentCandidate && studentCandidates.length >= 2) {
      return {
        type: "student_candidates_found",
        targetCandidate: oldestStudentCandidate,
        studentCandidates
      } as const;
    }
  }

  return {
    type: "manual_review",
    targetCandidate: oldestRelevantCandidate
  } as const;
}

function determinePayerResolutionActionWithAmount(ranked: MatchCandidate[], receiptAmountCents?: number | null) {
  const householdPlan = buildHouseholdChargePlan(ranked, receiptAmountCents);
  if (householdPlan) {
    return {
      type: "ask_overpayment",
      targetCandidate: householdPlan.chargeOptions[0],
      chargeOptions: householdPlan.chargeOptions
    } as const;
  }

  const baseAction = determinePayerResolutionAction(ranked);

  if (
    receiptAmountCents != null &&
    "targetCandidate" in baseAction &&
    baseAction.targetCandidate &&
    receiptAmountCents < baseAction.targetCandidate.outstandingCents
  ) {
    return {
      type: "ask_partial_payment",
      targetCandidate: baseAction.targetCandidate
    } as const;
  }

  if (baseAction.type === "student_candidates_found") {
    if (receiptAmountCents != null && receiptAmountCents > baseAction.targetCandidate.outstandingCents) {
      const orderedCandidates = [...baseAction.studentCandidates].sort(
        (left, right) => left.dueDate.getTime() - right.dueDate.getTime()
      );
      const totalOutstanding = orderedCandidates.reduce(
        (sum, candidate) => sum + candidate.outstandingCents,
        0
      );

      if (orderedCandidates.length >= 2 && totalOutstanding >= receiptAmountCents) {
        return {
          type: "ask_overpayment",
          targetCandidate: baseAction.targetCandidate,
          chargeOptions: orderedCandidates
        } as const;
      }
    }

    const overdueCandidates = baseAction.studentCandidates.filter((candidate) => candidate.dueDate.getTime() < Date.now());

    if (overdueCandidates.length > 0) {
      return {
        type: "auto_oldest_debt",
        targetCandidate: pickOldestCandidate(overdueCandidates)
      } as const;
    }

    if (baseAction.studentCandidates.length >= 2) {
      return {
        type: "ask_period",
        targetStudentId: baseAction.targetCandidate.studentId,
        periodOptions: [...baseAction.studentCandidates]
          .sort((left, right) => left.dueDate.getTime() - right.dueDate.getTime())
          .slice(0, 3)
      } as const;
    }
  }

  return baseAction;
}

function buildMatchCandidateFromCharge(charge: {
  id: string;
  studentId: string;
  guardianId: string | null;
  periodLabel: string | null;
  dueDate: Date;
  outstandingCents: number;
  student: { fullName: string };
  guardian: { fullName: string } | null;
}) {
  return {
    chargeId: charge.id,
    studentId: charge.studentId,
    guardianId: charge.guardianId,
    studentName: charge.student.fullName,
    guardianName: charge.guardian?.fullName ?? null,
    periodLabel: charge.periodLabel,
    dueDate: charge.dueDate,
    outstandingCents: charge.outstandingCents,
    confidence: 0.64,
    rationale: "monto familiar exacto, pagador confirmado por respuesta",
    signals: {
      exactAmountMatch: false,
      closeAmountMatch: false,
      senderGuardianMatch: false,
      senderStudentMatch: false,
      textStudentMatch: false,
      dueDateClose: false,
      dueDateCompatible: true,
      periodDetected: false
    }
  } satisfies MatchCandidate;
}

async function findUnknownPayerExactPlans(input: {
  schoolId: string;
  receiptAmountCents: number;
}) {
  const charges = await prisma.charge.findMany({
    where: {
      schoolId: input.schoolId,
      status: {
        in: [ChargeStatus.PENDING, ChargeStatus.PARTIALLY_PAID, ChargeStatus.OVERDUE]
      },
      outstandingCents: {
        gt: 0
      }
    },
    include: {
      student: true,
      guardian: true
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    take: 80
  });

  type OpenCharge = (typeof charges)[number];
  const groups = new Map<string, OpenCharge[]>();

  for (const charge of charges) {
    const key = charge.guardianId ? `guardian:${charge.guardianId}` : `student:${charge.studentId}`;
    const current = groups.get(key) ?? [];
    current.push(charge);
    groups.set(key, current);
  }

  return [...groups.entries()].flatMap(([key, groupCharges]) => {
    let runningAmount = 0;
    const selectedCharges: OpenCharge[] = [];

    for (const charge of groupCharges) {
      if (runningAmount >= input.receiptAmountCents) {
        break;
      }

      selectedCharges.push(charge);
      runningAmount += charge.outstandingCents;
    }

    if (runningAmount !== input.receiptAmountCents || selectedCharges.length === 0) {
      return [];
    }

    const firstCharge = selectedCharges[0];
    if (!firstCharge) {
      return [];
    }

    const uniqueStudents = [...new Set(selectedCharges.map((charge) => charge.studentId))];
    const label = firstCharge.guardian?.fullName ?? firstCharge.student.fullName;
    const helperText =
      uniqueStudents.length >= 2
        ? `${selectedCharges.length} mensualidades de ${uniqueStudents.length} alumnos`
        : `${selectedCharges.length} mensualidades de ${firstCharge.student.fullName}`;

    return [{
      key,
      label,
      helperText,
      chargeOptions: selectedCharges.map(buildMatchCandidateFromCharge)
    }];
  });
}

async function cancelOpenPayerPrompts(receiptId: string) {
  await prisma.receiptResolutionPrompt.updateMany({
    where: {
      receiptId,
      status: ReceiptResolutionPromptStatus.OPEN
    },
    data: {
      status: ReceiptResolutionPromptStatus.CANCELLED
    }
  });
}

async function createPayerSelectionPrompt(input: {
  receipt: {
    id: string;
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
  receiptAmountCents: number;
}) {
  if (!input.receipt.message?.senderHandle) {
    return null;
  }

  const plans = await findUnknownPayerExactPlans({
    schoolId: input.receipt.schoolId,
    receiptAmountCents: input.receiptAmountCents
  });

  if (plans.length === 0) {
    return null;
  }

  await cancelOpenPayerPrompts(input.receipt.id);

  const numberedOptions = plans.slice(0, 5).map((plan, index) => ({
    key: plan.key,
    number: index + 1,
    label: plan.label,
    helperText: plan.helperText
  }));
  const receiptAmountLabel = Math.round(input.receiptAmountCents / 100).toLocaleString("es-CL");
  const questionText = [
    `Recibimos tu comprobante por ${receiptAmountLabel}, pero no pudimos identificar al pagador con seguridad.`,
    "Responde con el numero o nombre correcto para aplicarlo a las mensualidades pendientes:",
    ...numberedOptions.map((option) => `${option.number}. ${option.label} (${option.helperText})`),
    "Si ninguna opcion corresponde, responde 0 para revision manual."
  ].join("\n");

  const prompt = await prisma.receiptResolutionPrompt.create({
    data: {
      schoolId: input.receipt.schoolId,
      receiptId: input.receipt.id,
      type: ReceiptResolutionPromptType.SELECT_PAYER,
      questionText,
      options: [
        ...numberedOptions,
        {
          key: "manual_review",
          number: 0,
          label: "Revision manual"
        }
      ],
      context: {
        payerOptions: plans.slice(0, 5).map((plan) => ({
          key: plan.key,
          chargeIds: plan.chargeOptions.map((candidate) => candidate.chargeId)
        })),
        receiptAmountCents: input.receiptAmountCents
      } as Prisma.InputJsonValue,
      expiresAt: new Date(Date.now() + payerReplyPromptTtlMs)
    }
  });

  await prisma.receipt.update({
    where: { id: input.receipt.id },
    data: {
      status: ReceiptStatus.AWAITING_PAYER_REPLY,
      processedAt: new Date()
    }
  });

  await queueReceiptStatusReply({
    receipt: input.receipt,
    body: questionText
  });

  return prompt;
}

async function createStudentSelectionPrompt(input: {
  receipt: {
    id: string;
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
  options: MatchCandidate[];
}) {
  if (!input.receipt.message?.senderHandle || input.options.length < 2) {
    return null;
  }

  await cancelOpenPayerPrompts(input.receipt.id);

  const numberedOptions = input.options.map((candidate, index) => ({
    key: candidate.studentId,
    number: index + 1,
    label: candidate.studentName,
    helperText: candidate.guardianName
      ? `Apoderado ${candidate.guardianName}`
      : `Periodo ${formatChargePeriodLabel(candidate)}`
  }));

  const questionText = [
    "Recibimos tu comprobante, pero aparece asociado a mas de un alumno posible.",
    "Responde con el numero del alumno correcto:",
    ...numberedOptions.map((option) => `${option.number}. ${option.label}${option.helperText ? ` (${option.helperText})` : ""}`)
  ].join("\n");

  const prompt = await prisma.receiptResolutionPrompt.create({
    data: {
      schoolId: input.receipt.schoolId,
      receiptId: input.receipt.id,
      type: ReceiptResolutionPromptType.SELECT_STUDENT,
      questionText,
      options: numberedOptions,
      context: {
        studentIds: input.options.map((option) => option.studentId)
      } as Prisma.InputJsonValue,
      expiresAt: new Date(Date.now() + payerReplyPromptTtlMs)
    }
  });

  await prisma.receipt.update({
    where: { id: input.receipt.id },
    data: {
      status: ReceiptStatus.AWAITING_PAYER_REPLY,
      processedAt: new Date()
    }
  });

  await queueReceiptStatusReply({
    receipt: input.receipt,
    body: questionText
  });

  return prompt;
}

async function createPeriodSelectionPrompt(input: {
  receipt: {
    id: string;
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
  options: MatchCandidate[];
}) {
  if (!input.receipt.message?.senderHandle || input.options.length < 2) {
    return null;
  }

  await cancelOpenPayerPrompts(input.receipt.id);

  const numberedOptions = input.options.map((candidate, index) => ({
    key: candidate.chargeId,
    number: index + 1,
    label: formatChargePeriodLabel(candidate),
    helperText: `Monto pendiente ${Math.round(candidate.outstandingCents / 100).toLocaleString("es-CL")}`
  }));

  const questionText = [
    "Recibimos tu comprobante, pero para este alumno hay mas de una mensualidad posible.",
    "Responde con el numero del periodo correcto:",
    ...numberedOptions.map((option) => `${option.number}. ${option.label} (${option.helperText})`)
  ].join("\n");

  const prompt = await prisma.receiptResolutionPrompt.create({
    data: {
      schoolId: input.receipt.schoolId,
      receiptId: input.receipt.id,
      type: ReceiptResolutionPromptType.SELECT_PERIOD,
      questionText,
      options: numberedOptions,
      context: {
        chargeIds: input.options.map((option) => option.chargeId),
        studentId: input.options[0]?.studentId ?? null
      } as Prisma.InputJsonValue,
      expiresAt: new Date(Date.now() + payerReplyPromptTtlMs)
    }
  });

  await prisma.receipt.update({
    where: { id: input.receipt.id },
    data: {
      status: ReceiptStatus.AWAITING_PAYER_REPLY,
      processedAt: new Date()
    }
  });

  await queueReceiptStatusReply({
    receipt: input.receipt,
    body: questionText
  });

  return prompt;
}

async function createPartialPaymentPrompt(input: {
  receipt: {
    id: string;
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
  candidate: MatchCandidate;
  receiptAmountCents: number;
}) {
  if (!input.receipt.message?.senderHandle) {
    return null;
  }

  await cancelOpenPayerPrompts(input.receipt.id);

  const receiptAmountLabel = Math.round(input.receiptAmountCents / 100).toLocaleString("es-CL");
  const outstandingLabel = Math.round(input.candidate.outstandingCents / 100).toLocaleString("es-CL");
  const periodLabel = formatChargePeriodLabel(input.candidate);

  const questionText = [
    `Recibimos tu comprobante por ${receiptAmountLabel}, pero la mensualidad de ${periodLabel} tiene un saldo de ${outstandingLabel}.`,
    "Parece un abono parcial.",
    "Responde con una opcion:",
    `1. Si, dejalo como abono a ${periodLabel}`,
    "2. No, prefiero revision manual"
  ].join("\n");

  const prompt = await prisma.receiptResolutionPrompt.create({
    data: {
      schoolId: input.receipt.schoolId,
      receiptId: input.receipt.id,
      type: ReceiptResolutionPromptType.CONFIRM_PARTIAL_PAYMENT,
      questionText,
      options: [
        {
          key: `confirm_partial:${input.candidate.chargeId}`,
          number: 1,
          label: `Abono a ${periodLabel}`
        },
        {
          key: "manual_review",
          number: 2,
          label: "Revision manual"
        }
      ],
      context: {
        chargeId: input.candidate.chargeId,
        studentId: input.candidate.studentId,
        expectedOutstandingCents: input.candidate.outstandingCents,
        receiptAmountCents: input.receiptAmountCents
      } as Prisma.InputJsonValue,
      expiresAt: new Date(Date.now() + payerReplyPromptTtlMs)
    }
  });

  await prisma.receipt.update({
    where: { id: input.receipt.id },
    data: {
      status: ReceiptStatus.AWAITING_PAYER_REPLY,
      processedAt: new Date()
    }
  });

  await queueReceiptStatusReply({
    receipt: input.receipt,
    body: questionText
  });

  return prompt;
}

async function createOverpaymentPrompt(input: {
  receipt: {
    id: string;
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
  candidates: MatchCandidate[];
  receiptAmountCents: number;
}) {
  if (!input.receipt.message?.senderHandle || input.candidates.length < 2) {
    return null;
  }

  await cancelOpenPayerPrompts(input.receipt.id);

  const orderedCandidates = [...input.candidates].sort(
    (left, right) => left.dueDate.getTime() - right.dueDate.getTime()
  );
  const receiptAmountLabel = Math.round(input.receiptAmountCents / 100).toLocaleString("es-CL");
  const uniqueStudents = [...new Set(orderedCandidates.map((candidate) => candidate.studentId))];
  const candidateSummary = orderedCandidates
    .map(
      (candidate, index) =>
        `${index + 1}. ${candidate.studentName} / ${formatChargePeriodLabel(candidate)} (${Math.round(candidate.outstandingCents / 100).toLocaleString("es-CL")})`
    )
    .join("\n");

  const questionText =
    uniqueStudents.length >= 2
      ? [
          `Recibimos tu comprobante por ${receiptAmountLabel} y parece cubrir varias mensualidades del mismo grupo familiar.`,
          "Podemos aplicarlo automaticamente a las mensualidades mas antiguas en este orden:",
          candidateSummary,
          "Responde con una opcion:",
          "1. Si, aplicalo a esas mensualidades",
          "2. No, prefiero revision manual"
        ].join("\n")
      : [
          `Recibimos tu comprobante por ${receiptAmountLabel} y parece cubrir mas de una mensualidad del mismo alumno.`,
          "Podemos aplicarlo automaticamente a las mensualidades mas antiguas en este orden:",
          candidateSummary,
          "Responde con una opcion:",
          "1. Si, aplicalo a las mensualidades mas antiguas",
          "2. No, prefiero revision manual"
        ].join("\n");

  const prompt = await prisma.receiptResolutionPrompt.create({
    data: {
      schoolId: input.receipt.schoolId,
      receiptId: input.receipt.id,
      type: "CONFIRM_OVERPAYMENT",
      questionText,
      options: [
        {
          key: "apply_oldest_debts",
          number: 1,
          label: "Aplicar a mensualidades mas antiguas"
        },
        {
          key: "manual_review",
          number: 2,
          label: "Revision manual"
        }
      ],
      context: {
        chargeIds: orderedCandidates.map((candidate) => candidate.chargeId),
        studentId: orderedCandidates[0]?.studentId ?? null,
        receiptAmountCents: input.receiptAmountCents
      } as Prisma.InputJsonValue,
      expiresAt: new Date(Date.now() + payerReplyPromptTtlMs)
    }
  });

  await prisma.receipt.update({
    where: { id: input.receipt.id },
    data: {
      status: ReceiptStatus.AWAITING_PAYER_REPLY,
      processedAt: new Date()
    }
  });

  await queueReceiptStatusReply({
    receipt: input.receipt,
    body: questionText
  });

  return prompt;
}

async function resetPendingResolutionState(input: {
  receiptId: string;
  paymentId?: string | null;
  reconciliationId?: string | null;
  reconciliationStrategy?: string | null;
}) {
  if (input.paymentId) {
    await prisma.payment.update({
      where: { id: input.paymentId },
      data: {
        status: PaymentStatus.RECEIVED
      }
    });
  }

  if (input.reconciliationId) {
    await prisma.reconciliation.update({
      where: { id: input.reconciliationId },
      data: {
        status: ReconciliationStatus.SUGGESTED,
        executedAt: null,
        strategy: input.reconciliationStrategy ?? "payer_reply_pending"
      }
    });
  }
}

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

function buildAutomaticReconciliationReply(input: {
  allocations: { chargeId: string; amountCents: number }[];
  charges: Array<{
    id: string;
    studentId: string;
    student: { fullName: string };
  }>;
}) {
  const appliedCharges = input.allocations
    .map((allocation) => input.charges.find((charge) => charge.id === allocation.chargeId))
    .filter((charge): charge is NonNullable<typeof charge> => Boolean(charge));
  const uniqueStudents = [...new Map(appliedCharges.map((charge) => [charge.studentId, charge.student.fullName])).values()];
  const chargeCount = input.allocations.length;

  if (uniqueStudents.length >= 2) {
    return `Recibimos tu comprobante y validamos el pago automaticamente. Lo aplicamos a ${chargeCount} mensualidades de ${uniqueStudents.length} alumnos del mismo grupo familiar.`;
  }

  if (uniqueStudents.length === 1 && chargeCount >= 2) {
    return `Recibimos tu comprobante y validamos el pago automaticamente. Lo aplicamos a ${chargeCount} mensualidades de ${uniqueStudents[0]}.`;
  }

  return "Recibimos tu comprobante y validamos el pago automaticamente.";
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

  const reconciliation = await prisma.$transaction(async (tx) => {
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

  await prisma.receiptResolutionPrompt.updateMany({
    where: {
      receiptId: receipt.id,
      status: ReceiptResolutionPromptStatus.OPEN
    },
    data: {
      status: ReceiptResolutionPromptStatus.CANCELLED
    }
  });

  return reconciliation;
}

export async function reconcileReceiptWithCharges(input: {
  receiptId: string;
  chargeIds: string[];
  mode: "automatic" | "manual";
  actorUserId?: string;
  matchScore?: number;
  strategy?: string;
  notes?: string;
  reviewDecisionType?: ManualDecisionType;
  resolutionNotes?: string;
  resolutionMetadata?: Record<string, unknown>;
}) {
  const uniqueChargeIds = [...new Set(input.chargeIds)];
  if (uniqueChargeIds.length === 0) {
    throw new AppError("Debes seleccionar al menos un cargo");
  }

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

  const targetCharges = await prisma.charge.findMany({
    where: {
      id: {
        in: uniqueChargeIds
      }
    },
    include: {
      student: true,
      guardian: true
    }
  });

  if (targetCharges.length !== uniqueChargeIds.length) {
    throw new AppError("No encontramos todos los cargos seleccionados");
  }

  const orderedCharges = uniqueChargeIds
    .map((chargeId) => targetCharges.find((candidate) => candidate.id === chargeId))
    .filter((charge): charge is NonNullable<typeof charge> => Boolean(charge));

  const firstCharge = orderedCharges[0];
  if (!firstCharge) {
    throw new AppError("No encontramos cargos disponibles para conciliar");
  }

  if (orderedCharges.some((charge) => charge.schoolId !== receipt.schoolId)) {
    throw new AppError("Hay cargos que no pertenecen a esta academia");
  }

  const spansMultipleStudents = orderedCharges.some((charge) => charge.studentId !== firstCharge.studentId);
  const commonGuardianId =
    firstCharge.guardianId &&
    orderedCharges.every((charge) => charge.guardianId === firstCharge.guardianId)
      ? firstCharge.guardianId
      : null;

  if (spansMultipleStudents && !commonGuardianId) {
    throw new AppError("Los cargos seleccionados deben pertenecer al mismo alumno o al mismo apoderado");
  }

  if (orderedCharges.some((charge) => charge.outstandingCents <= 0)) {
    throw new AppError("Uno de los cargos seleccionados ya no tiene saldo pendiente");
  }

  const reconciliation = await prisma.$transaction(async (tx) => {
    const existingPayment = await tx.payment.findUnique({
      where: { receiptId: receipt.id }
    });

    const payment =
      existingPayment ??
      (await tx.payment.create({
        data: {
          schoolId: receipt.schoolId,
          studentId: spansMultipleStudents ? undefined : firstCharge.studentId,
          guardianId: commonGuardianId ?? firstCharge.guardianId ?? undefined,
          receiptId: receipt.id,
          amountCents: receipt.extractedAmountCents!,
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

    const refreshedCharges = await tx.charge.findMany({
      where: {
        id: {
          in: uniqueChargeIds
        }
      }
    });
    const refreshedById = new Map(refreshedCharges.map((charge) => [charge.id, charge]));

    let remainingPaymentCents = payment.amountCents;
    const allocations: { chargeId: string; amountCents: number }[] = [];

    for (const charge of orderedCharges) {
      const refreshedCharge = refreshedById.get(charge.id);
      if (!refreshedCharge || refreshedCharge.schoolId !== receipt.schoolId) {
        throw new AppError("Cargo no encontrado");
      }

      if (remainingPaymentCents <= 0) {
        break;
      }

      const appliedCents = Math.min(refreshedCharge.outstandingCents, remainingPaymentCents);
      if (appliedCents <= 0) {
        continue;
      }

      const remainingOutstanding = Math.max(refreshedCharge.outstandingCents - appliedCents, 0);
      allocations.push({
        chargeId: refreshedCharge.id,
        amountCents: appliedCents
      });

      await tx.charge.update({
        where: { id: refreshedCharge.id },
        data: {
          outstandingCents: remainingOutstanding,
          status: getUpdatedChargeStatus({
            outstandingCents: remainingOutstanding,
            amountCents: refreshedCharge.amountCents,
            dueDate: refreshedCharge.dueDate
          })
        }
      });

      remainingPaymentCents -= appliedCents;
    }

    if (allocations.length === 0) {
      throw new AppError("No pudimos aplicar el pago a los cargos seleccionados");
    }

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
          notIn: allocations.map((allocation) => allocation.chargeId)
        }
      }
    });

    for (const allocation of allocations) {
      await tx.reconciliationAllocation.upsert({
        where: {
          reconciliationId_chargeId: {
            reconciliationId: reconciliation.id,
            chargeId: allocation.chargeId
          }
        },
        create: {
          reconciliationId: reconciliation.id,
          chargeId: allocation.chargeId,
          amountCents: allocation.amountCents
        },
        update: {
          amountCents: allocation.amountCents
        }
      });
    }

    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.RECONCILED,
        studentId: spansMultipleStudents ? null : firstCharge.studentId,
        guardianId: commonGuardianId ?? firstCharge.guardianId ?? undefined
      }
    });

    await tx.receipt.update({
      where: { id: receipt.id },
      data: {
        studentId: spansMultipleStudents ? null : firstCharge.studentId,
        guardianId: commonGuardianId ?? firstCharge.guardianId ?? undefined,
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
          chargeIds: allocations.map((allocation) => allocation.chargeId),
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
          ? buildAutomaticReconciliationReply({
              allocations,
              charges: orderedCharges
            })
          : "Tu comprobante fue conciliado por nuestro equipo."
    });

    return reconciliation;
  });

  await prisma.receiptResolutionPrompt.updateMany({
    where: {
      receiptId: receipt.id,
      status: ReceiptResolutionPromptStatus.OPEN
    },
    data: {
      status: ReceiptResolutionPromptStatus.CANCELLED
    }
  });

  return reconciliation;
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
    source?: "ingest" | "reprocess" | "payer_reply";
    actorUserId?: string;
    forcedStudentId?: string;
    forcedChargeId?: string;
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

  const ranked = await rankReceiptCandidates(receiptId, {
    forcedStudentId: options?.forcedStudentId,
    forcedChargeIds: options?.forcedChargeId ? [options.forcedChargeId] : undefined
  });
  const topCandidate = ranked[0];
  const secondCandidate = ranked[1];
  const autoDecision = decideAutomaticReconciliation(topCandidate, secondCandidate);
  const payerResolutionAction = determinePayerResolutionActionWithAmount(
    ranked,
    receipt.extractedAmountCents
  );

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

  if (
    ranked.length === 0 &&
    options?.source !== "reprocess" &&
    !options?.forcedStudentId &&
    !options?.forcedChargeId &&
    receipt.extractedAmountCents
  ) {
    const prompt = await createPayerSelectionPrompt({
      receipt: {
        id: receipt.id,
        schoolId: receipt.schoolId,
        channel: receipt.channel,
        message: receipt.message
      },
      receiptAmountCents: receipt.extractedAmountCents
    });

    if (prompt) {
      await resetPendingResolutionState({
        receiptId,
        paymentId: receipt.payment?.id,
        reconciliationId: receipt.reconciliations[0]?.id,
        reconciliationStrategy: receipt.reconciliations[0]?.strategy ?? null
      });
      return prompt;
    }
  }

  if (options?.forcedChargeId && topCandidate) {
    const isPartialPayment =
      receipt.extractedAmountCents != null && receipt.extractedAmountCents < topCandidate.outstandingCents;

    return reconcileReceiptWithCharge({
      receiptId,
      chargeId: topCandidate.chargeId,
      mode: "automatic",
      actorUserId: options?.actorUserId,
      matchScore: topCandidate.confidence,
      strategy: isPartialPayment ? "payer_confirmed_partial_payment" : "payer_confirmed_period",
      notes: isPartialPayment
        ? "El apoderado confirmo que el comprobante corresponde a un abono parcial."
        : "El apoderado confirmo explicitamente el periodo del pago.",
      resolutionMetadata: {
        source: options?.source ?? "payer_reply",
        matchedChargeId: topCandidate.chargeId,
        forcedChargeId: options.forcedChargeId,
        partialPaymentConfirmed: isPartialPayment
      }
      });
  }

  if (
    payerResolutionAction.type === "ask_overpayment" &&
    options?.source !== "reprocess" &&
    receipt.extractedAmountCents
  ) {
    const prompt = await createOverpaymentPrompt({
      receipt: {
        id: receipt.id,
        schoolId: receipt.schoolId,
        channel: receipt.channel,
        message: receipt.message
      },
      candidates: payerResolutionAction.chargeOptions,
      receiptAmountCents: receipt.extractedAmountCents
    });

    if (prompt) {
      await resetPendingResolutionState({
        receiptId,
        paymentId: receipt.payment?.id,
        reconciliationId: receipt.reconciliations[0]?.id,
        reconciliationStrategy: receipt.reconciliations[0]?.strategy ?? null
      });
      return prompt;
    }
  }

  if (topCandidate && autoDecision.shouldAutoReconcile) {
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

  if (payerResolutionAction.type === "auto_oldest_debt" && payerResolutionAction.targetCandidate) {
    return reconcileReceiptWithCharge({
      receiptId,
      chargeId: payerResolutionAction.targetCandidate.chargeId,
      mode: "automatic",
      actorUserId: options?.actorUserId,
      matchScore: payerResolutionAction.targetCandidate.confidence,
      strategy: "oldest_outstanding_priority",
      notes: "Se aplico automaticamente al cargo mas antiguo del mismo alumno.",
      resolutionMetadata: {
        source: options?.source ?? "ingest",
        matchedChargeId: payerResolutionAction.targetCandidate.chargeId,
        forcedStudentId: options?.forcedStudentId ?? null
      }
    });
  }

  if (payerResolutionAction.type === "ask_student" && options?.source !== "reprocess") {
    const prompt = await createStudentSelectionPrompt({
      receipt: {
        id: receipt.id,
        schoolId: receipt.schoolId,
        channel: receipt.channel,
        message: receipt.message
      },
      options: payerResolutionAction.studentOptions
    });

    if (prompt) {
      await resetPendingResolutionState({
        receiptId,
        paymentId: receipt.payment?.id,
        reconciliationId: receipt.reconciliations[0]?.id,
        reconciliationStrategy: receipt.reconciliations[0]?.strategy ?? null
      });
      return prompt;
    }
  }

  if (payerResolutionAction.type === "ask_period" && options?.source !== "reprocess") {
    const prompt = await createPeriodSelectionPrompt({
      receipt: {
        id: receipt.id,
        schoolId: receipt.schoolId,
        channel: receipt.channel,
        message: receipt.message
      },
      options: payerResolutionAction.periodOptions
    });

    if (prompt) {
      await resetPendingResolutionState({
        receiptId,
        paymentId: receipt.payment?.id,
        reconciliationId: receipt.reconciliations[0]?.id,
        reconciliationStrategy: receipt.reconciliations[0]?.strategy ?? null
      });
      return prompt;
    }
  }

  if (
    payerResolutionAction.type === "ask_partial_payment" &&
    options?.source !== "reprocess" &&
    receipt.extractedAmountCents
  ) {
    const prompt = await createPartialPaymentPrompt({
      receipt: {
        id: receipt.id,
        schoolId: receipt.schoolId,
        channel: receipt.channel,
        message: receipt.message
      },
      candidate: payerResolutionAction.targetCandidate,
      receiptAmountCents: receipt.extractedAmountCents
    });

    if (prompt) {
      await resetPendingResolutionState({
        receiptId,
        paymentId: receipt.payment?.id,
        reconciliationId: receipt.reconciliations[0]?.id,
        reconciliationStrategy: receipt.reconciliations[0]?.strategy ?? null
      });
      return prompt;
    }
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
      reason: buildReviewReason(topCandidate, ranked, autoDecision.reason)
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
      reason: buildReviewReason(topCandidate, ranked, autoDecision.reason)
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
        candidatesFound: ranked.length,
        forcedStudentId: options?.forcedStudentId ?? null,
        forcedChargeId: options?.forcedChargeId ?? null
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
