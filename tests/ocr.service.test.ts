import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readFile: vi.fn(),
  recognize: vi.fn()
}));

vi.mock("@/server/config/env", () => ({
  env: {
    OCR_LANG_PATH: "./tessdata"
  }
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    receipt: {
      findUnique: vi.fn()
    },
    onboardingPaymentReceipt: {
      findUnique: vi.fn()
    }
  }
}));

vi.mock("node:fs/promises", () => ({
  readFile: mocks.readFile
}));

vi.mock("tesseract.js", () => ({
  default: {
    recognize: mocks.recognize
  }
}));

import { extractOnboardingReceiptText } from "@/server/services/ocr.service";

describe("ocr.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readFile.mockResolvedValue(Buffer.from("image-binary"));
    mocks.recognize.mockResolvedValue({
      data: {
        text: "Monto transferido $39.900",
        confidence: 89
      }
    });
  });

  it("usa una ruta explicita del worker de tesseract al leer imagenes", async () => {
    const result = await extractOnboardingReceiptText("receipt-1", {
      storagePath: "storage/test-receipt.jpg",
      mimeType: "image/jpeg",
      originalFileName: "test-receipt.jpg",
      rawPayload: null,
      bodyText: null,
      previousExtractedText: null,
      previousExtractionConfidence: null
    });

    expect(mocks.recognize).toHaveBeenCalledWith(
      expect.any(Buffer),
      "spa+eng",
      expect.objectContaining({
        workerPath: expect.stringContaining("node_modules"),
        langPath: expect.stringContaining("tessdata"),
        gzip: false
      })
    );
    expect(result.text).toContain("Monto transferido $39.900");
    expect(result.confidence).toBeGreaterThan(0.8);
  });
});
