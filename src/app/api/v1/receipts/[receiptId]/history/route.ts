import { permissionKeys } from "@/server/auth/permissions";
import { requireApiSession } from "@/server/auth/session";
import { fail, ok } from "@/server/http/response";
import { getReceiptReviewCase } from "@/server/services/manual-review.service";

export async function GET(_: Request, context: { params: Promise<{ receiptId: string }> }) {
  try {
    const session = await requireApiSession(permissionKeys.reviewsRead);
    const params = await context.params;
    const detail = await getReceiptReviewCase(params.receiptId, session.schoolId);

    return ok({
      notes: detail.notes,
      auditTrail: detail.auditTrail
    });
  } catch (error) {
    return fail(error);
  }
}
