import { headers } from "next/headers";
import { fail, ok } from "@/server/http/response";
import { approveOnboardingRequest } from "@/server/services/onboarding.service";

export async function POST(
  _request: Request,
  context: { params: Promise<{ requestId: string }> }
) {
  try {
    const headerStore = await headers();
    const secret = headerStore.get("x-onboarding-review-secret");
    const { requestId } = await context.params;

    return ok(
      await approveOnboardingRequest({
        requestId,
        reviewSecret: secret
      })
    );
  } catch (error) {
    return fail(error);
  }
}
