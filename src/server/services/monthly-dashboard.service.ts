import { ChargeStatus, PaymentStatus, ReviewTaskStatus } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { sumAmounts } from "@/server/utils/money";

export const MONTHLY_CATEGORY_KEYS = [
  "sub-6",
  "sub-8",
  "sub-10",
  "sub-12",
  "sub-14",
  "sub-16",
  "adultos"
] as const;

type StudentForDashboard = {
  id: string;
  notes: string | null;
  charges: Array<{
    amountCents: number;
    outstandingCents: number;
    dueDate: Date;
  }>;
};

type CategorySummary = {
  key: string;
  label: string;
  mark: string;
  students: number;
  studentsWithMonthlyCharge: number;
  studentsPending: number;
  studentsPaid: number;
  billedCents: number;
  collectedCents: number;
  outstandingCents: number;
  collectionRate: number;
};

function parsePeriodLabel(periodLabel: string) {
  const [yearPart, monthPart] = periodLabel.split("-");
  return {
    year: Number(yearPart),
    month: Number(monthPart)
  };
}

function getPeriodRange(periodLabel: string) {
  const { year, month } = parsePeriodLabel(periodLabel);
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month, 1, 0, 0, 0, 0);
  return { start, end };
}

function formatPeriodLabel(periodLabel: string) {
  const { year, month } = parsePeriodLabel(periodLabel);

  return new Intl.DateTimeFormat("es-CL", {
    month: "long",
    year: "numeric"
  }).format(new Date(year, month - 1, 1));
}

function getStudentCategoryKey(notes: string | null | undefined) {
  const normalized = (notes ?? "").trim();

  if (!normalized) {
    return "sin-categoria";
  }

  return (
    normalized
      .replace(/^categoria\s+/i, "")
      .trim()
      .toLowerCase()
      .replace(/\s*-\s*/g, "-")
      .replace(/\s+/g, " ") || "sin-categoria"
  );
}

function formatCategoryLabel(categoryKey: string) {
  if (categoryKey === "sin-categoria") {
    return "Sin categoria";
  }

  return categoryKey.replace(/\b\w/g, (letter) => letter.toUpperCase()).replace(/-/g, "-");
}

function getCategoryMark(categoryKey: string) {
  if (categoryKey.startsWith("sub-")) {
    return categoryKey.replace("sub-", "");
  }

  if (categoryKey === "adultos") {
    return "AD";
  }

  if (categoryKey === "sin-categoria") {
    return "SC";
  }

  return categoryKey.slice(0, 2).toUpperCase();
}

function readCollectionRate(billedCents: number, collectedCents: number) {
  return billedCents === 0 ? 0 : Math.round((collectedCents / billedCents) * 100);
}

function buildCategorySummaries(students: StudentForDashboard[]) {
  const categories = new Map<string, CategorySummary>();

  for (const key of MONTHLY_CATEGORY_KEYS) {
    categories.set(key, {
      key,
      label: formatCategoryLabel(key),
      mark: getCategoryMark(key),
      students: 0,
      studentsWithMonthlyCharge: 0,
      studentsPending: 0,
      studentsPaid: 0,
      billedCents: 0,
      collectedCents: 0,
      outstandingCents: 0,
      collectionRate: 0
    });
  }

  for (const student of students) {
    const key = getStudentCategoryKey(student.notes);
    const billedCents = sumAmounts(student.charges.map((charge) => charge.amountCents));
    const outstandingCents = sumAmounts(student.charges.map((charge) => charge.outstandingCents));
    const collectedCents = billedCents - outstandingCents;
    const hasMonthlyCharge = student.charges.length > 0;
    const isPending = outstandingCents > 0;
    const isPaid = hasMonthlyCharge && outstandingCents === 0;
    const existing =
      categories.get(key) ?? {
        key,
        label: formatCategoryLabel(key),
        mark: getCategoryMark(key),
        students: 0,
        studentsWithMonthlyCharge: 0,
        studentsPending: 0,
        studentsPaid: 0,
        billedCents: 0,
        collectedCents: 0,
        outstandingCents: 0,
        collectionRate: 0
      };

    existing.students += 1;
    existing.billedCents += billedCents;
    existing.collectedCents += collectedCents;
    existing.outstandingCents += outstandingCents;

    if (hasMonthlyCharge) {
      existing.studentsWithMonthlyCharge += 1;
    }

    if (isPending) {
      existing.studentsPending += 1;
    }

    if (isPaid) {
      existing.studentsPaid += 1;
    }

    existing.collectionRate = readCollectionRate(existing.billedCents, existing.collectedCents);
    categories.set(key, existing);
  }

  const preferredOrder = [...MONTHLY_CATEGORY_KEYS];

  return Array.from(categories.values()).sort((left, right) => {
    const leftIndex = preferredOrder.indexOf(left.key as (typeof MONTHLY_CATEGORY_KEYS)[number]);
    const rightIndex = preferredOrder.indexOf(right.key as (typeof MONTHLY_CATEGORY_KEYS)[number]);

    if (leftIndex !== -1 || rightIndex !== -1) {
      if (leftIndex === -1) {
        return 1;
      }

      if (rightIndex === -1) {
        return -1;
      }

      return leftIndex - rightIndex;
    }

    return left.label.localeCompare(right.label, "es-CL");
  });
}

