import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  bankAccountFindMany: vi.fn(),
  persistReceiptMedia: vi.fn(),
  extractReceiptTextFromInput: vi.fn()
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    bankAccount: {
      findMany: mocks.bankAccountFindMany
    }
  }
}));

vi.mock("@/server/services/storage.service", () => ({
  persistReceiptMedia: mocks.persistReceiptMedia
}));

vi.mock("@/server/services/ocr.service", () => ({
  extractReceiptTextFromInput: mocks.extractReceiptTextFromInput
}));

import { resolveSchoolFromInboundAttachments } from "@/server/services/school-resolution.service";

function buildBankAccount(overrides?: Partial<{
  id: string;
  schoolId: string;
  schoolSlug: string;
  schoolName: string;
  bankName: string;
  accountHolder: string;
  accountNumberMasked: string;
  accountNumberReference: string | null;
  routingNumber: string | null;
}>) {
  const {
    id = "bank-account-1",
    schoolId = "school-1",
    schoolSlug = "maurop-fc",
    schoolName = "MAUROP FC",
    bankName = "Scotiabank",
    accountHolder = "MAURO ISAIAS MORENO",
    accountNumberMasked = "***3641",
    accountNumberReference = "500343641",
    routingNumber = null
  } = overrides ?? {};

  return {
    id,
    schoolId,
    bankName,
    accountHolder,
    accountNumberMasked,
    accountNumberReference,
    routingNumber,
    school: {
      id: schoolId,
      slug: schoolSlug,
      name: schoolName,
      status: "ACTIVE"
    }
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.persistReceiptMedia.mockResolvedValue("/tmp/cobrofutbol-school-resolution-test.png");
  mocks.extractReceiptTextFromInput.mockResolvedValue({
    text:
      "Transferencia exitosa Monto transferido $1.000 Desde MAURO ISAIAS MORENO Tipo de cuenta Cuenta vista Tapp N de cuenta 13711865 Para MAURO ISAIAS MORENO Banco Scotiabank Tipo de cuenta Cta Vista N de cuenta 500343641",
    confidence: 0.93
  });
  mocks.bankAccountFindMany.mockResolvedValue([buildBankAccount()]);
});

describe("resolveSchoolFromInboundAttachments", () => {
  it("resuelve la escuela por cuenta destino completa aunque el comprobante incluya cuenta origen", async () => {
    const result = await resolveSchoolFromInboundAttachments({
      attachments: [
        {
          inlineBase64: "base64-image",
          mimeType: "image/png",
          originalFileName: "comprobante.png"
        }
      ],
      bodyText: "Pago familiar Gabriel y Mateo",
      rawPayload: { source: "telegram-test" }
    });

    expect(result).toEqual(
      expect.objectContaining({
        schoolId: "school-1",
        schoolSlug: "maurop-fc",
        schoolName: "MAUROP FC",
        matchedBankAccountId: "bank-account-1",
        destinationAccountNumber: "500343641",
        extractedBankName: "scotiabank"
      })
    );
    expect(mocks.persistReceiptMedia).toHaveBeenCalledWith(
      expect.stringMatching(/^school-resolution-/),
      expect.objectContaining({
        inlineBase64: "base64-image",
        mimeType: "image/png"
      })
    );
  });

  it("rechaza el match cuando dos escuelas comparten una senal de cuenta demasiado parecida", async () => {
    mocks.bankAccountFindMany.mockResolvedValue([
      buildBankAccount({
        id: "bank-account-1",
        schoolId: "school-1",
        schoolSlug: "maurop-fc",
        schoolName: "MAUROP FC",
        accountNumberReference: null,
        accountNumberMasked: "***3641"
      }),
      buildBankAccount({
        id: "bank-account-2",
        schoolId: "school-2",
        schoolSlug: "academia-norte",
        schoolName: "Academia Norte",
        accountNumberReference: null,
        accountNumberMasked: "***3641"
      })
    ]);

    await expect(
      resolveSchoolFromInboundAttachments({
        attachments: [
          {
            inlineBase64: "base64-image",
            mimeType: "image/png",
            originalFileName: "comprobante.png"
          }
        ]
      })
    ).resolves.toBeNull();
  });

  it("devuelve null cuando el comprobante no trae cuenta destino detectable", async () => {
    mocks.extractReceiptTextFromInput.mockResolvedValue({
      text: "Transferencia recibida Monto $10.000 Banco Estado referencia ABC-123 sin numero de cuenta destino",
      confidence: 0.77
    });

    await expect(
      resolveSchoolFromInboundAttachments({
        attachments: [
          {
            inlineBase64: "base64-image",
            mimeType: "image/png",
            originalFileName: "comprobante.png"
          }
        ]
      })
    ).resolves.toBeNull();
    expect(mocks.bankAccountFindMany).not.toHaveBeenCalled();
  });
});
