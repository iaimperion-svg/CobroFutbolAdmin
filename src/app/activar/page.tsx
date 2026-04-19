import { ActivationForm } from "@/components/onboarding/activation-form";
import { OnboardingProgressCard } from "@/components/onboarding/onboarding-progress-card";
import { getActivationSnapshot } from "@/server/services/onboarding.service";

export default async function ActivationPage(props: {
  searchParams: Promise<{ token?: string }>;
}) {
  const searchParams = await props.searchParams;
  const token = searchParams.token ?? "";
  const snapshot = token ? await getActivationSnapshot(token) : null;

  return (
    <main className="login-wrap onboarding-stage activation-stage">
      <div className="activation-stage-scene" aria-hidden="true">
        <div className="activation-stage-grass" />
        <div className="activation-stage-pitch">
          <span className="activation-stage-half-line" />
          <span className="activation-stage-center-circle" />
          <span className="activation-stage-center-spot" />
          <span className="activation-stage-box activation-stage-box-left" />
          <span className="activation-stage-box activation-stage-box-right" />
        </div>
        <div className="activation-stage-glow activation-stage-glow-left" />
        <div className="activation-stage-glow activation-stage-glow-right" />
        <div className="activation-stage-ball" />
      </div>
      <section className="onboarding-stage-shell onboarding-grid activation-stage-shell">
        <OnboardingProgressCard
          currentStep={3}
          title="Activa tu acceso final en CobroFutbol."
          description="Define tu contrasena de acceso y deja tu academia lista para entrar al portal."
        />
        <ActivationForm token={token} snapshot={snapshot} />
      </section>
    </main>
  );
}
