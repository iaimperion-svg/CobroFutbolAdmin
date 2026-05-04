import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import { prisma } from "@/server/db/prisma";
import { extractPaymentDataFromText } from "@/server/services/extraction.service";
import { extractReceiptTextFromInput } from "@/server/services/ocr.service";
import { persistReceiptMedia } from "@/server/services/storage.service";
import type { InboundAttachment } from "@/server/services/receipts.service";
import { normalizeText, tokenOverlapScore } from "@/server/utils/strings";

function readMaskedDigits(value: string | null | undefined) {
  return (value ?? "").replace(/[^\d]/g, "");
}

function bankNameScore(extractedBankName: string | null, accountBankName: string) {
  const left = normalizeText(extractedBankName);
  const right = normalizeText(accountBankName);

  if (!left || !right) {
    return 0;
  }

  return left.includes(right) || right.includes(left) ? 0.18 : 0;
}

export async function resolveSchoolFromInboundAttachments(input: {
  attachments: InboundAttachment[];
  bodyText?: string | null;
  rawPayload?: Record<string, unknown>;
  telegramBotToken?: string | null;
}) {
  const attachment = input.attachments[0];
  if (!attachment) {
    return null;
  }

  const transientReceiptId = `school-resolution-${randomUUID()}`;
  let storagePath: string | null = null;

  try {
    storagePath = await persistReceiptMedia(transientReceiptId, {
      fileUrl: attachment.fileUrl,
      inlineBase64: attachment.inlineBase64,
      mimeType: attachment.mimeType,
      originalFileName: attachment.originalFileName,
      telegramBotToken: input.telegramBotToken
    });

    const extractedText = await extractReceiptTextFromInput({
      storagePath,
      mimeType: attachment.mimeType ?? null,
      originalFileName: attachment.originalFileName ?? null,
      rawPayload: input.rawPayload ?? null,
      bodyText: input.bodyText ?? null,
      previousExtractedText: null,
      previousExtractionConfidence: null
    });

    const extracted = extractPaymentDataFromText(extractedText.text);
    const destinationAccountNumber = extracted.destinationAccountNumber;

    if (!destinationAccountNumber) {
      return null;
    }

    const bankAccounts = await prisma.bankAccount.findMany({
      include: {
        school: {
          select: {
            id: true,
            slug: true,
            name: true,
            status: true
          }
        }
      }
    });

    const ranked = bankAccounts
      .map((bankAccount) => {
        const maskedDigits = readMaskedDigits(bankAccount.accountNumberMasked);
        const digitsMatch =
          maskedDigits.length >= 4 && destinationAccountNumber.endsWith(maskedDigits) ? 0.72 : 0;
        const fullAccountMatch =
          bankAccount.accountNumberReference &&
          destinationAccountNumber === readMaskedDigits(bankAccount.accountNumberReference)
            ? 0.92
            : 0;
        const routingMatch =
          bankAccount.routingNumber && destinationAccountNumber === readMaskedDigits(bankAccount.routingNumber)
            ? 0.8
            : 0;
        const holderMatch = tokenOverlapScore(extracted.senderName, bankAccount.accountHolder) * 0.12;
        const score =
          Math.max(digitsMatch, fullAccountMatch, routingMatch) +
          bankNameScore(extracted.bankName, bankAccount.bankName) +
          Math.min(holderMatch, 0.12);

        return {
          bankAccount,
          score
        };
      })
      .filter((candidate) => candidate.score >= 0.72)
      .sort((left, right) => right.score - left.score);

    const bestCandidate = ranked[0];
    const secondCandidate = ranked[1];

    if (!bestCandidate) {
      return null;
    }

    if (secondCandidate && bestCandidate.score - secondCandidate.score < 0.08) {
      return null;
    }

    return {
      schoolId: bestCandidate.bankAccount.schoolId,
      schoolSlug: bestCandidate.bankAccount.school.slug,
      schoolName: bestCandidate.bankAccount.school.name,
      matchedBankAccountId: bestCandidate.bankAccount.id,
      destinationAccountNumber,
      extractedBankName: extracted.bankName
    };
  } finally {
    if (storagePath) {
      await unlink(storagePath).catch(() => undefined);
    }
  }
}
