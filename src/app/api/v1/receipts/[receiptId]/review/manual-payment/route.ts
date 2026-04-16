import { z } from "zod";
import { permissionKeys } from "@/server/auth/permissions";
import { requireApiSession } from "@/server/auth/session";
import { fail, ok } from "@/server/http/response";
import { confirmManualPayment } from "@/server/services/manual-review.service";

const manualPaymentSchema = z.object({
  chargeId: z.string().min(1, "Selecciona un cargo"),
  resolutionNotes: z.string().trim().max(500).optional()
});

export async function POST(request: Request, context: { params: Promise<{ receiptId: string }> }) {
  try {
    const session = await requireApiSession(permissionKeys.reviewsResolve);
    const params = await context.params;
    const body = manualPaymentSchema.parse(await request.json());

    return ok(
      await confirmManualPayment({
        receiptId: params.receiptId,
        schoolId: session.schoolId,
        actorUserId: session.userId,
        chargeId: body.chargeId,
        resolutionNotes: body.resolutionNotes
      })
    );
  } catch (error) {
    return fail(error);
  }
}
