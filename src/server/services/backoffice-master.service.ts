import {
  ChargeStatus,
  OnboardingPlan,
  OnboardingReceiptStatus,
  OnboardingRequestStatus,
  PaymentStatus,
  PlatformInvoiceStatus,
  ReceiptStatus,
  ReviewTaskStatus,
  SchoolStatus
} from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { AppError } from "@/server/http/errors";

const OPEN_REVIEW_STATUSES = [ReviewTaskStatus.OPEN, ReviewTaskStatus.IN_PROGRESS] as const;
const OPEN_ONBOARDING_STATUSES = [
  OnboardingRequestStatus.PENDING_PAYMENT,
  OnboardingRequestStatus.TELEGRAM_LINKED,
  OnboardingRequestStatus.RECEIPT_RECEIVED,
  OnboardingRequestStatus.UNDER_REVIEW,
  OnboardingRequestStatus.APPROVED_PENDING_ACTIVATION
] as const;
const APPROVED_ONBOARDING_RECEIPT_STATUSES = [OnboardingReceiptStatus.APPROVED] as const;
const OPEN_PLATFORM_INVOICE_STATUSES = [
  PlatformInvoiceStatus.PENDING,
  PlatformInvoiceStatus.PARTIALLY_PAID,
  PlatformInvoiceStatus.OVERDUE
] as const;
const PLATFORM_MONTHLY_PLAN_CENTS = {
  [OnboardingPlan.SEMILLERO]: 2_999_000,
  [OnboardingPlan.ACADEMIA]: 5_999_000,
  [OnboardingPlan.CLUB_PRO]: 8_999_000
} satisfies Record<OnboardingPlan, number>;

export function getOnboardingPlanLabel(plan: OnboardingPlan) {
  switch (plan) {
    case OnboardingPlan.SEMILLERO:
      return "Semillero";
    case OnboardingPlan.ACADEMIA:
      return "Academia";
    case OnboardingPlan.CLUB_PRO:
      return "Club Pro";
  }
}

export function getPlatformInvoiceStatusLabel(status: PlatformInvoiceStatus) {
  switch (status) {
    case PlatformInvoiceStatus.PENDING:
      return "Pendiente";
    case PlatformInvoiceStatus.PARTIALLY_PAID:
      return "Abonada";
    case PlatformInvoiceStatus.PAID:
      return "Pagada";
    case PlatformInvoiceStatus.OVERDUE:
      return "Vencida";
    case PlatformInvoiceStatus.CANCELED:
      return "Cancelada";
  }
}

export function getPlatformMonthlyAmountCents(plan: OnboardingPlan) {
  return PLATFORM_MONTHLY_PLAN_CENTS[plan] ?? 0;
}

function isOpenOnboardingStatus(status: OnboardingRequestStatus | null | undefined) {
  return (
    status === OnboardingRequestStatus.PENDING_PAYMENT ||
    status === OnboardingRequestStatus.TELEGRAM_LINKED ||
    status === OnboardingRequestStatus.RECEIPT_RECEIVED ||
    status === OnboardingRequestStatus.UNDER_REVIEW ||
    status === OnboardingRequestStatus.APPROVED_PENDING_ACTIVATION
  );
}

function mapBySchoolId<T extends { schoolId: string }>(rows: T[], readValue: (row: T) => number) {
  return new Map(rows.map((row) => [row.schoolId, readValue(row)]));
}

function getCurrentPeriodLabel(now: Date) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getWindowStart(now: Date, days: number) {
  const value = new Date(now);
  value.setDate(value.getDate() - days);
  return value;
}

function parsePeriodLabel(periodLabel: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(periodLabel.trim());
  if (!match) {
    throw new AppError("El periodo debe venir con formato YYYY-MM.", 400);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new AppError("El periodo solicitado no es valido.", 400);
  }

  return { year, monthIndex: month - 1 };
}

function getPlatformIssuedAt(periodLabel: string) {
  const { year, monthIndex } = parsePeriodLabel(periodLabel);
  return new Date(year, monthIndex, 1, 9, 0, 0, 0);
}

function getPlatformDueAt(periodLabel: string) {
  const { year, monthIndex } = parsePeriodLabel(periodLabel);
  return new Date(year, monthIndex, 10, 9, 0, 0, 0);
}

function isSchoolSetupComplete(school: {
  operationsEmail: string | null;
  setupCompletedAt: Date | null;
  bankAccounts: Array<{ id: string }>;
}) {
  return Boolean(school.operationsEmail && school.bankAccounts.length > 0 && school.setupCompletedAt);
}

function isPlatformBillingActive(onboarding: { status: OnboardingRequestStatus; plan: OnboardingPlan } | null) {
  return onboarding?.status === OnboardingRequestStatus.ACTIVE;
}

function readPlatformPaidAmountCents(payments: Array<{ amountCents: number }>) {
  return payments.reduce((total, payment) => total + payment.amountCents, 0);
}

function resolvePlatformInvoiceStatus(input: {
  expectedAmountCents: number;
  paidAmountCents: number;
  dueAt: Date;
  now: Date;
}) {
  const outstandingCents = Math.max(input.expectedAmountCents - input.paidAmountCents, 0);

  if (outstandingCents <= 0) {
    return PlatformInvoiceStatus.PAID;
  }

  if (input.dueAt.getTime() < input.now.getTime()) {
    return PlatformInvoiceStatus.OVERDUE;
  }

  if (input.paidAmountCents > 0) {
    return PlatformInvoiceStatus.PARTIALLY_PAID;
  }

  return PlatformInvoiceStatus.PENDING;
}

