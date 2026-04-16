const knownBanks = [
  "scotiabank azul",
  "bancoestado",
  "banco estado",
  "banco de chile",
  "santander",
  "bci",
  "itau",
  "scotiabank"
];

const maxReasonableAmountCents = 2_000_000_000;

export type ExtractedPaymentData = {
  amountCents: number | null;
  paidAt: Date | null;
  senderName: string | null;
  reference: string | null;
  bankName: string | null;
  rawText: string;
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

function pickAmountValue(text: string) {
  const labeledMatch = text.match(
    /monto(?:\s+total)?[:\s$]*((?:\d{1,3}(?:[.\s]\d{3})+|\d{4,}))/i
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
      if (/monto|total|abono|pago/i.test(context)) score += 5;
      if (/cuenta|chat|id|folio|codigo|transaccion|trx|telefono|fono|celular/i.test(context)) score -= 6;
      if (digits.length >= 10) score -= 4;
      if (/[.\s]\d{3}/.test(raw)) score += 1;

      return { raw, score };
    })
    .sort((left, right) => right.score - left.score);

  return candidates.find((candidate) => candidate.score >= 1)?.raw ?? null;
}

function sanitizeReference(raw: string) {
  const sanitized = raw
    .toUpperCase()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");

  return sanitized.replace(/(?:FECHA|MONTO|REMITENTE|EMISOR|BANCO|TIPO|CUENTA|HORA).*/g, "");
}

function scoreReferenceCandidate(value: string) {
  const segments = value.split("-").filter(Boolean);
  const digits = (value.match(/\d/g) ?? []).length;
  const letters = (value.match(/[A-Z]/g) ?? []).length;

  let score = value.length;
  if (segments.length >= 3) score += 12;
  if (digits >= 4) score += 10;
  if (letters >= 2) score += 4;
  if (value.includes("-")) score += 6;

  return score;
}

function pickReferenceValue(text: string) {
  const labelPattern =
    /(?:referencia|trx|operacion|folio|codigo(?:\s+de)?\s+transacci[o\u00f3]n)\b/giu;
  const labeledCandidates = [...text.matchAll(labelPattern)].flatMap((labelMatch) => {
    const start = labelMatch.index ?? 0;
    const chunk = text.slice(start, Math.min(start + 96, text.length));
    const rawCandidate =
      chunk.match(
        /(?:referencia|trx|operacion|folio|codigo(?:\s+de)?\s+transacci[o\u00f3]n)\s*[:#-]*\s*([A-Z0-9][A-Z0-9\s-]{3,64})/iu
      )?.[1] ?? null;
    const sanitized = sanitizeReference(rawCandidate ?? "");

    return sanitized.length >= 4 ? [sanitized] : [];
  });

  const genericCandidates = [...text.matchAll(/\b[A-Z0-9]{2,}(?:[-\s][A-Z0-9]{2,}){1,7}\b/g)]
    .map((match) => sanitizeReference(match[0] ?? ""))
    .filter((value) => value.length >= 8);

  const candidates = [...labeledCandidates, ...genericCandidates];
  if (candidates.length === 0) {
    return null;
  }

  return candidates.sort((left, right) => scoreReferenceCandidate(right) - scoreReferenceCandidate(left))[0] ?? null;
}

function completeReferenceWithFollowingToken(text: string, baseReference: string | null) {
  if (!baseReference || baseReference.length < 4) {
    return baseReference;
  }

  const escaped = baseReference.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const continuation = text.match(
    new RegExp(`${escaped}(?:[-\\s]*)([A-Z0-9]{4,12})`, "i")
  );

  if (!continuation?.[1]) {
    return baseReference;
  }

  const completed = sanitizeReference(`${baseReference}-${continuation[1]}`);
  if (completed.length <= baseReference.length) {
    return baseReference;
  }

  return completed;
}

export function extractPaymentDataFromText(text: string): ExtractedPaymentData {
  const normalized = normalizeForMatching(text);
  const amountValue = pickAmountValue(text);
  const dateMatch = text.match(/\b(\d{2}[/-]\d{2}[/-]\d{2,4}|\d{4}[/-]\d{2}[/-]\d{2})\b/);
  const reference = completeReferenceWithFollowingToken(text, pickReferenceValue(text));
  const senderMatch =
    text.match(
      /(?:remitente|emisor|desde|transferencia de|transferiste a|destinatario|a nombre de)[:\s]*([\p{L} ]{4,}?)(?=\s+(?:monto|fecha|referencia|folio|trx|periodo|banco|tipo|n(?:ro|umero)|codigo)\b|$)/iu
    ) ?? text.match(/([\p{Lu}][\p{L}]+(?:\s+[\p{Lu}][\p{L}]+){1,3})/u);

  const bankName = knownBanks.find((bank) => normalized.includes(bank)) ?? null;
  const dateValue = dateMatch?.[1];
  const amountCents = amountValue ? parseAmountToCents(amountValue) : null;
  const paidAt = dateValue ? parseDate(dateValue) : null;
  const senderName = senderMatch?.[1]?.trim() ?? null;

  let confidence = 0.2;
  if (amountCents) confidence += 0.35;
  if (paidAt) confidence += 0.2;
  if (senderName) confidence += 0.15;
  if (reference) confidence += 0.1;
  if (bankName) confidence += 0.1;

  return {
    amountCents,
    paidAt,
    senderName,
    reference,
    bankName,
    rawText: text,
    confidence: Math.min(confidence, 0.95)
  };
}
