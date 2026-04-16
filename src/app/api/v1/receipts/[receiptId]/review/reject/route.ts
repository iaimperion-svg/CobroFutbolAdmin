import { z } from "zod";
import { permissionKeys } from "@/server/auth/permissions";
import { requireApiSession } from "@/server/auth/session";
import { fail, ok } from "@/server/http/response";
import { rejectSuggestedReconciliation } from "@/server/services/manual-review.service";

const rejectSchema = z.object({
  rejectionReason: z.string().min(1, "Selecciona un motivo de rechazo"),
  resolutionNotes: z.string().trim().max(500).optional()
});

export async function POST(request: Request, context: { params: Promise<{ receiptId: string }> }) {
  try {
    const session = await requireApiSession(permissionKeys.reviewsResolve);
    const params = await context.params;
    const body = rejectSchema.parse(await request.json());

    return ok(
      await rejectSuggestedReconciliation({
        receiptId: params.receiptId,
        schoolId: session.schoolId,
        actorUserId: session.userId,
        rejectionReason: body.rejectionReason,
        resolutionNotes: body.resolutionNotes
      })
    );
  } catch (error) {
    return fail(error);
  }
}