function readPlatformInvoiceMetrics(
  input: {
    expectedAmountCents: number;
    dueAt: Date;
    payments: Array<{ amountCents: number; paidAt: Date }>;
  },
  now = new Date()
) {
  const paidAmountCents = readPlatformPaidAmountCents(input.payments);
  const outstandingCents = Math.max(input.expectedAmountCents - paidAmountCents, 0);
  const latestPaidAt =
    input.payments.length > 0
      ? input.payments
          .slice()
          .sort((left, right) => right.paidAt.getTime() - left.paidAt.getTime())[0]?.paidAt ?? null
      : null;

  return {
    paidAmountCents,
    outstandingCents,
    latestPaidAt,
    status: resolvePlatformInvoiceStatus({
      expectedAmountCents: input.expectedAmountCents,
      paidAmountCents,
      dueAt: input.dueAt,
      now
    })
  };
}

function readSchoolAttentionScore(input: {
  setupComplete: boolean;
  openReviews: number;
  outstandingCents: number;
  onboardingStatus: OnboardingRequestStatus | null;
  recentReceipts: number;
  platformInvoiceStatus: PlatformInvoiceStatus | null;
  platformInvoiceMissing: boolean;
}) {
  let score = 0;

  if (!input.setupComplete) {
    score += 5;
  }

  if (input.openReviews > 0) {
    score += 4;
  }

  if (input.platformInvoiceMissing) {
    score += 3;
  } else if (input.platformInvoiceStatus === PlatformInvoiceStatus.OVERDUE) {
    score += 4;
  } else if (
    input.platformInvoiceStatus === PlatformInvoiceStatus.PENDING ||
    input.platformInvoiceStatus === PlatformInvoiceStatus.PARTIALLY_PAID
  ) {
    score += 2;
  }

  if (input.outstandingCents > 0) {
    score += 2;
  }

  if (isOpenOnboardingStatus(input.onboardingStatus)) {
    score += 3;
  }

  if (input.recentReceipts === 0) {
    score += 1;
  }

  return score;
}

function readSchoolHealthTone(input: {
  setupComplete: boolean;
  openReviews: number;
  onboardingStatus: OnboardingRequestStatus | null;
  recentReceipts: number;
  platformInvoiceStatus: PlatformInvoiceStatus | null;
  platformInvoiceMissing: boolean;
}) {
  if (
    !input.setupComplete ||
    input.openReviews > 0 ||
    input.platformInvoiceStatus === PlatformInvoiceStatus.OVERDUE
  ) {
    return "danger" as const;
  }

  if (
    input.platformInvoiceMissing ||
    input.platformInvoiceStatus === PlatformInvoiceStatus.PENDING ||
    input.platformInvoiceStatus === PlatformInvoiceStatus.PARTIALLY_PAID ||
    isOpenOnboardingStatus(input.onboardingStatus)
  ) {
    return "warning" as const;
  }

  if (input.recentReceipts > 0) {
    return "success" as const;
  }

  return "neutral" as const;
}

function readSchoolHealthLabel(input: {
  setupComplete: boolean;
  openReviews: number;
  onboardingStatus: OnboardingRequestStatus | null;
  recentReceipts: number;
  platformInvoiceStatus: PlatformInvoiceStatus | null;
  platformInvoiceMissing: boolean;
}) {
  if (!input.setupComplete) {
    return "Falta setup";
  }

  if (input.openReviews > 0) {
    return "Con revision manual";
  }

  if (input.platformInvoiceStatus === PlatformInvoiceStatus.OVERDUE) {
    return "Cobro CF vencido";
  }

  if (input.platformInvoiceMissing) {
    return "Cobro CF sin emitir";
  }

  if (
    input.platformInvoiceStatus === PlatformInvoiceStatus.PENDING ||
    input.platformInvoiceStatus === PlatformInvoiceStatus.PARTIALLY_PAID
  ) {
    return "Cobro CF pendiente";
  }

  if (input.onboardingStatus === OnboardingRequestStatus.APPROVED_PENDING_ACTIVATION) {
    return "Pendiente de activacion";
  }

  if (isOpenOnboardingStatus(input.onboardingStatus)) {
    return "Ingreso en curso";
  }

  if (input.recentReceipts > 0) {
    return "Operando";
  }

  return "Sin movimiento reciente";
}

export function getOnboardingStatusLabel(status: OnboardingRequestStatus) {
  switch (status) {
    case OnboardingRequestStatus.PENDING_PAYMENT:
      return "Pendiente de pago";
    case OnboardingRequestStatus.TELEGRAM_LINKED:
      return "Telegram vinculado";
    case OnboardingRequestStatus.RECEIPT_RECEIVED:
      return "Comprobante recibido";
    case OnboardingRequestStatus.UNDER_REVIEW:
      return "En revision";
    case OnboardingRequestStatus.APPROVED_PENDING_ACTIVATION:
      return "Aprobada, falta activacion";
    case OnboardingRequestStatus.ACTIVE:
      return "Activa";
    case OnboardingRequestStatus.REJECTED:
      return "Rechazada";
    case OnboardingRequestStatus.EXPIRED:
      return "Expirada";
    case OnboardingRequestStatus.CANCELED:
      return "Cancelada";
  }
}

