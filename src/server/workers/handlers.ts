import { Prisma, ReceiptStatus } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { persistReceiptMedia } from "@/server/services/storage.service";
import { extractReceiptText } from "@/server/services/ocr.service";
import { extractPaymentDataFromText } from "@/server/services/extraction.service";
import { processReceiptReconciliation } from "@/server/services/reconciliation.service";
import { deliverOutboundMessage } from "@/server/services/messaging.service";

export async function handleReceiptProcessing(receiptId: string) {
  const receipt = await prisma.receipt.findUnique({
    where: { id: receiptId }
  });

  if (!receipt) {
    throw new Error("Comprobante no encontrado");
  }

  console.info("[worker][receipt] start processing", {
    receiptId,
    originalFileName: receipt.originalFileName ?? null,
    channel: receipt.channel
  });

  try {
    await prisma.receipt.update({
      where: { id: receiptId },
      data: {
        status: ReceiptStatus.PROCESSING,
        metadata: Prisma.JsonNull,
        processedAt: null
      }
    });

    const rawPayload = (receipt.rawPayload ?? {}) as Record<string, unknown>;
    const inlineBase64 =
      typeof rawPayload.inlineBase64 === "string" && rawPayload.inlineBase64.length > 0
        ? rawPayload.inlineBase64
        : null;

    if (!receipt.storagePath && (inlineBase64 || receipt.fileUrl)) {
      const storagePath = await persistReceiptMedia(receipt.id, {
        fileUrl: receipt.fileUrl,
        inlineBase64,
        mimeType: receipt.mimeType,
        originalFileName: receipt.originalFileName
      });

      if (storagePath) {
        await prisma.receipt.update({
          where: { id: receiptId },
          data: { storagePath }
        });

        console.info("[worker][receipt] media persisted", {
          receiptId,
          storagePath
        });
      }
    }

    const ocr = await extractReceiptText(receiptId);
    const extracted = extractPaymentDataFromText(ocr.text);

    console.info("[worker][receipt] extraction finished", {
      receiptId,
      ocrConfidence: ocr.confidence,
      extractionConfidence: extracted.confidence,
      amountCents: extracted.amountCents,
      senderName: extracted.senderName,
      reference: extracted.reference
    });

    await prisma.receipt.update({
      where: { id: receiptId },
      data: {
        extractedText: ocr.text,
        extractedAmountCents: extracted.amountCents ?? undefined,
        extractedPaidAt: extracted.paidAt ?? undefined,
        extractedSenderName: extracted.senderName ?? undefined,
        extractedReference: extracted.reference ?? undefined,
        extractedBankName: extracted.bankName ?? undefined,
        extractionConfidence: Math.max(extracted.confidence, ocr.confidence)
      }
    });

    await processReceiptReconciliation(receiptId);

    const finalReceipt = await prisma.receipt.findUnique({
      where: { id: receiptId }
    });

    console.info("[worker][receipt] processing completed", {
      receiptId,
      finalStatus: finalReceipt?.status ?? "UNKNOWN"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";

    await prisma.receipt.update({
      where: { id: receiptId },
      data: {
        status: ReceiptStatus.FAILED,
        processedAt: new Date(),
        metadata: {
          failure: message
        }
      }
    });

    console.error("[worker][receipt] processing failed", {
      receiptId,
      error: message
    });

    throw error;
  }
}

export async function handleOutboundMessage(messageId: string) {
  await deliverOutboundMessage(messageId);
}
