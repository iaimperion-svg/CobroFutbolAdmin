import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  onboardingRequestFindFirst: vi.fn(),
  onboardingRequestFindUnique: vi.fn(),
  onboardingRequestCreate: vi.fn(),
  onboardingRequestUpdate: vi.fn(),
  onboardingPaymentReceiptFindUnique: vi.fn(),
  onboardingPaymentReceiptCreate: vi.fn(),
  onboardingPaymentReceiptUpdate: vi.fn(),
  prismaTransaction: vi.fn(),
  sendTelegramTextMessageWithToken: vi.fn(),
  sendEmail: vi.fn(),
  persistReceiptMedia: vi.fn(),
  extractOnboardingReceiptText: vi.fn()
}));

vi.mock("@/server/config/env", () => ({
  env: {
    APP_URL: "http://localhost:3000",
    TELEGRAM_ENABLED: true,
    TELEGRAM_BOT_TOKEN: "telegram-token",
    TELEGRAM_BOT_USERNAME: "Cobrofutbot",
    ONBOARDING_TELEGRAM_ENABLED: false,
    ONBOARDING_TELEGRAM_BOT_TOKEN: "",
    ONBOARDING_TELEGRAM_BOT_USERNAME: "",
    ONBOARDING_PAYMENT_BANK_NAME: "Banco Estado",
    ONBOARDING_PAYMENT_ACCOUNT_TYPE: "Cuenta Corriente",
    ONBOARDING_PAYMENT_ACCOUNT_NUMBER: "12345678",
    ONBOARDING_PAYMENT_HOLDER_NAME: "Cobro Futbol SpA",
    ONBOARDING_PAYMENT_HOLDER_RUT: "76.123.456-7",
    ONBOARDING_PAYMENT_EMAIL: "pagos@cobrofutbol.cl",
    ONBOARDING_REVIEW_SECRET: "review-secret",
    EMAIL_FROM: "onboarding@cobrofutbol.cl",
    RESEND_API_KEY: "resend-key"
  }
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    $transaction: mocks.prismaTransaction,
    user: {
      findUnique: mocks.userFindUnique
    },
    onboardingRequest: {
      findFirst: mocks.onboardingRequestFindFirst,
      findUnique: mocks.onboardingRequestFindUnique,
      create: mocks.onboardingRequestCreate,
      update: mocks.onboardingRequestUpdate
    },
    onboardingPaymentReceipt: {
      findUnique: mocks.onboardingPaymentReceiptFindUnique,
      create: mocks.onboardingPaymentReceiptCreate,
      update: mocks.onboardingPaymentReceiptUpdate
    }
  }
}));

vi.mock("@/server/services/telegram.service", () => ({
  sendTelegramTextMessageWithToken: mocks.sendTelegramTextMessageWithToken
}));

vi.mock("@/server/services/email.service", () => ({
  sendEmail: mocks.sendEmail
}));

vi.mock("@/server/services/storage.service", () => ({
  persistReceiptMedia: mocks.persistReceiptMedia
}));

vi.mock("@/server/services/ocr.service", () => ({
  extractOnboardingReceiptText: mocks.extractOnboardingReceiptText
}));

import {
  approveOnboardingRequest,
  createOnboardingRequest,
  handleOnboardingTelegramUpdate,
  shouldHandleOnboardingTelegramUpdate
} from "@/server/services/onboarding.service";