export function getReceiptStatusLabel(status: ReceiptStatus) {
  switch (status) {
    case ReceiptStatus.RECEIVED:
      return "Recibido";
    case ReceiptStatus.PROCESSING:
      return "Procesando";
    case ReceiptStatus.MATCHED:
      return "Con match";
    case ReceiptStatus.AUTO_RECONCILED:
      return "Auto conciliado";
    case ReceiptStatus.AWAITING_PAYER_REPLY:
      return "Esperando respuesta";
    case ReceiptStatus.MANUAL_REVIEW:
      return "Revision manual";
    case ReceiptStatus.REJECTED:
      return "Rechazado";
    case ReceiptStatus.FAILED:
      return "Fallido";
  }
}

async function syncPlatformInvoiceForSchool(schoolId: string, periodLabel: string) {
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: {
      id: true,
      name: true,
      slug: true,
      onboardingRequests: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          plan: true,
          status: true
        }
      }
    }
  });

  if (!school) {
    throw new AppError("No encontramos la escuela para emitir la mensualidad CobroFutbol.", 404);
  }

  const latestOnboarding = school.onboardingRequests[0] ?? null;
  if (!latestOnboarding || latestOnboarding.status !== OnboardingRequestStatus.ACTIVE) {
    throw new AppError("La escuela todavia no tiene un plan activo para cobrar mensualidad CobroFutbol.", 400);
  }

  const expectedAmountCents = getPlatformMonthlyAmountCents(latestOnboarding.plan);
  if (expectedAmountCents <= 0) {
    throw new AppError("No pudimos determinar la mensualidad CobroFutbol del plan activo.", 400);
  }

  const issuedAt = getPlatformIssuedAt(periodLabel);
  const dueAt = getPlatformDueAt(periodLabel);
  const existingInvoice = await prisma.platformInvoice.findUnique({
    where: {
      schoolId_periodLabel: {
        schoolId,
        periodLabel
      }
    },
    select: {
      id: true,
      payments: {
        select: {
          amountCents: true,
          paidAt: true
        }
      }
    }
  });

  const metrics = readPlatformInvoiceMetrics(
    {
      expectedAmountCents,
      dueAt,
      payments: existingInvoice?.payments ?? []
    },
    new Date()
  );


  if (existingInvoice) {
    const invoice = await prisma.platformInvoice.update({
      where: { id: existingInvoice.id },
      data: {
        plan: latestOnboarding.plan,
        expectedAmountCents,
        outstandingCents: metrics.outstandingCents,
        status: metrics.status,
        issuedAt,
        dueAt,
        paidAt: metrics.status === PlatformInvoiceStatus.PAID ? metrics.latestPaidAt : null
      },
      select: {
        id: true
      }
    });

    return {
      invoiceId: invoice.id,
      schoolName: school.name,
      schoolSlug: school.slug,
      periodLabel,
      created: false
    };
  }

  const invoice = await prisma.platformInvoice.create({
    data: {
      schoolId,
      periodLabel,
      plan: latestOnboarding.plan,
      expectedAmountCents,
      outstandingCents: metrics.outstandingCents,
      status: metrics.status,
      issuedAt,
      dueAt,
      paidAt: metrics.status === PlatformInvoiceStatus.PAID ? metrics.latestPaidAt : null
    },
    select: {
      id: true
    }
  });

  return {
    invoiceId: invoice.id,
    schoolName: school.name,
    schoolSlug: school.slug,
    periodLabel,
    created: true
  };
}

export async function ensureCurrentPlatformInvoices() {
  const now = new Date();
  const periodLabel = getCurrentPeriodLabel(now);
  const activeRequests = await prisma.onboardingRequest.findMany({
    where: {
      status: OnboardingRequestStatus.ACTIVE,
      schoolId: {
        not: null
      }
    },
    select: {
      schoolId: true
    }
  });

  let createdCount = 0;
  let updatedCount = 0;

  for (const request of activeRequests) {
    const result = await syncPlatformInvoiceForSchool(request.schoolId as string, periodLabel);
    if (result.created) {
      createdCount += 1;
    } else {
      updatedCount += 1;
    }
  }

  return {
    periodLabel,
    createdCount,
    updatedCount,
    totalCount: activeRequests.length
  };
}

export async function ensurePlatformInvoiceForSchool(input: { schoolId: string; periodLabel?: string }) {
  const periodLabel = input.periodLabel?.trim() || getCurrentPeriodLabel(new Date());
  return syncPlatformInvoiceForSchool(input.schoolId, periodLabel);
}

export async function recordPlatformInvoicePayment(input: {
  schoolId: string;
  invoiceId: string;
  amountCents: number;
  paidAt: Date;
  receiptReference?: string;
  notes?: string;
}) {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new AppError("Ingresa un monto valido para registrar el pago CobroFutbol.", 400);
  }

  if (Number.isNaN(input.paidAt.getTime())) {
    throw new AppError("La fecha del pago CobroFutbol no es valida.", 400);
  }

  const invoice = await prisma.platformInvoice.findFirst({
    where: {
      id: input.invoiceId,
      schoolId: input.schoolId
    },
    select: {
      id: true,
      schoolId: true,
      periodLabel: true,
      expectedAmountCents: true,
      dueAt: true,
      school: {
        select: {
          name: true,
          slug: true
        }
      }
    }
  });

  if (!invoice) {
    throw new AppError("No encontramos la factura CobroFutbol de esa escuela.", 404);
  }

  await prisma.platformPayment.create({
    data: {
      schoolId: invoice.schoolId,
      platformInvoiceId: invoice.id,
      amountCents: input.amountCents,
      paidAt: input.paidAt,
      receiptReference: input.receiptReference?.trim() || null,
      notes: input.notes?.trim() || null
    }
  });

  const payments = await prisma.platformPayment.findMany({
    where: {
      platformInvoiceId: invoice.id
    },
    select: {
      amountCents: true,
      paidAt: true
    }
  });

  const metrics = readPlatformInvoiceMetrics(
    {
      expectedAmountCents: invoice.expectedAmountCents,
      dueAt: invoice.dueAt,
      payments
    },
    new Date()
  );

  await prisma.platformInvoice.update({
    where: { id: invoice.id },
    data: {
      outstandingCents: metrics.outstandingCents,
      status: metrics.status,
      paidAt: metrics.status === PlatformInvoiceStatus.PAID ? metrics.latestPaidAt : null
    }
  });

  return {
    schoolName: invoice.school.name,
    schoolSlug: invoice.school.slug,
    periodLabel: invoice.periodLabel,
    amountCents: input.amountCents
  };
}

