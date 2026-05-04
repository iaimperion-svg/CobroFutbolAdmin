import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import Tesseract from "tesseract.js";
import { env } from "@/server/config/env";
import { prisma } from "@/server/db/prisma";

const supportedOcrMimePrefixes = ["image/"];
const supportedOcrExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"]);
const searchablePayloadKeyPattern =
  /caption|text|message|description|body|sender|remitente|referencia|reference|monto|amount|fecha|date|bank|banco/i;
const tesseractWorkerPath = resolve(process.cwd(), "node_modules", "tesseract.js", "src", "worker-script", "node", "index.js");
const tesseractLangPath = resolve(env.OCR_LANG_PATH);

function normalizeExtractedText(text: string) {
  return text
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function flattenSearchablePayloadText(value: unknown, depth = 0): string[] {
  if (depth > 3 || value == null) {
    return [];
  }

  if (typeof value === "string") {
    const clean = value.trim();
    return clean.length > 0 ? [clean] : [];
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenSearchablePayloadText(item, depth + 1));
  }

  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, nestedValue]) => {
      if (!searchablePayloadKeyPattern.test(key)) {
        return [];
      }

      return flattenSearchablePayloadText(nestedValue, depth + 1);
    });
  }

  return [];
}

function canRunImageOcr(receipt: { storagePath: string | null; mimeType: string | null }) {
  if (!receipt.storagePath) {
    return false;
  }

  if (receipt.mimeType && supportedOcrMimePrefixes.some((prefix) => receipt.mimeType?.startsWith(prefix))) {
    return true;
  }

  const extension = extname(receipt.storagePath).toLowerCase();
  return supportedOcrExtensions.has(extension);
}

async function readTextFromStoredImage(storagePath: string) {
  try {
    const imageBuffer = await readFile(storagePath);
    const ocrResults = [await readOcrFromImageBuffer(imageBuffer)];
    const enhancedImageBuffer = await createEnhancedOcrImageBuffer(imageBuffer, storagePath);

    if (enhancedImageBuffer) {
      ocrResults.push(await readOcrFromImageBuffer(enhancedImageBuffer));
    }

    const text = mergeOcrResultText(ocrResults.map((result) => result.text));

    if (text.length < 8) {
      return null;
    }

    const confidence = Math.max(
      0.18,
      Math.min(0.97, Math.max(...ocrResults.map((result) => result.confidence)) / 100)
    );
    return { text, confidence };
  } catch (error) {
    const message = error instanceof Error ? error.message : "error desconocido";
    console.warn("[ocr] image OCR failed", { storagePath, error: message });
    return null;
  }
}

async function readOcrFromImageBuffer(imageBuffer: Buffer) {
  const options = {
    workerPath: tesseractWorkerPath,
    langPath: tesseractLangPath,
    gzip: false,
    tessedit_pageseg_mode: "6"
  } as unknown as Partial<Tesseract.WorkerOptions>;
  const result = await Tesseract.recognize(imageBuffer, "spa+eng", options);

  return {
    text: normalizeExtractedText(result.data.text ?? ""),
    confidence: result.data.confidence ?? 0
  };
}

async function createEnhancedOcrImageBuffer(imageBuffer: Buffer, storagePath: string) {
  try {
    const sharp = (await import("sharp")).default;
    const metadata = await sharp(imageBuffer).metadata();
    const width = metadata.width ? Math.min(metadata.width * 2, 1800) : undefined;
    let pipeline = sharp(imageBuffer).grayscale().normalize().sharpen();

    if (width) {
      pipeline = pipeline.resize({ width });
    }

    return await pipeline.png().toBuffer();
  } catch (error) {
    const message = error instanceof Error ? error.message : "error desconocido";
    console.warn("[ocr] enhanced image preprocessing skipped", { storagePath, error: message });
    return null;
  }
}

