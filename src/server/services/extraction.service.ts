const knownBanks = [
  "scotiabank azul",
  "bancoestado",
  "banco estado",
  "banco de chile",
  "mercado pago",
  "santander",
  "bci",
  "itau",
  "scotiabank",
  "tap"
];

const maxReasonableAmountCents = 2_000_000_000;

export type PaymentExtractionProfile = "student_payment" | "onboarding_setup";

export type PaymentExtractionOptions = {
  profile?: PaymentExtractionProfile;
  expectedReference?: string | null;
};

export type ExtractedPaymentData = {
  amountCents: number | null;
  paidAt: Date | null;
  senderName: string | null;
  reference: string | null;
  bankName: string | null;
  destinationAccountNumber: string | null;
  rawText: string;
  confidence: number;
};

export type OnboardingReceiptAssessment = {
  outcome: "exact_match" | "amount_match" | "reference_match" | "partial_match" | "unreadable";
  expectedAmountCents: number;
  detectedAmountCents: number | null;
  amountMatchesExpected: boolean;
  amountDifferenceCents: number | null;
  expectedReference: string | null;
  detectedReference: string | null;
  referenceMatchesExpected: boolean;
  confidence: number;
};

function parseAmountToCents(raw: string) {
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) {
    return null;
  }

  const amountCents = Number.parseInt(digits, 10) * 100;

  if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > maxReasonableAmountCents) {
    return null;
  }

  return amountCents;
}

function parseDate(raw: string) {
  const parts = raw.split(/[/-]/).map((item) => Number.parseInt(item, 10));
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    return null;
  }

  const [first, second, third] = parts;
  if (!first || !second || !third) {
    return null;
  }

  const normalizeYear = (year: number) => (year < 100 ? 2000 + year : year);

  if (raw.includes("/") || raw.split("-")[0]?.length !== 4) {
    return new Date(Date.UTC(normalizeYear(third), second - 1, first, 12, 0, 0));
  }

  return new Date(Date.UTC(normalizeYear(first), second - 1, third, 12, 0, 0));
}

