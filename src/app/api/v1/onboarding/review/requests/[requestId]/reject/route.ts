import { headers } from "next/headers";
import { z } from "zod";
import { fail, ok } from "@/server/http/response";
import { rejectOnboardingRequest } from "@/server/services/onboarding.service";

const rejectionSchema = z.object({
  reason: z.string().trim().min(4, "Debes indicar el motivo del rechazo")
});

export async function POST(
  request: Request,
  context: { params: Promise<{ requestId: string }> }
) {
  try {
    const headerStore = await headers();
    const secret = headerStore.get("x-onboarding-review-secret");
    const body = rejectionSchema.parse(await request.json());
    const { requestId } = await context.params;

    return ok(
      await rejectOnboardingRequest({
        requestId,
        reviewSecret: secret,
        reason: body.reason
      })
    );
  } catch (error) {
    return fail(error);
  }
}
