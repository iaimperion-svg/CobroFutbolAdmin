import { headers } from "next/headers";
import { fail, ok } from "@/server/http/response";
import { listOnboardingRequestsForReview } from "@/server/services/onboarding.service";

export async function GET() {
  try {
    const headerStore = await headers();
    const secret = headerStore.get("x-onboarding-review-secret");
    return ok(await listOnboardingRequestsForReview(secret));
  } catch (error) {
    return fail(error);
  }
}