function normalizeForMatching(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizeWhitespace(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function sanitizeReference(raw: string) {
  const sanitized = raw
    .toUpperCase()
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");

  return sanitized
    .replace(/(?:FECHA|MONTO|REMITENTE|EMISOR|BANCO|TIPO|CUENTA|HORA).*/g, "")
    .replace(/^-+|-+$/g, "");
}

function pickAmountValue(text: string) {
  const labeledMatch = text.match(
    /monto(?:\s+total|(?:\s+transferido)?)?[:\s$]*((?:\d{1,3}(?:[.\s]\d{3})+|\d{4,}))/i
  );

  if (labeledMatch?.[1]) {
    return labeledMatch[1];
  }

  const candidates = [...text.matchAll(/(\$?\s?(?:\d{1,3}(?:[.\s]\d{3})+|\d{4,}))/g)]
    .map((match) => {
      const raw = match[1]?.trim() ?? "";
      const index = match.index ?? 0;
      const contextStart = Math.max(0, index - 28);
      const contextEnd = Math.min(text.length, index + raw.length + 28);
      const context = text.slice(contextStart, contextEnd).toLowerCase();
      const digits = raw.replace(/[^\d]/g, "");

      let score = 0;
      if (raw.includes("$")) score += 3;
      if (/monto|total|abono|pago|transferido/i.test(context)) score += 5;
      if (/cuenta|chat|id|folio|codigo|transaccion|trx|telefono|fono|celular/i.test(context)) score -= 6;
      if (digits.length >= 10) score -= 4;
      if (/[.\s]\d{3}/.test(raw)) score += 1;

      return { raw, score };
    })
    .sort((left, right) => right.score - left.score);

  return candidates.find((candidate) => candidate.score >= 1)?.raw ?? null;
}

function trimReferenceChunk(raw: string) {
  return raw
    .replace(/\s+/g, " ")
    .replace(/\b(?:titular|correo|fecha|monto|remitente|emisor|banco|tipo|cuenta|hora|rut|estado|transferencia)\b.*$/iu, "")
    .trim();
}

function collectCodeLikeReferenceCandidates(raw: string) {
  const normalized = raw
    .toUpperCase()
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[_/]/g, "-");
  const matches = [
    ...normalized.matchAll(/\b[A-Z0-9]{2,12}(?:[-\s][A-Z0-9]{2,12}){1,3}\b/g),
    ...normalized.matchAll(/\b[A-Z]{1,4}\s+[A-Z0-9]{4,12}\b/g)
  ];

  return [...new Set(matches.map((match) => sanitizeReference(match[0] ?? "")).filter((value) => value.length >= 4))];
}

function scoreReferenceCandidate(value: string, options: PaymentExtractionOptions) {
  const segments = value.split("-").filter(Boolean);
  const digits = (value.match(/\d/g) ?? []).length;
  const letters = (value.match(/[A-Z]/g) ?? []).length;
  const expectedReference = options.expectedReference ? sanitizeReference(options.expectedReference) : null;

  let score = value.length;
  if (segments.length >= 3) score += 12;
  if (digits >= 4) score += 10;
  if (letters >= 2) score += 4;
  if (value.includes("-")) score += 6;
  if (segments.length > 4) score -= 16;
  if (value.length > 24) score -= 18;
  if (digits === 0 && value.length > 12) score -= 10;
  if (digits > 0 && letters === 0 && value.length >= 8) score -= 6;

  if (options.profile === "onboarding_setup") {
    if (value.startsWith("PG-")) score += 20;
    if (expectedReference && value === expectedReference) score += 40;
  }

  return score;
}

function pickOnboardingReferenceValue(text: string, options: PaymentExtractionOptions) {
  const publicCodes = [...new Set(
    [...text.toUpperCase().matchAll(/\bPG-[A-Z0-9]{4,}\b/g)]
      .map((match) => sanitizeReference(match[0] ?? ""))
      .filter(Boolean)
  )];
  const expectedReference = options.expectedReference ? sanitizeReference(options.expectedReference) : null;

  if (expectedReference && publicCodes.includes(expectedReference)) {
    return expectedReference;
  }

  if (publicCodes.length > 0) {
    return publicCodes.sort(
      (left, right) => scoreReferenceCandidate(right, options) - scoreReferenceCandidate(left, options)
    )[0] ?? null;
  }

  return null;
}

function pickReferenceValue(text: string, options: PaymentExtractionOptions = {}) {
  if (options.profile === "onboarding_setup") {
    const onboardingReference = pickOnboardingReferenceValue(text, options);
    if (onboardingReference) {
      return onboardingReference;
    }
  }

  const labelPattern =
    /(?:referencia|trx|operacion|folio|codigo(?:\s+de)?\s+transacci[o\u00f3]n)\b/giu;
  const labeledCandidates = [...text.matchAll(labelPattern)].flatMap((labelMatch) => {
    const start = labelMatch.index ?? 0;
    const chunk = text.slice(start, Math.min(start + 96, text.length));
    const rawCandidate =
      chunk.match(
        /(?:referencia|trx|operacion|folio|codigo(?:\s+de)?\s+transacci[o\u00f3]n)\s*[:#-]*\s*([A-Z0-9][A-Z0-9\s-]{3,64})/iu
      )?.[1] ?? null;
    const trimmedCandidate = trimReferenceChunk(rawCandidate ?? "");
    const codeLikeCandidates = collectCodeLikeReferenceCandidates(trimmedCandidate || chunk);
    const sanitized = sanitizeReference(trimmedCandidate);
    const fallbackCandidates = sanitized.length >= 4 && sanitized.length <= 24 ? [sanitized] : [];

    return [...codeLikeCandidates, ...fallbackCandidates];
  });

  const genericCandidates = [...text.matchAll(/\b[A-Z0-9]{2,12}(?:[-\s][A-Z0-9]{2,12}){1,3}\b/g)]
    .map((match) => sanitizeReference(match[0] ?? ""))
    .filter((value) => value.length >= 8);

  const candidates = [...new Set([...labeledCandidates, ...genericCandidates])];
  if (candidates.length === 0) {
    return null;
  }

  return candidates.sort(
    (left, right) => scoreReferenceCandidate(right, options) - scoreReferenceCandidate(left, options)
  )[0] ?? null;
}

function completeReferenceWithFollowingToken(
  text: string,
  baseReference: string | null,
  options: PaymentExtractionOptions
) {
  if (!baseReference || baseReference.length < 4) {
    return baseReference;
  }

  if (options.profile === "onboarding_setup" && baseReference.startsWith("PG-")) {
    return baseReference;
  }

  const escaped = baseReference.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const continuation = text.match(
    new RegExp(`${escaped}(?:[-\\s]*)([A-Z0-9]{4,12})`, "i")
  );

  if (!continuation?.[1]) {
    return baseReference;
  }

  const nextToken = continuation[1];
  const baseEndsWithShortSegment = baseReference.split("-").filter(Boolean).at(-1)?.length ?? 0;
  const shouldAppend =
    /\d/.test(nextToken) || baseEndsWithShortSegment <= 3 || /^[A-Z0-9]{4,8}$/i.test(nextToken);

  if (!shouldAppend) {
    return baseReference;
  }

  const completed = sanitizeReference(`${baseReference}-${nextToken}`);
  if (completed.length <= baseReference.length) {
    return baseReference;
  }

  return completed;
}

function looksLikeNoiseSender(value: string) {
  const normalized = normalizeForMatching(value);

  if (knownBanks.some((bank) => normalized.includes(bank))) {
    return true;
  }

  return /comprobante|transferencia|solicitud|pre calentamiento|pago/i.test(normalized);
}

function pickSenderName(text: string, options: PaymentExtractionOptions = {}) {
  const explicitHolderMatch = text.match(
    /\btitular[:\s]*([\p{L}. ]{2,60}?)(?=\s+(?:correo|mail|monto|fecha|referencia|folio|trx|periodo|banco|tipo|n(?:ro|umero)|codigo|rut)\b|$)/iu
  );

  if (explicitHolderMatch?.[1]) {
    return normalizeWhitespace(explicitHolderMatch[1]);
  }

  const labeledSenderMatch = text.match(
    /(?:titular|remitente|emisor|desde|transferencia de|transferiste a|destinatario|a nombre de)[:\s]*([\p{L}. ]{4,}?)(?=\s+(?:monto|fecha|referencia|folio|trx|periodo|banco|tipo|n(?:ro|umero)|codigo|correo|mail|rut)\b|$)/iu
  );

  if (labeledSenderMatch?.[1]) {
    return normalizeWhitespace(labeledSenderMatch[1]);
  }

  if (options.profile === "onboarding_setup") {
    const titularMatch = text.match(/titular[:\s]*([\p{L}. ]{4,60})/iu);
    if (titularMatch?.[1]) {
      return normalizeWhitespace(titularMatch[1]);
    }
  }

  const fallbackSenderMatch = text.match(/([\p{Lu}][\p{L}.]+(?:\s+[\p{Lu}][\p{L}.]+){1,3})/u);
  const fallback = fallbackSenderMatch?.[1] ? normalizeWhitespace(fallbackSenderMatch[1]) : null;

  if (!fallback || looksLikeNoiseSender(fallback)) {
    return null;
  }

  return fallback;
}

function pickDestinationAccountNumber(text: string) {
  const visibleNumberMatch = text.match(/numero\s+visible\s*[:#.-]*\s*([\d*.\s-]{4,24})/iu);
  if (visibleNumberMatch?.[1]) {
    const digits = visibleNumberMatch[1].replace(/[^\d]/g, "");
    if (digits.length >= 4 && digits.length <= 24) {
      return digits;
    }
  }

  const labeledMatch = text.match(
    /(?:n(?:u|ú|°|ro|mero)?\s*(?:de\s*)?cuenta|cuenta(?:\s+destino)?|n(?:u|ú|°|ro|mero)?\s*de\s*cta)\s*[:#.-]*\s*([\d.\s-]{4,24})/iu
  );

  if (labeledMatch?.[1]) {
    const digits = labeledMatch[1].replace(/[^\d]/g, "");
    if (digits.length >= 4 && digits.length <= 24) {
      return digits;
    }
  }

  const candidates = [...text.matchAll(/\b(\d{7,24})\b/g)]
    .map((match) => {
      const raw = match[1] ?? "";
      const index = match.index ?? 0;
      const context = text.slice(Math.max(0, index - 28), Math.min(text.length, index + raw.length + 28));
      let score = 0;

      if (/cuenta|destino|cta/i.test(context)) score += 5;
      if (/telefono|fono|celular|chat|id|folio|operacion|trx|transaccion/i.test(context)) score -= 6;
      if (raw.length >= 8 && raw.length <= 20) score += 2;

      return {
        raw,
        score
      };
    })
    .sort((left, right) => right.score - left.score);

  return candidates.find((candidate) => candidate.score >= 3)?.raw ?? null;
}

function pickDestinationAccountNumberWithDirectionHints(text: string) {
  const destinationBlockMatch = text.match(
    /(?:para|destino|transferiste\s+a|cuenta\s+destino)\b[\s\S]{0,220}?(?:(?:n(?:ro|umero)?|n[°º]?)\s*(?:de\s*)?cuenta|cuenta(?:\s+destino)?|(?:n(?:ro|umero)?|n[°º]?)\s*de\s*cta)\s*[:#.-]*\s*([\d.\s-]{4,24})/iu
  );

  if (destinationBlockMatch?.[1]) {
    const digits = destinationBlockMatch[1].replace(/[^\d]/g, "");
    if (digits.length >= 4 && digits.length <= 24) {
      return digits;
    }
  }

  const labeledCandidates = [...text.matchAll(
    /(?:(?:n(?:ro|umero)?|n[°º]?)\s*(?:de\s*)?cuenta|cuenta(?:\s+destino)?|(?:n(?:ro|umero)?|n[°º]?)\s*de\s*cta)\s*[:#.-]*\s*([\d.\s-]{4,24})/giu
  )]
    .map((match) => {
      const raw = match[1]?.replace(/[^\d]/g, "") ?? "";
      const index = match.index ?? 0;
      const contextStart = Math.max(0, index - 96);
      const contextEnd = Math.min(text.length, index + (match[0]?.length ?? 0) + 96);
      const context = normalizeForMatching(text.slice(contextStart, contextEnd));
      let score = 0;

      if (/(?:para|destino|transferiste a|cuenta destino)/i.test(context)) score += 10;
      if (/(?:desde|origen|remitente|emisor|titular)/i.test(context)) score -= 8;
      if (raw.length >= 7 && raw.length <= 20) score += 2;

      return {
        raw,
        score
      };
    })
    .filter((candidate) => candidate.raw.length >= 4 && candidate.raw.length <= 24)
    .sort((left, right) => right.score - left.score);

  const bestLabeledCandidate = labeledCandidates[0];
  if (bestLabeledCandidate && bestLabeledCandidate.score >= 2) {
    return bestLabeledCandidate.raw;
  }

  return pickDestinationAccountNumber(text);
}

export function extractPaymentDataFromText(
  text: string,
  options: PaymentExtractionOptions = {}
): ExtractedPaymentData {
  const normalized = normalizeForMatching(text);
  const amountValue = pickAmountValue(text);
  const dateMatch = text.match(/\b(\d{2}[/-]\d{2}[/-]\d{2,4}|\d{4}[/-]\d{2}[/-]\d{2})\b/);
  const reference = completeReferenceWithFollowingToken(text, pickReferenceValue(text, options), options);
  const bankName = knownBanks.find((bank) => normalized.includes(bank)) ?? null;
  const dateValue = dateMatch?.[1];
  const amountCents = amountValue ? parseAmountToCents(amountValue) : null;
  const paidAt = dateValue ? parseDate(dateValue) : null;
  const senderName = pickSenderName(text, options);
  const destinationAccountNumber = pickDestinationAccountNumberWithDirectionHints(text);

  let confidence = 0.2;
  if (amountCents) confidence += 0.35;
  if (paidAt) confidence += 0.2;
  if (senderName) confidence += 0.15;
  if (reference) confidence += 0.1;
  if (bankName) confidence += 0.1;
  if (destinationAccountNumber) confidence += 0.08;
  if (options.profile === "onboarding_setup" && reference?.startsWith("PG-")) {
    confidence += 0.08;
  }

  return {
    amountCents,
    paidAt,
    senderName,
    reference,
    bankName,
    destinationAccountNumber,
    rawText: text,
    confidence: Math.min(confidence, 0.95)
  };
}

export function assessOnboardingReceipt(input: {
  extracted: ExtractedPaymentData;
  expectedAmountCents: number;
  expectedReference: string | null;
  mediaFailure?: string | null;
  extractionFailure?: string | null;
}): OnboardingReceiptAssessment {
  const expectedReference = input.expectedReference ? sanitizeReference(input.expectedReference) : null;
  const detectedReference = input.extracted.reference ? sanitizeReference(input.extracted.reference) : null;
  const amountMatchesExpected = input.extracted.amountCents === input.expectedAmountCents;
  const referenceMatchesExpected = Boolean(expectedReference && detectedReference === expectedReference);
  const amountDifferenceCents =
    input.extracted.amountCents != null ? input.extracted.amountCents - input.expectedAmountCents : null;

  let outcome: OnboardingReceiptAssessment["outcome"];

  if (amountMatchesExpected && referenceMatchesExpected) {
    outcome = "exact_match";
  } else if (amountMatchesExpected) {
    outcome = "amount_match";
  } else if (referenceMatchesExpected) {
    outcome = "reference_match";
  } else if (
    input.extracted.amountCents != null ||
    detectedReference != null ||
    input.extracted.rawText.trim().length > 0
  ) {
    outcome = "partial_match";
  } else {
    outcome = "unreadable";
  }

  if (outcome === "unreadable" && !(input.mediaFailure || input.extractionFailure)) {
    outcome = "partial_match";
  }

  let confidence = input.extracted.confidence;
  if (amountMatchesExpected) confidence += 0.18;
  if (referenceMatchesExpected) confidence += 0.24;
  if (detectedReference?.startsWith("PG-")) confidence += 0.08;

  return {
    outcome,
    expectedAmountCents: input.expectedAmountCents,
    detectedAmountCents: input.extracted.amountCents,
    amountMatchesExpected,
    amountDifferenceCents,
    expectedReference,
    detectedReference,
    referenceMatchesExpected,
    confidence: Math.min(confidence, 0.99)
  };
}