function buildWeekRanges(periodLabel: string) {
  const { year, month } = parsePeriodLabel(periodLabel);
  const lastDay = new Date(year, month, 0).getDate();
  const weeks: Array<{ label: string; start: Date; end: Date }> = [];

  let cursor = 1;
  let weekNumber = 1;
  while (cursor <= lastDay) {
    const start = new Date(year, month - 1, cursor, 0, 0, 0, 0);
    const endDay = Math.min(cursor + 6, lastDay);
    const end = new Date(year, month - 1, endDay, 23, 59, 59, 999);

    weeks.push({
      label: `Sem ${weekNumber}`,
      start,
      end
    });

    cursor += 7;
    weekNumber += 1;
  }

  return weeks;
}

function getReferenceWeekRange(periodLabel: string) {
  const { year, month } = parsePeriodLabel(periodLabel);
  const now = new Date();
  const isCurrentPeriod = now.getFullYear() === year && now.getMonth() + 1 === month;

  if (isCurrentPeriod) {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + (7 - start.getDay() || 7) - 1);
    end.setHours(23, 59, 59, 999);
    return { start, end, label: "Vencen hoy o esta semana" };
  }

  const day = now.getDate();
  const lastDay = new Date(year, month, 0).getDate();
  const startDay = Math.max(Math.floor((Math.min(day, lastDay) - 1) / 7) * 7 + 1, 1);
  const endDay = Math.min(startDay + 6, lastDay);
  const start = new Date(year, month - 1, startDay, 0, 0, 0, 0);
  const end = new Date(year, month - 1, endDay, 23, 59, 59, 999);

  return {
    start,
    end,
    label: `Vencen en la semana ${Math.floor((startDay - 1) / 7) + 1} del mes`
  };
}

