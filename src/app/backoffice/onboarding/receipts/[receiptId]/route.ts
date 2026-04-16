import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { prisma } from "@/server/db/prisma";
import { AppError } from "@/server/http/errors";
import { fail } from "@/server/http/response";
import { assertOnboardingReviewAccess } from "@/server/auth/onboarding-review";

function inferContentType(fileName: string | null, mimeType: string | null) {
  if (mimeType) {
    return mimeType;
  }

  const lower = (fileName ?? "").toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ receiptId: string }> }
) {
  try {
    await assertOnboardingReviewAccess();

    const { receiptId } = await context.params;
    const receipt = await prisma.onboardingPaymentReceipt.findUnique({
      where: { id: receiptId },
      select: {
        storagePath: true,
        originalFileName: true,
        mimeType: true
      }
    });

    if (!receipt) {
      throw new AppError("Comprobante de onboarding no encontrado", 404);
    }

    if (!receipt.storagePath) {
      throw new AppError("El archivo aun no fue descargado", 404);
    }

    const buffer = await readFile(receipt.storagePath);

    return new Response(buffer, {
      status: 200,
      headers: {
        "content-type": inferContentType(receipt.originalFileName, receipt.mimeType),
        "content-disposition": `inline; filename="${basename(
          receipt.originalFileName ?? receipt.storagePath
        )}"`,
        "cache-control": "private, max-age=60"
      }
    });
  } catch (error) {
    return fail(error);
  }
}