export async function getBackofficeMasterSnapshot() {
  const now = new Date();
  const currentPeriodLabel = getCurrentPeriodLabel(now);
  const receiptsWindowStart = getWindowStart(now, 7);
  const revenueWindowStart = getWindowStart(now, 30);

  const [
    schools,
    openReviewsBySchool,
    outstandingBySchool,
    currentOutstandingBySchool,
    activeStudentsBySchool,
    recentReceiptsBySchool,
    onboardingCounts,
    openOnboardingCount,
    receiptsLast7Days,
    autoReceiptsLast30Days,
    allReceiptsLast30Days,
    collectedLast30Days,
    approvedOnboardingRevenue,
    approvedOnboardingRevenueLast30Days,
    pendingOnboardingRevenue,
    activePlatformPlans,
    currentPlatformInvoicesAggregate,
    currentPlatformOpenInvoicesCount,
    overduePlatformInvoicesCount,
    platformPaymentsAggregate,
    platformPaymentsLast30Days
  ] = await Promise.all([
    prisma.school.findMany({
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        operationsEmail: true,
        setupCompletedAt: true,
        createdAt: true,
        updatedAt: true,
        bankAccounts: {
          where: { isDefault: true },
          orderBy: { updatedAt: "desc" },
          take: 1,
          select: {
            id: true,
            bankName: true,
            accountType: true,
            accountNumberMasked: true
          }
        },
        onboardingRequests: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            publicCode: true,
            plan: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            approvedAt: true,
            activatedAt: true
          }
        },
        receipts: {
          orderBy: { receivedAt: "desc" },
          take: 1,
          select: {
            id: true,
            status: true,
            receivedAt: true,
            extractedAmountCents: true
          }
        },
        platformInvoices: {
          where: {
            periodLabel: currentPeriodLabel
          },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            periodLabel: true,
            plan: true,
            expectedAmountCents: true,
            outstandingCents: true,
            status: true,
            dueAt: true,
            paidAt: true
          }
        },
        _count: {
          select: {
            students: true,
            payments: true,
            receipts: true
          }
        }
      }
    }),

    prisma.reviewTask.groupBy({
      by: ["schoolId"],
      where: {
        status: {
          in: [...OPEN_REVIEW_STATUSES]
        }
      },
      _count: {
        _all: true
      }
    }),
    prisma.charge.groupBy({
      by: ["schoolId"],
      where: {
        status: {
          not: ChargeStatus.CANCELED
        }
      },
      _sum: {
        outstandingCents: true
      }
    }),
    prisma.charge.groupBy({
      by: ["schoolId"],
      where: {
        periodLabel: currentPeriodLabel,
        status: {
          not: ChargeStatus.CANCELED
        }
      },
      _sum: {
        outstandingCents: true
      }
    }),
    prisma.student.groupBy({
      by: ["schoolId"],
      where: {
        active: true
      },
      _count: {
        _all: true
      }
    }),
    prisma.receipt.groupBy({
      by: ["schoolId"],
      where: {
        receivedAt: {
          gte: receiptsWindowStart
        }
      },
      _count: {
        _all: true
      }
    }),
    prisma.onboardingRequest.groupBy({
      by: ["status"],
      _count: {
        _all: true
      }
    }),
    prisma.onboardingRequest.count({
      where: {
        status: {
          in: [...OPEN_ONBOARDING_STATUSES]
        }
      }
    }),
    prisma.receipt.count({
      where: {
        receivedAt: {
          gte: receiptsWindowStart
        }
      }
    }),
    prisma.receipt.count({
      where: {
        receivedAt: {
          gte: revenueWindowStart
        },
        status: ReceiptStatus.AUTO_RECONCILED
      }
    }),
    prisma.receipt.count({
      where: {
        receivedAt: {
          gte: revenueWindowStart
        }
      }
    }),
    prisma.payment.aggregate({
      _sum: {
        amountCents: true
      },
      where: {
        status: PaymentStatus.RECONCILED,
        OR: [
          {
            paidAt: {
              gte: revenueWindowStart
            }
          },
          {
            paidAt: null,
            createdAt: {
              gte: revenueWindowStart
            }
          }
        ]
      }
    }),
    prisma.onboardingPaymentReceipt.aggregate({
      _sum: {
        extractedAmountCents: true
      },
      _count: {
        _all: true
      },
      where: {
        status: {
          in: [...APPROVED_ONBOARDING_RECEIPT_STATUSES]
        }
      }
    }),
    prisma.onboardingPaymentReceipt.aggregate({
      _sum: {
        extractedAmountCents: true
      },
      _count: {
        _all: true
      },
      where: {
        status: {
          in: [...APPROVED_ONBOARDING_RECEIPT_STATUSES]
        },
        reviewedAt: {
          gte: revenueWindowStart
        }
      }
    }),
    prisma.onboardingRequest.aggregate({
      _sum: {
        expectedAmountCents: true
      },
      _count: {
        _all: true
      },
      where: {
        status: {
          in: [...OPEN_ONBOARDING_STATUSES]
        }
      }
    }),
    prisma.onboardingRequest.findMany({
      where: {
        status: OnboardingRequestStatus.ACTIVE,
        schoolId: {
          not: null
        }
      },
      select: {
        plan: true
      }
    }),
    prisma.platformInvoice.aggregate({
      _sum: {
        expectedAmountCents: true,
        outstandingCents: true
      },
      _count: {
        _all: true
      },
      where: {
        periodLabel: currentPeriodLabel,
        status: {
          not: PlatformInvoiceStatus.CANCELED
        }
      }
    }),
    prisma.platformInvoice.count({
      where: {
        periodLabel: currentPeriodLabel,
        status: {
          in: [...OPEN_PLATFORM_INVOICE_STATUSES]
        }
      }
    }),
    prisma.platformInvoice.count({
      where: {
        status: PlatformInvoiceStatus.OVERDUE
      }
    }),
    prisma.platformPayment.aggregate({
      _sum: {
        amountCents: true
      },
      _count: {
        _all: true
      }
    }),
    prisma.platformPayment.aggregate({
      _sum: {
        amountCents: true
      },
      _count: {
        _all: true
      },
      where: {
        paidAt: {
          gte: revenueWindowStart
        }
      }
    })
  ]);

  const openReviewsMap = mapBySchoolId(openReviewsBySchool, (row) => row._count._all);
  const outstandingMap = mapBySchoolId(outstandingBySchool, (row) => row._sum.outstandingCents ?? 0);
  const currentOutstandingMap = mapBySchoolId(currentOutstandingBySchool, (row) => row._sum.outstandingCents ?? 0);
  const activeStudentsMap = mapBySchoolId(activeStudentsBySchool, (row) => row._count._all);
  const recentReceiptsMap = mapBySchoolId(recentReceiptsBySchool, (row) => row._count._all);

  const schoolRows = schools
    .flatMap((school) => {
      const defaultBankAccount = school.bankAccounts[0] ?? null;
      const latestOnboarding = school.onboardingRequests[0] ?? null;
      const latestReceipt = school.receipts[0] ?? null;
      const currentPlatformInvoice = school.platformInvoices[0] ?? null;
      const openReviews = openReviewsMap.get(school.id) ?? 0;
      const outstandingCents = currentOutstandingMap.get(school.id) ?? 0;
      const totalOutstandingCents = outstandingMap.get(school.id) ?? 0;
      const activeStudents = activeStudentsMap.get(school.id) ?? 0;
      const recentReceipts = recentReceiptsMap.get(school.id) ?? 0;
      const setupComplete = isSchoolSetupComplete(school);
      const platformBillingActive = isPlatformBillingActive(latestOnboarding);
      const platformInvoiceMissing = platformBillingActive && !currentPlatformInvoice;
      const platformMonthlyExpectedCents = latestOnboarding ? getPlatformMonthlyAmountCents(latestOnboarding.plan) : 0;
      const hasOperationalFootprint =
        setupComplete ||
        activeStudents > 0 ||
        school._count.payments > 0 ||
        Boolean(latestOnboarding) ||
        Boolean(currentPlatformInvoice);

      if (!hasOperationalFootprint) {
        return [];
      }

      const attentionScore = readSchoolAttentionScore({
        setupComplete,
        openReviews,
        outstandingCents,
        onboardingStatus: latestOnboarding?.status ?? null,
        recentReceipts,
        platformInvoiceStatus: currentPlatformInvoice?.status ?? null,
        platformInvoiceMissing
      });
      const healthTone = readSchoolHealthTone({
        setupComplete,
        openReviews,
        onboardingStatus: latestOnboarding?.status ?? null,
        recentReceipts,
        platformInvoiceStatus: currentPlatformInvoice?.status ?? null,
        platformInvoiceMissing
      });

      return [
        {
          id: school.id,
          name: school.name,
          slug: school.slug,
          status: school.status,
          operationsEmail: school.operationsEmail,
          createdAt: school.createdAt,
          updatedAt: school.updatedAt,
          setupCompletedAt: school.setupCompletedAt,
          setupComplete,
          defaultBankAccount,
          latestOnboarding,
          latestReceipt,
          currentPlatformInvoice,
          platformBillingActive,
          platformInvoiceMissing,
          platformMonthlyExpectedCents,
          totalStudents: school._count.students,
          activeStudents,
          totalPayments: school._count.payments,
          totalReceipts: school._count.receipts,
          openReviews,
          outstandingCents,
          totalOutstandingCents,
          currentPeriodLabel,
          recentReceipts,
          attentionScore,
          healthTone,
          healthLabel: readSchoolHealthLabel({
            setupComplete,
            openReviews,
            onboardingStatus: latestOnboarding?.status ?? null,
            recentReceipts,
            platformInvoiceStatus: currentPlatformInvoice?.status ?? null,
            platformInvoiceMissing
          })
        }
      ];
    })
    .sort((left, right) => {
      if (right.attentionScore !== left.attentionScore) {
        return right.attentionScore - left.attentionScore;
      }

      return right.updatedAt.getTime() - left.updatedAt.getTime();
    });

  const configuredSchools = schoolRows.filter((school) => school.setupComplete).length;
  const schoolsWithRecentReceipts = schoolRows.filter((school) => school.recentReceipts > 0).length;
  const schoolsNeedingAttention = schoolRows.filter((school) => school.attentionScore > 0).length;
  const activeSchools = schoolRows.filter((school) => school.status === SchoolStatus.ACTIVE).length;
  const totalOpenReviews = schoolRows.reduce((total, school) => total + school.openReviews, 0);
  const totalStudents = schoolRows.reduce((total, school) => total + school.totalStudents, 0);
  const totalOutstandingCents = schoolRows.reduce((total, school) => total + school.outstandingCents, 0);
  const platformMonthlyExpectedCents = activePlatformPlans.reduce(
    (total, request) => total + getPlatformMonthlyAmountCents(request.plan),
    0
  );
  const platformPlanMix = Object.values(OnboardingPlan).map((plan) => ({
    plan,
    label: getOnboardingPlanLabel(plan),
    activeSchools: activePlatformPlans.filter((request) => request.plan === plan).length,
    monthlyAmountCents: getPlatformMonthlyAmountCents(plan)
  }));
  const currentPlatformOutstandingCents = currentPlatformInvoicesAggregate._sum.outstandingCents ?? 0;
  const currentPlatformBilledCents = currentPlatformInvoicesAggregate._sum.expectedAmountCents ?? 0;
  const currentPlatformCollectedCents = Math.max(currentPlatformBilledCents - currentPlatformOutstandingCents, 0);
  const missingPlatformInvoicesCount = schoolRows.filter((school) => school.platformInvoiceMissing).length;

  const onboardingPipeline = onboardingCounts.map((row) => ({
    status: row.status,
    label: getOnboardingStatusLabel(row.status),
    count: row._count._all
  }));

  return {
    generatedAt: now,
    currentPeriodLabel,
    overview: {
      totalSchools: schoolRows.length,
      activeSchools,
      configuredSchools,
      schoolsWithRecentReceipts,
      schoolsNeedingAttention,
      pendingOnboarding: openOnboardingCount,
      openReviews: totalOpenReviews,
      totalStudents,
      totalOutstandingCents,
      receiptsLast7Days,
      collectedLast30DaysCents: collectedLast30Days._sum.amountCents ?? 0,
      autoReconciliationRateLast30Days:
        allReceiptsLast30Days === 0 ? 0 : Math.round((autoReceiptsLast30Days / allReceiptsLast30Days) * 100)
    },
    platformRevenue: {
      onboardingCollectedCents: approvedOnboardingRevenue._sum.extractedAmountCents ?? 0,
      onboardingCollectedLast30DaysCents: approvedOnboardingRevenueLast30Days._sum.extractedAmountCents ?? 0,
      onboardingCollectedCount: approvedOnboardingRevenue._count._all,
      onboardingCollectedLast30DaysCount: approvedOnboardingRevenueLast30Days._count._all,
      onboardingPipelineExpectedCents: pendingOnboardingRevenue._sum.expectedAmountCents ?? 0,
      onboardingPipelineCount: pendingOnboardingRevenue._count._all,
      platformMonthlyExpectedCents,
      platformAnnualRunRateCents: platformMonthlyExpectedCents * 12,
      activePaidSchools: activePlatformPlans.length,
      planMix: platformPlanMix,
      platformCollectedTotalCents: platformPaymentsAggregate._sum.amountCents ?? 0,
      platformCollectedTotalCount: platformPaymentsAggregate._count._all,
      platformCollectedLast30DaysCents: platformPaymentsLast30Days._sum.amountCents ?? 0,
      platformCollectedLast30DaysCount: platformPaymentsLast30Days._count._all,
      currentPlatformBilledCents,
      currentPlatformCollectedCents,
      currentPlatformOutstandingCents,
      currentOpenPlatformInvoicesCount: currentPlatformOpenInvoicesCount,
      overduePlatformInvoicesCount,
      missingPlatformInvoicesCount,
      currentPeriodInvoicedSchools: currentPlatformInvoicesAggregate._count._all
    },
    onboardingPipeline,
    schools: schoolRows
  };
}

