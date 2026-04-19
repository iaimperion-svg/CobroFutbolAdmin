import { OnboardingPlan } from "@prisma/client";
import { OnboardingPublicFlow } from "@/components/onboarding/onboarding-public-flow";

type SearchParamsInput = Promise<Record<string, string | string[] | undefined>>;

function parseRequestedPlan(value: string | string[] | undefined) {
  if (typeof value !== "string") {
    return undefined;
  }

  switch (value.trim().toUpperCase()) {
    case OnboardingPlan.SEMILLERO:
      return OnboardingPlan.SEMILLERO;
    case OnboardingPlan.ACADEMIA:
      return OnboardingPlan.ACADEMIA;
    case OnboardingPlan.CLUB_PRO:
      return OnboardingPlan.CLUB_PRO;
    default:
      return undefined;
  }
}

export default async function OnboardingPage(props: { searchParams?: SearchParamsInput }) {
  const params = props.searchParams ? await props.searchParams : {};
  const initialPlan = parseRequestedPlan(params.plan);

  return (
    <main className="login-wrap onboarding-stage onboarding-stage-public">
      <div className="onboarding-public-scene" aria-hidden="true">
        <div className="onboarding-public-grass" />
        <div className="onboarding-public-pitch">
          <span className="onboarding-public-half-line" />
          <span className="onboarding-public-center-circle" />
          <span className="onboarding-public-box onboarding-public-box-left" />
          <span className="onboarding-public-box onboarding-public-box-right" />
        </div>
      </div>
      <OnboardingPublicFlow initialPlan={initialPlan} />
    </main>
  );
}
