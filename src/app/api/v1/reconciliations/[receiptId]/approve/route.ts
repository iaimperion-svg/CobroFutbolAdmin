import { permissionKeys } from "@/server/auth/permissions";
import { requireApiSession } from "@/server/auth/session";
import { fail, ok } from "@/server/http/response";
import { approveSuggestedReconciliation } from "@/server/services/manual-review.service";

export async function POST(request: Request, context: { params: Promise<{ receiptId: string }> }) {
  try {
    const session = await requireApiSession(permissionKeys.reviewsResolve);
    const params = await context.params;
    const body = (await request.json()) as { chargeId: string; resolutionNotes?: string };

    return ok(
      await approveSuggestedReconciliation({
        receiptId: params.receiptId,
        schoolId: session.schoolId,
        chargeId: body.chargeId,
        actorUserId: session.userId,
        resolutionNotes: body.resolutionNotes
      })
    );
  } catch (error) {
    return fail(error);
  }
}
