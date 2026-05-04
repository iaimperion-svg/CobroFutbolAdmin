import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlatformInvoiceStatus } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  schoolFindUnique: vi.fn(),
  platformInvoiceFindUnique: vi.fn(),
  platformInvoiceCreate: vi.fn(),
  platformInvoiceUpdate: vi.fn(),
  platformInvoiceFindFirst: vi.fn(),
  platformPaymentCreate: vi.fn(),
  platformPaymentFindMany: vi.fn()
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    school: {
      findUnique: mocks.schoolFindUnique
    },
    platformInvoice: {
      findUnique: mocks.platformInvoiceFindUnique,
      create: mocks.platformInvoiceCreate,
      update: mocks.platformInvoiceUpdate,
      findFirst: mocks.platformInvoiceFindFirst
    },
    platformPayment: {
      create: mocks.platformPaymentCreate,
      findMany: mocks.platformPaymentFindMany
    }
  }
}));

import {
  ensurePlatformInvoiceForSchool,
  recordPlatformInvoicePayment
} from "@/server/services/backoffice-master.service";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.schoolFindUnique.mockResolvedValue({
    id: "school-1",
    name: "MAUROP FC",
    slug: "maurop-fc",
    onboardingRequests: [
      {
        plan: "SEMILLERO",
        status: "ACTIVE"
      }
    ]
  });
  mocks.platformInvoiceFindUnique.mockResolvedValue(null);
  mocks.platformInvoiceCreate.mockResolvedValue({ id: "platform-invoice-1" });
  mocks.platformInvoiceUpdate.mockResolvedValue({ id: "platform-invoice-1" });
});

describe("backoffice master platform billing", () => {
  it("emite la mensualidad CobroFutbol del periodo para una escuela activa", async () => {
    const result = await ensurePlatformInvoiceForSchool({
      schoolId: "school-1",
      periodLabel: "2099-04"
    });

    expect(result).toEqual({
      invoiceId: "platform-invoice-1",
      schoolName: "MAUROP FC",
      schoolSlug: "maurop-fc",
      periodLabel: "2099-04",
      created: true
    });
    expect(mocks.platformInvoiceCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          schoolId: "school-1",
          periodLabel: "2099-04",
          plan: "SEMILLERO",
          expectedAmountCents: 2999000,
          outstandingCents: 2999000,
          status: PlatformInvoiceStatus.PENDING
        })
      })
    );
  });

  it("recalcula una factura existente respetando pagos parciales", async () => {
    mocks.schoolFindUnique.mockResolvedValue({
      id: "school-1",
      name: "MAUROP FC",
      slug: "maurop-fc",
      onboardingRequests: [
        {
          plan: "ACADEMIA",
          status: "ACTIVE"
        }
      ]
    });
    mocks.platformInvoiceFindUnique.mockResolvedValue({
      id: "platform-invoice-1",
      payments: [
        {
          amountCents: 1000000,
          paidAt: new Date("2099-04-08T12:00:00.000Z")
        }
      ]
    });

    const result = await ensurePlatformInvoiceForSchool({
      schoolId: "school-1",
      periodLabel: "2099-04"
    });

    expect(result.created).toBe(false);
    expect(mocks.platformInvoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "platform-invoice-1" },
        data: expect.objectContaining({
          plan: "ACADEMIA",
          expectedAmountCents: 5999000,
          outstandingCents: 4999000,
          status: PlatformInvoiceStatus.PARTIALLY_PAID,
          paidAt: null
        })
      })
    );
  });

  it("registra un pago real y marca la mensualidad como pagada cuando cubre el saldo", async () => {
    const paidAt = new Date("2099-04-09T12:00:00.000Z");
    mocks.platformInvoiceFindFirst.mockResolvedValue({
      id: "platform-invoice-1",
      schoolId: "school-1",
      periodLabel: "2099-04",
      expectedAmountCents: 2999000,
      dueAt: new Date("2099-04-10T09:00:00.000Z"),
      school: {
        name: "MAUROP FC",
        slug: "maurop-fc"
      }
    });
    mocks.platformPaymentFindMany.mockResolvedValue([
      {
        amountCents: 2999000,
        paidAt
      }
    ]);

    const result = await recordPlatformInvoicePayment({
      schoolId: "school-1",
      invoiceId: "platform-invoice-1",
      amountCents: 2999000,
      paidAt,
      receiptReference: "TRX-PLATFORM-1",
      notes: "Pago completo abril"
    });

    expect(result).toEqual({
      schoolName: "MAUROP FC",
      schoolSlug: "maurop-fc",
      periodLabel: "2099-04",
      amountCents: 2999000
    });
    expect(mocks.platformPaymentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          schoolId: "school-1",
          platformInvoiceId: "platform-invoice-1",
          amountCents: 2999000,
          receiptReference: "TRX-PLATFORM-1",
          notes: "Pago completo abril"
        })
      })
    );
    expect(mocks.platformInvoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "platform-invoice-1" },
        data: expect.objectContaining({
          outstandingCents: 0,
          status: PlatformInvoiceStatus.PAID,
          paidAt
        })
      })
    );
  });
});
