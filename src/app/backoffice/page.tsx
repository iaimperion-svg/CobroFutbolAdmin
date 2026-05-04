import { redirect } from "next/navigation";
import { hasOnboardingReviewAccess } from "@/server/auth/onboarding-review";

export const dynamic = "force-dynamic";

export default async function BackofficeEntryPage() {
  const hasAccess = await hasOnboardingReviewAccess();
  redirect((hasAccess ? "/backoffice/maestro" : "/backoffice/onboarding") as never);
}
