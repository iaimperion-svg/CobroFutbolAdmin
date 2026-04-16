import { z } from "zod";
import { permissionKeys } from "@/server/auth/permissions";
import { requireApiSession } from "@/server/auth/session";
import { fail, ok } from "@/server/http/response";
import { reprocessReceipt } from "@/server/services/manual-review.service";

const reprocessSchema = z.object({
  resolutionNotes: z.string().trim().max(500).optional()
});

export async function POST(request: Request, context: { params: Promise<{ receiptId: string }> }) {
  try {
    const session = await requireApiSession(permissionKeys.reviewsResolve);
    const params = await context.params;
    const body = reprocessSchema.parse(await request.json());

    return ok(
      await reprocessReceipt({
        receiptId: params.receiptId,
        schoolId: session.schoolId,
        actorUserId: session.userId,
        resolutionNotes: body.resolutionNotes
      })
    );
  } catch (error) {
    return fail(error);
  }
}
