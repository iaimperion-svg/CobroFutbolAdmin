import { z } from "zod";
import { permissionKeys } from "@/server/auth/permissions";
import { requireApiSession } from "@/server/auth/session";
import { fail, ok } from "@/server/http/response";
import { addReceiptInternalNote, getReceiptReviewCase } from "@/server/services/manual-review.service";

const noteSchema = z.object({
  body: z.string().trim().min(3, "Escribe una observacion").max(1000)
});

export async function GET(_: Request, context: { params: Promise<{ receiptId: string }> }) {
  try {
    const session = await requireApiSession(permissionKeys.reviewsRead);
    const params = await context.params;
    const detail = await getReceiptReviewCase(params.receiptId, session.schoolId);
    return ok(detail.notes);
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ receiptId: string }> }) {
  try {
    const session = await requireApiSession(permissionKeys.reviewsResolve);
    const params = await context.params;
    const body = noteSchema.parse(await request.json());

    return ok(
      await addReceiptInternalNote({
        receiptId: params.receiptId,
        schoolId: session.schoolId,
        actorUserId: session.userId,
        body: body.body
      })
    );
  } catch (error) {
    return fail(error);
  }
}