describe("onboarding service", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.prismaTransaction.mockImplementation(async (operations: Promise<unknown>[]) => Promise.all(operations));
    mocks.userFindUnique.mockResolvedValue(null);
    mocks.onboardingRequestFindFirst.mockResolvedValue(null);
    mocks.onboardingRequestFindUnique.mockResolvedValue(null);
    mocks.onboardingPaymentReceiptCreate.mockResolvedValue({
      id: "onb-receipt-1"
    });
    mocks.onboardingPaymentReceiptUpdate.mockResolvedValue({});
    mocks.persistReceiptMedia.mockResolvedValue("storage/onboarding/onb-receipt-1.png");
    mocks.extractOnboardingReceiptText.mockResolvedValue({
      text: "Comprobante de Transferencia Scotiabank Monto transferido $39.900 Referencia Pre-calentamiento CobroFutbol - Solicitud PG-UAJENA",
      confidence: 0.91
    });
    mocks.onboardingRequestCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "onb-new",
      schoolId: null,
      createdUserId: null,
      city: null,
      notes: null,
      currency: "CLP",
      telegramChatId: null,
      telegramUserId: null,
      telegramUsername: null,
      status: "PENDING_PAYMENT",
      approvedAt: null,
      rejectedAt: null,
      activatedAt: null,
      expiresAt: null,
      rejectionReason: null,
      createdAt: new Date("2026-04-19T10:00:00.000Z"),
      updatedAt: new Date("2026-04-19T10:00:00.000Z"),
      ...data
    }));
    mocks.onboardingRequestUpdate.mockResolvedValue({});
    mocks.sendEmail.mockResolvedValue({
      delivered: true,
      mode: "email"
    });
  });

  it("envia por correo el enlace del bot al crear la solicitud", async () => {
    const result = await createOnboardingRequest({
      fullName: "Mauro Perez",
      academyName: "Pase Gol",
      email: "mauro@academia.cl",
      phone: "+56912345678",
      city: "Santiago",
      notes: "Alta nueva",
      plan: "SEMILLERO"
    });

    expect(result.instructions.telegramLink).toMatch(
      /^https:\/\/t\.me\/Cobrofutbot\?start=onb_[A-Za-z0-9_-]+$/
    );
    expect(result.instructions.referenceCode).toMatch(/^PG-[A-Z0-9]+$/);
    expect(result.delivery).toEqual({
      delivered: true,
      mode: "email"
    });
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "mauro@academia.cl",
        subject: "Acceso al bot de onboarding de Pase Gol",
        text: expect.stringContaining(result.instructions.telegramLink ?? ""),
        html: expect.stringContaining(result.instructions.referenceCode)
      })
    );
  });

  it("no bloquea la solicitud si falla el envio del correo", async () => {
    mocks.sendEmail.mockRejectedValue(new Error("resend unavailable"));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      const result = await createOnboardingRequest({
        fullName: "Mauro Perez",
        academyName: "Pase Gol",
        email: "mauro@academia.cl",
        phone: "+56912345678",
        city: "Santiago",
        notes: "Alta nueva",
        plan: "SEMILLERO"
      });

      expect(result.request.id).toBe("onb-new");
      expect(result.delivery).toEqual({
        delivered: false,
        mode: "manual"
      });
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("reconoce el codigo publico como senal valida de onboarding", async () => {
    mocks.onboardingRequestFindFirst.mockResolvedValue({
      id: "onb-1",
      publicCode: "PG-HUVTQA",
      status: "PENDING_PAYMENT"
    });

    const shouldHandle = await shouldHandleOnboardingTelegramUpdate({
      externalId: "6001:10",
      externalChatId: "6001",
      externalUserId: "5001",
      senderHandle: "6001",
      senderName: "Mauro",
      senderUsername: "mauro",
      bodyText: "PG-HUVTQA",
      attachments: [],
      rawPayload: {}
    });

    expect(shouldHandle).toBe(true);
    expect(mocks.onboardingRequestFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          publicCode: "PG-HUVTQA"
        })
      })
    );
  });

  it("vincula la solicitud cuando el usuario envia el codigo publico por Telegram", async () => {
    mocks.onboardingRequestFindFirst.mockResolvedValue({
      id: "onb-1",
      publicCode: "PG-HUVTQA",
      status: "PENDING_PAYMENT"
    });

    const result = await handleOnboardingTelegramUpdate({
      externalId: "6001:11",
      externalChatId: "6001",
      externalUserId: "5001",
      senderHandle: "6001",
      senderName: "Mauro",
      senderUsername: "mauro",
      bodyText: "PG-HUVTQA",
      attachments: [],
      rawPayload: {}
    });

    expect(result).toEqual({
      linked: true,
      publicCode: "PG-HUVTQA"
    });
    expect(mocks.onboardingRequestUpdate).toHaveBeenCalledWith({
      where: { id: "onb-1" },
      data: {
        telegramChatId: "6001",
        telegramUserId: "5001",
        telegramUsername: "mauro",
        status: "TELEGRAM_LINKED"
      }
    });
    expect(mocks.sendTelegramTextMessageWithToken).toHaveBeenCalledWith(
      "6001",
      expect.stringContaining("Ya vinculamos tu solicitud PG-HUVTQA"),
      "telegram-token"
    );
  });

  it("responde con instruccion cuando llega /start sin token ni codigo", async () => {
    const result = await handleOnboardingTelegramUpdate({
      externalId: "6001:12",
      externalChatId: "6001",
      externalUserId: "5001",
      senderHandle: "6001",
      senderName: "Mauro",
      senderUsername: "mauro",
      bodyText: "/start",
      attachments: [],
      rawPayload: {}
    });

    expect(result).toEqual({
      ignored: true,
      reason: "start sin token ni codigo"
    });
    expect(mocks.sendTelegramTextMessageWithToken).toHaveBeenCalledWith(
      "6001",
      expect.stringContaining("codigo PG"),
      "telegram-token"
    );
  });

  it("extrae monto del comprobante de onboarding usando OCR de la imagen", async () => {
    mocks.onboardingRequestFindFirst.mockResolvedValue({
      id: "onb-2",
      publicCode: "PG-BNBQAA",
      email: "mauro.moreno.o@gmail.com",
      expectedAmountCents: 3990000,
      status: "TELEGRAM_LINKED"
    });

    const result = await handleOnboardingTelegramUpdate({
      externalId: "6001:13",
      externalChatId: "8603000397",
      externalUserId: "5001",
      senderHandle: "8603000397",
      senderName: "Mauro",
      senderUsername: "mauro",
      bodyText: "",
      attachments: [
        {
          fileUrl: "https://api.telegram.org/file/bot/file_123",
          originalFileName: "pago precalentamiento.png",
          mimeType: "image/png"
        }
      ],
      rawPayload: {}
    });

    expect(result).toEqual({
      receiptId: "onb-receipt-1",
      publicCode: "PG-BNBQAA"
    });
    expect(mocks.persistReceiptMedia).toHaveBeenCalledWith(
      "onb-receipt-1",
      expect.objectContaining({
        originalFileName: "pago precalentamiento.png",
        telegramBotToken: "telegram-token"
      })
    );
    expect(mocks.extractOnboardingReceiptText).toHaveBeenCalledWith(
      "onb-receipt-1",
      expect.objectContaining({
        originalFileName: "pago precalentamiento.png",
        mimeType: "image/png",
        storagePath: "storage/onboarding/onb-receipt-1.png"
      })
    );
    expect(mocks.onboardingPaymentReceiptUpdate).toHaveBeenNthCalledWith(2, {
      where: { id: "onb-receipt-1" },
      data: {
        extractedText:
          "Comprobante de Transferencia Scotiabank Monto transferido $39.900 Referencia Pre-calentamiento CobroFutbol - Solicitud PG-UAJENA",
        extractedAmountCents: 3990000,
        extractionConfidence: 0.91
      }
    });
    expect(mocks.sendTelegramTextMessageWithToken).toHaveBeenNthCalledWith(
      1,
      "8603000397",
      expect.stringContaining("Lo estamos revisando ahora"),
      "telegram-token"
    );
    expect(mocks.sendTelegramTextMessageWithToken).toHaveBeenNthCalledWith(
      2,
      "8603000397",
      expect.stringContaining("Coincide con el valor esperado"),
      "telegram-token"
    );
  });

  it("no deja el flujo a medio camino si falla el OCR del comprobante", async () => {
    mocks.extractOnboardingReceiptText.mockRejectedValue(new Error("ocr unavailable"));
    mocks.onboardingRequestFindFirst.mockResolvedValue({
      id: "onb-3",
      publicCode: "PG-GEEARG",
      email: "director@academia.cl",
      expectedAmountCents: 3990000,
      status: "TELEGRAM_LINKED"
    });
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      const result = await handleOnboardingTelegramUpdate({
        externalId: "6001:14",
        externalChatId: "8603000397",
        externalUserId: "5001",
        senderHandle: "8603000397",
        senderName: "Mauro",
        senderUsername: "mauro",
        bodyText: "",
        attachments: [
          {
            fileUrl: "https://api.telegram.org/file/bot/file_123",
            originalFileName: "telegram-photo-41.jpg",
            mimeType: "image/jpeg"
          }
        ],
        rawPayload: {}
      });

      expect(result).toEqual({
        receiptId: "onb-receipt-1",
        publicCode: "PG-GEEARG"
      });
      expect(mocks.onboardingPaymentReceiptUpdate).toHaveBeenNthCalledWith(2, {
        where: { id: "onb-receipt-1" },
        data: {
          extractedText: undefined,
          extractedAmountCents: undefined,
          extractionConfidence: 0.2,
          metadata: {
            mediaFailure: null,
            extractionFailure: "ocr unavailable"
          }
        }
      });
      expect(mocks.onboardingRequestUpdate).toHaveBeenCalledWith({
        where: { id: "onb-3" },
        data: {
          status: "RECEIPT_RECEIVED",
          telegramUserId: "5001",
          telegramUsername: "mauro",
          telegramChatId: "8603000397"
        }
      });
      expect(mocks.sendTelegramTextMessageWithToken).toHaveBeenNthCalledWith(
        1,
        "8603000397",
        expect.stringContaining("Lo estamos revisando ahora"),
        "telegram-token"
      );
      expect(mocks.sendTelegramTextMessageWithToken).toHaveBeenNthCalledWith(
        2,
        "8603000397",
        expect.stringContaining("no pudimos leer el monto automaticamente"),
        "telegram-token"
      );
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("envia tambien el link de activacion por Telegram al aprobar si existe chat vinculado", async () => {
    const expiresAt = new Date("2026-04-19T18:30:00.000Z");

    mocks.onboardingRequestFindUnique.mockResolvedValue({
      id: "onb-approve-1",
      publicCode: "PG-APR123",
      academyName: "Academia Imperion FC.",
      academySlug: "academia-imperion-fc",
      fullName: "Mauro Moreno",
      email: "mauro.moreno.o@gmail.com",
      phone: "+56930830263",
      expectedAmountCents: 3990000,
      createdUserId: null,
      schoolId: null,
      telegramChatId: "8603000397",
      status: "RECEIPT_RECEIVED",
      receipts: [
        {
          id: "onb-receipt-approve-1"
        }
      ]
    });

    mocks.prismaTransaction.mockImplementation(async (callback: (tx: any) => Promise<unknown>) =>
      callback({
        user: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: "user-approve-1" }),
          update: vi.fn()
        },
        school: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: "school-approve-1" }),
          update: vi.fn()
        },
        permission: {
          upsert: vi.fn().mockImplementation(async ({ where }: { where: { key: string } }) => ({
            id: `perm-${where.key}`,
            key: where.key
          }))
        },
        role: {
          upsert: vi.fn().mockResolvedValue({ id: "role-approve-1" })
        },
        rolePermission: {
          deleteMany: vi.fn().mockResolvedValue({}),
          createMany: vi.fn().mockResolvedValue({})
        },
        userSchoolMembership: {
          upsert: vi.fn().mockResolvedValue({ id: "membership-approve-1" })
        },
        membershipRole: {
          upsert: vi.fn().mockResolvedValue({})
        },
        onboardingActivationToken: {
          updateMany: vi.fn().mockResolvedValue({}),
          create: vi.fn().mockResolvedValue({})
        },
        onboardingPaymentReceipt: {
          update: vi.fn().mockResolvedValue({})
        },
        onboardingRequest: {
          update: vi.fn().mockResolvedValue({})
        }
      })
    );
    mocks.sendEmail.mockResolvedValue({
      delivered: true,
      mode: "email"
    });

    const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(expiresAt.getTime() - 60 * 60 * 1000);

    try {
      const result = await approveOnboardingRequest({
        requestId: "onb-approve-1",
        reviewSecret: "review-secret"
      });

      expect(result.delivery).toEqual({
        delivered: true,
        mode: "email"
      });
      expect(result.telegramDelivery).toEqual({
        delivered: true,
        mode: "telegram"
      });
      expect(mocks.sendTelegramTextMessageWithToken).toHaveBeenCalledWith(
        "8603000397",
        expect.stringContaining(result.activationUrl),
        "telegram-token"
      );
      expect(mocks.sendTelegramTextMessageWithToken).toHaveBeenCalledWith(
        "8603000397",
        expect.stringContaining("ya fue aprobada"),
        "telegram-token"
      );
      expect(mocks.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "mauro.moreno.o@gmail.com",
          subject: "Activa tu cuenta de Academia Imperion FC. en CobroFutbol",
          text: expect.stringContaining("Correo de acceso: mauro.moreno.o@gmail.com"),
          html: expect.stringContaining("Resumen de tu alta")
        })
      );
    } finally {
      dateNowSpy.mockRestore();
    }
  });
});