function mergeOcrResultText(texts: string[]) {
  const lines = texts.flatMap((text) => normalizeExtractedText(text).split("\n"));
  const seen = new Set<string>();

  return normalizeExtractedText(
    lines
      .map((line) => line.trim())
      .filter((line) => {
        if (!line) {
          return false;
        }

        const key = line.toLowerCase().replace(/\s+/g, " ");
        if (seen.has(key)) {
          return false;
        }

        seen.add(key);
        return true;
      })
      .join("\n")
  );
}

async function extractTextFromStoredReceipt(input: {
  storagePath: string | null;
  mimeType: string | null;
  originalFileName: string | null;
  rawPayload: unknown;
  bodyText: string | null;
  previousExtractedText: string | null;
  previousExtractionConfidence: number | null;
}) {
  const bodyText = normalizeExtractedText(input.bodyText ?? "");
  const previousExtractedText = normalizeExtractedText(input.previousExtractedText ?? "");
  const filename = (input.originalFileName ?? "").trim();
  const payloadText = normalizeExtractedText(
    flattenSearchablePayloadText(input.rawPayload).join("\n")
  );
  const ocrFromImage = canRunImageOcr({
    storagePath: input.storagePath,
    mimeType: input.mimeType
  })
    ? await readTextFromStoredImage(input.storagePath as string)
    : null;

  const mergedText = normalizeExtractedText(
    [ocrFromImage?.text ?? "", bodyText, payloadText, previousExtractedText, filename]
      .map((item) => item.trim())
      .filter(Boolean)
      .join("\n")
  );

  let confidence = 0.2;
  if (bodyText.length > 10) confidence = Math.max(confidence, 0.52);
  if (payloadText.length > 10) confidence = Math.max(confidence, 0.46);
  if (ocrFromImage) confidence = Math.max(confidence, ocrFromImage.confidence);
  if (previousExtractedText.length > 10) {
    confidence = Math.max(confidence, input.previousExtractionConfidence ?? 0.48);
  }
  if (mergedText.length > 24) confidence = Math.max(confidence, 0.56);

  return {
    text: mergedText,
    confidence
  };
}

export type StoredReceiptTextInput = Parameters<typeof extractTextFromStoredReceipt>[0];

export async function extractReceiptTextFromInput(input: StoredReceiptTextInput) {
  return extractTextFromStoredReceipt(input);
}

export async function extractReceiptText(receiptId: string) {
  const receipt = await prisma.receipt.findUnique({
    where: { id: receiptId },
    include: { message: true }
  });

  if (!receipt) {
    throw new Error("Comprobante no encontrado");
  }

  return extractTextFromStoredReceipt({
    storagePath: receipt.storagePath,
    mimeType: receipt.mimeType,
    originalFileName: receipt.originalFileName,
    rawPayload: receipt.rawPayload,
    bodyText: receipt.message?.bodyText ?? null,
    previousExtractedText: receipt.extractedText,
    previousExtractionConfidence: receipt.extractionConfidence
  });
}

export async function extractOnboardingReceiptText(
  receiptId: string,
  override?: Partial<StoredReceiptTextInput>
) {
  if (override) {
    return extractTextFromStoredReceipt({
      storagePath: override.storagePath ?? null,
      mimeType: override.mimeType ?? null,
      originalFileName: override.originalFileName ?? null,
      rawPayload: override.rawPayload ?? null,
      bodyText: override.bodyText ?? null,
      previousExtractedText: override.previousExtractedText ?? null,
      previousExtractionConfidence: override.previousExtractionConfidence ?? null
    });
  }

  const receipt = await prisma.onboardingPaymentReceipt.findUnique({
    where: { id: receiptId }
  });

  if (!receipt) {
    throw new Error("Comprobante de onboarding no encontrado");
  }

  return extractTextFromStoredReceipt({
    storagePath: receipt.storagePath,
    mimeType: receipt.mimeType,
    originalFileName: receipt.originalFileName,
    rawPayload: receipt.rawPayload,
    bodyText: receipt.bodyText,
    previousExtractedText: receipt.extractedText,
    previousExtractionConfidence: receipt.extractionConfidence
  });
}
