import { ChargeStatus, PaymentStatus, ReceiptStatus } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { sumAmounts } from "@/server/utils/money";

export async function getFinancialDashboard(schoolId: string) {
  const [charges, payments, receipts, reviews] = await Promise.all([
    prisma.charge.findMany({
      where: {
        schoolId,
        status: {
          in: [ChargeStatus.PENDING, ChargeStatus.PARTIALLY_PAID, ChargeStatus.OVERDUE, ChargeStatus.PAID]
        }
      }
    }),
    prisma.payment.findMany({
      where: {
        schoolId,
        status: {
          in: [PaymentStatus.RECONCILED, PaymentStatus.RECEIVED]
        }
      }
    }),
    prisma.receipt.findMany({
      where: { schoolId }
    }),
    prisma.reviewTask.count({
      where: {
        schoolId,
        status: {
          in: ["OPEN", "IN_PROGRESS"]
        }
      }
    })
  ]);

  const billedCents = sumAmounts(charges.map((charge) => charge.amountCents));
  const outstandingCents = sumAmounts(charges.map((charge) => charge.outstandingCents));
  const collectedCents = sumAmounts(
    payments.filter((payment) => payment.status === PaymentStatus.RECONCILED).map((payment) => payment.amountCents)
  );
  const autoReconciled = receipts.filter((receipt) => receipt.status === ReceiptStatus.AUTO_RECONCILED).length;

  return {
    billedCents,
    outstandingCents,
    collectedCents,
    totalReceipts: receipts.length,
    autoReconciliationRate: receipts.length === 0 ? 0 : autoReconciled / receipts.length,
    openReviews: reviews
  };
}