export async function getMonthlyDashboard(schoolId: string, periodLabel: string) {
  const { start, end } = getPeriodRange(periodLabel);
  const weekRanges = buildWeekRanges(periodLabel);
  const dueWindow = getReferenceWeekRange(periodLabel);

  const [students, reconciledPayments, openReviews, unreconciledPayments, dueThisWeek] = await Promise.all([
    prisma.student.findMany({
      where: { schoolId },
      orderBy: { fullName: "asc" },
      select: {
        id: true,
        notes: true,
        charges: {
          where: {
            periodLabel,
            status: {
              not: ChargeStatus.CANCELED
            }
          },
          select: {
            amountCents: true,
            outstandingCents: true,
            dueDate: true
          }
        }
      }
    }),
    prisma.payment.findMany({
      where: {
        schoolId,
        status: PaymentStatus.RECONCILED,
        OR: [
          {
            paidAt: {
              gte: start,
              lt: end
            }
          },
          {
            paidAt: null,
            createdAt: {
              gte: start,
              lt: end
            }
          }
        ]
      },
      select: {
        amountCents: true,
        paidAt: true,
        createdAt: true
      }
    }),
    prisma.reviewTask.count({
      where: {
        schoolId,
        status: {
          in: [ReviewTaskStatus.OPEN, ReviewTaskStatus.IN_PROGRESS]
        },
        receipt: {
          receivedAt: {
            gte: start,
            lt: end
          }
        }
      }
    }),
    prisma.payment.count({
      where: {
        schoolId,
        status: PaymentStatus.RECEIVED,
        OR: [
          {
            paidAt: {
              gte: start,
              lt: end
            }
          },
          {
            paidAt: null,
            createdAt: {
              gte: start,
              lt: end
            }
          }
        ]
      }
    }),
    prisma.charge.count({
      where: {
        schoolId,
        periodLabel,
        status: {
          not: ChargeStatus.CANCELED
        },
        outstandingCents: {
          gt: 0
        },
        dueDate: {
          gte: dueWindow.start,
          lte: dueWindow.end
        }
      }
    })
  ]);

  const categoryCards = buildCategorySummaries(students);
  const ranking = [...categoryCards]
    .filter((category) => category.outstandingCents > 0)
    .sort((left, right) => {
      if (right.outstandingCents !== left.outstandingCents) {
        return right.outstandingCents - left.outstandingCents;
      }

      return right.studentsPending - left.studentsPending;
    });

  const totalMonthCents = sumAmounts(categoryCards.map((category) => category.billedCents));
  const collectedCents = sumAmounts(categoryCards.map((category) => category.collectedCents));
  const pendingCents = sumAmounts(categoryCards.map((category) => category.outstandingCents));
  const collectionRate = readCollectionRate(totalMonthCents, collectedCents);
  const studentsWithDebt = sumAmounts(ranking.map((category) => category.studentsPending));
  const totalStudentsPaid = sumAmounts(categoryCards.map((category) => category.studentsPaid));
  const totalStudentsWithCharge = sumAmounts(categoryCards.map((category) => category.studentsWithMonthlyCharge));

  let cumulativeCollected = 0;
  const trend = weekRanges.map((week) => {
    const weeklyCollected = sumAmounts(
      reconciledPayments
        .filter((payment) => {
          const effectiveDate = payment.paidAt ?? payment.createdAt;
          return effectiveDate >= week.start && effectiveDate <= week.end;
        })
        .map((payment) => payment.amountCents)
    );

    cumulativeCollected += weeklyCollected;
    return {
      label: week.label,
      collectedCents: cumulativeCollected,
      pendingCents: Math.max(totalMonthCents - cumulativeCollected, 0)
    };
  });

  const trendMax = Math.max(
    1,
    ...trend.flatMap((point) => [point.collectedCents, point.pendingCents])
  );

  const topIssue = ranking[0]
    ? `${ranking[0].label} concentra el mayor saldo pendiente del mes.`
    : "No hay categorias con deuda pendiente en el periodo seleccionado.";

  return {
    periodLabel,
    periodTitle: formatPeriodLabel(periodLabel),
    topIssue,
    kpis: {
      totalMonthCents,
      collectedCents,
      pendingCents,
      collectionRate
    },
    categoryCards,
    ranking,
    actions: [
      {
        key: "reviews",
        label: "Comprobantes por revisar",
        value: openReviews,
        description: "Comprobantes que siguen esperando validacion."
      },
      {
        key: "debtors",
        label: "Alumnos con deuda",
        value: studentsWithDebt,
        description: "Alumnos que aun tienen saldo del mes."
      },
      {
        key: "unreconciled",
        label: "Pagos no conciliados",
        value: unreconciledPayments,
        description: "Pagos recibidos que todavia no se cerraron."
      },
      {
        key: "due-week",
        label: dueWindow.label,
        value: dueThisWeek,
        description: "Casos del periodo que requieren seguimiento esta semana."
      }
    ],
    trend,
    trendMax,
    totals: {
      totalStudentsWithCharge,
      totalStudentsPaid,
      studentsWithDebt
    }
  };
}