export async function getBackofficeMasterSchoolDetail(identifier: string) {
  const now = new Date();
  const currentPeriodLabel = getCurrentPeriodLabel(now);
  const receiptsWindowStart = getWindowStart(now, 7);
  const revenueWindowStart = getWindowStart(now, 30);


  const school = await prisma.school.findFirst({
    where: {
      OR: [{ id: identifier }, { slug: identifier }]
    },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      operationsEmail: true,
      setupCompletedAt: true,
      createdAt: true,
      updatedAt: true,
      bankAccounts: {
        orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
        select: {
          id: true,
          bankName: true,
          accountType: true,
          accountNumberMasked: true,
          accountNumberReference: true,
          isDefault: true,
          updatedAt: true
        }
      },
      onboardingRequests: {
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          publicCode: true,
          plan: true,
          expectedAmountCents: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          approvedAt: true,
          activatedAt: true,
          receipts: {
            where: {
              status: {
                in: [...APPROVED_ONBOARDING_RECEIPT_STATUSES]
              }
            },
            select: {
              extractedAmountCents: true
            }
          }
        }
      },
      platformInvoices: {
        orderBy: [{ periodLabel: "desc" }, { createdAt: "desc" }],
        take: 6,
        select: {
          id: true,
          periodLabel: true,
          plan: true,
          expectedAmountCents: true,
          outstandingCents: true,
          status: true,
          issuedAt: true,
          dueAt: true,
          paidAt: true,
          notes: true,
          payments: {
            orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
            take: 6,
            select: {
              id: true,
              amountCents: true,
              paidAt: true,
              receiptReference: true,
              notes: true,
              createdAt: true
            }
          }
        }
      },
      platformPayments: {
        orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
        take: 8,
        select: {
          id: true,
          amountCents: true,
          paidAt: true,
          receiptReference: true,
          notes: true,
          platformInvoice: {
            select: {
              id: true,
              periodLabel: true,
              status: true
            }
          }
        }
      },
      receipts: {
        orderBy: { receivedAt: "desc" },
        take: 8,
        select: {
          id: true,
          status: true,
          receivedAt: true,
          extractedAmountCents: true,
          extractedSenderName: true,
          extractedBankName: true
        }
      },
      payments: {
        orderBy: { createdAt: "desc" },
        take: 8,
        select: {
          id: true,
          status: true,
          amountCents: true,
          paidAt: true,
          createdAt: true,
          senderName: true,
          bankName: true,
          receiptId: true
        }
      },
      reviewTasks: {
        where: {
          status: {
            in: [...OPEN_REVIEW_STATUSES]
          }
        },
        orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
        take: 8,
        select: {
          id: true,
          status: true,
          priority: true,
          reason: true,
          createdAt: true,
          dueAt: true,
          receipt: {
            select: {
              id: true,
              status: true,
              receivedAt: true,
              extractedAmountCents: true
            }
          }
        }
      },
      students: {
        orderBy: { fullName: "asc" },
        select: {
          id: true,
          fullName: true,
          active: true,
          monthlyFeeCents: true,
          notes: true,
          charges: {
            where: {
              periodLabel: currentPeriodLabel,
              status: {
                not: ChargeStatus.CANCELED
              }
            },
            orderBy: { dueDate: "asc" },
            select: {
              id: true,
              description: true,
              periodLabel: true,
              dueDate: true,
              amountCents: true,
              outstandingCents: true,
              status: true
            }
          }
        }
      },
      _count: {
        select: {
          students: true,
          payments: true,
          receipts: true
        }
      }
    }
  });

  if (!school) {
    return null;
  }

  const [
    totalOutstanding,
    futureOutstanding,
    receiptsLast7Days,
    receiptsLast30Days,
    autoReceiptsLast30Days,
    collectedLast30Days,
    unreconciledPayments,
    platformPaymentsTotal,
    platformPaymentsLast30Days,
    platformOpenInvoicesCount
  ] = await Promise.all([
    prisma.charge.aggregate({
      _sum: { outstandingCents: true },
      where: {
        schoolId: school.id,
        status: {
          not: ChargeStatus.CANCELED
        }
      }
    }),
    prisma.charge.aggregate({
      _sum: { outstandingCents: true },
      where: {
        schoolId: school.id,
        periodLabel: {
          gt: currentPeriodLabel
        },
        status: {
          not: ChargeStatus.CANCELED
        }
      }
    }),
    prisma.receipt.count({
      where: {
        schoolId: school.id,
        receivedAt: {
          gte: receiptsWindowStart
        }
      }
    }),
    prisma.receipt.count({
      where: {
        schoolId: school.id,
        receivedAt: {
          gte: revenueWindowStart
        }
      }
    }),
    prisma.receipt.count({
      where: {
        schoolId: school.id,
        receivedAt: {
          gte: revenueWindowStart
        },
        status: ReceiptStatus.AUTO_RECONCILED
      }
    }),
    prisma.payment.aggregate({
      _sum: { amountCents: true },
      where: {
        schoolId: school.id,
        status: PaymentStatus.RECONCILED,
        OR: [
          {
            paidAt: {
              gte: revenueWindowStart
            }
          },
          {
            paidAt: null,
            createdAt: {
              gte: revenueWindowStart
            }
          }
        ]
      }
    }),
    prisma.payment.count({
      where: {
        schoolId: school.id,
        status: PaymentStatus.RECEIVED
      }
    }),
    prisma.platformPayment.aggregate({
      _sum: { amountCents: true },
      where: {
        schoolId: school.id
      }
    }),
    prisma.platformPayment.aggregate({
      _sum: { amountCents: true },
      where: {
        schoolId: school.id,
        paidAt: {
          gte: revenueWindowStart
        }
      }
    }),
    prisma.platformInvoice.count({
      where: {
        schoolId: school.id,
        status: {
          in: [...OPEN_PLATFORM_INVOICE_STATUSES]
        }
      }
    })
  ]);

  const defaultBankAccount = school.bankAccounts.find((account) => account.isDefault) ?? school.bankAccounts[0] ?? null;
  const setupComplete = isSchoolSetupComplete(school);
  const activeStudents = school.students.filter((student) => student.active).length;
  const currentCharges = school.students.flatMap((student) => student.charges);
  const currentBilledCents = currentCharges.reduce((total, charge) => total + charge.amountCents, 0);
  const currentOutstandingCents = currentCharges.reduce((total, charge) => total + charge.outstandingCents, 0);
  const currentCollectedCents = Math.max(currentBilledCents - currentOutstandingCents, 0);
  const currentStudentsWithDebt = school.students.filter((student) =>
    student.charges.some((charge) => charge.outstandingCents > 0)
  ).length;
  const currentStudentsPaid = school.students.filter(
    (student) => student.charges.length > 0 && student.charges.every((charge) => charge.outstandingCents === 0)
  ).length;
  const latestOnboarding = school.onboardingRequests[0] ?? null;
  const currentPlatformInvoice = school.platformInvoices.find((invoice) => invoice.periodLabel === currentPeriodLabel) ?? null;
  const platformBillingActive = isPlatformBillingActive(latestOnboarding);
  const platformInvoiceMissing = platformBillingActive && !currentPlatformInvoice;
  const platformCurrentExpectedCents = currentPlatformInvoice
    ? currentPlatformInvoice.expectedAmountCents
    : latestOnboarding
      ? getPlatformMonthlyAmountCents(latestOnboarding.plan)
      : 0;
  const platformCurrentOutstandingCents = currentPlatformInvoice?.outstandingCents ?? 0;
  const platformCurrentPaidCents = currentPlatformInvoice
    ? Math.max(currentPlatformInvoice.expectedAmountCents - currentPlatformInvoice.outstandingCents, 0)
    : 0;
  const openReviews = school.reviewTasks.length;
  const recentReceipts = receiptsLast7Days;
  const healthTone = readSchoolHealthTone({
    setupComplete,
    openReviews,
    onboardingStatus: latestOnboarding?.status ?? null,
    recentReceipts,
    platformInvoiceStatus: currentPlatformInvoice?.status ?? null,
    platformInvoiceMissing
  });
  const healthLabel = readSchoolHealthLabel({
    setupComplete,
    openReviews,
    onboardingStatus: latestOnboarding?.status ?? null,
    recentReceipts,
    platformInvoiceStatus: currentPlatformInvoice?.status ?? null,
    platformInvoiceMissing
  });
  const attentionScore = readSchoolAttentionScore({
    setupComplete,
    openReviews,
    outstandingCents: currentOutstandingCents,
    onboardingStatus: latestOnboarding?.status ?? null,
    recentReceipts,
    platformInvoiceStatus: currentPlatformInvoice?.status ?? null,
    platformInvoiceMissing
  });
  const alerts = [
    !setupComplete ? "Completar setup operativo y cuenta destino." : null,
    openReviews > 0 ? "Resolver revisiones manuales abiertas." : null,
    currentOutstandingCents > 0 ? "Hay saldo pendiente del mes actual." : null,
    platformInvoiceMissing ? "Falta emitir la mensualidad CobroFutbol del periodo actual." : null,
    currentPlatformInvoice?.status === PlatformInvoiceStatus.OVERDUE
      ? "La mensualidad CobroFutbol del periodo actual esta vencida."
      : null,
    currentPlatformInvoice && currentPlatformInvoice.outstandingCents > 0
      ? "La mensualidad CobroFutbol sigue con saldo pendiente."
      : null,
    recentReceipts === 0 ? "Sin comprobantes recibidos en los ultimos 7 dias." : null,
    unreconciledPayments > 0 ? "Existen pagos recibidos sin conciliacion final." : null
  ].filter((alert): alert is string => Boolean(alert));

  return {
    generatedAt: now,
    currentPeriodLabel,
    school: {
      id: school.id,
      name: school.name,
      slug: school.slug,
      status: school.status,
      operationsEmail: school.operationsEmail,
      setupCompletedAt: school.setupCompletedAt,
      createdAt: school.createdAt,
      updatedAt: school.updatedAt,
      setupComplete,
      defaultBankAccount,
      bankAccounts: school.bankAccounts,
      latestOnboarding,
      onboardingRequests: school.onboardingRequests,
      currentPlatformInvoice,
      platformInvoices: school.platformInvoices,
      platformPayments: school.platformPayments,
      platformBillingActive,
      platformInvoiceMissing,
      platformMonthlyExpectedCents: latestOnboarding ? getPlatformMonthlyAmountCents(latestOnboarding.plan) : 0,
      receipts: school.receipts,
      payments: school.payments,
      reviewTasks: school.reviewTasks,
      students: school.students,
      totalStudents: school._count.students,
      activeStudents,
      totalPayments: school._count.payments,
      totalReceipts: school._count.receipts,
      openReviews,
      recentReceipts,
      attentionScore,
      healthTone,
      healthLabel
    },
    metrics: {
      currentBilledCents,
      currentCollectedCents,
      currentOutstandingCents,
      currentStudentsWithDebt,
      currentStudentsPaid,
      totalOutstandingCents: totalOutstanding._sum.outstandingCents ?? 0,
      futureOutstandingCents: futureOutstanding._sum.outstandingCents ?? 0,
      receiptsLast7Days,
      receiptsLast30Days,
      autoReconciliationRateLast30Days:
        receiptsLast30Days === 0 ? 0 : Math.round((autoReceiptsLast30Days / receiptsLast30Days) * 100),
      collectedLast30DaysCents: collectedLast30Days._sum.amountCents ?? 0,
      unreconciledPayments,
      platformMonthlyExpectedCents: latestOnboarding ? getPlatformMonthlyAmountCents(latestOnboarding.plan) : 0,
      platformAnnualExpectedCents: latestOnboarding ? getPlatformMonthlyAmountCents(latestOnboarding.plan) * 12 : 0,
      onboardingExpectedCents: latestOnboarding?.expectedAmountCents ?? 0,
      onboardingCollectedCents: school.onboardingRequests.reduce(
        (total, request) =>
          total +
          request.receipts.reduce((receiptTotal, receipt) => receiptTotal + (receipt.extractedAmountCents ?? 0), 0),
        0
      ),
      platformCurrentExpectedCents,
      platformCurrentOutstandingCents,
      platformCurrentPaidCents,
      platformCollectedTotalCents: platformPaymentsTotal._sum.amountCents ?? 0,
      platformCollectedLast30DaysCents: platformPaymentsLast30Days._sum.amountCents ?? 0,
      platformOpenInvoicesCount
    },
    alerts
  };
}
