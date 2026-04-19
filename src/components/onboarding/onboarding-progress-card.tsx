import { BrandMark } from "@/components/brand/brand-mark";

type OnboardingProgressCardProps = {
  currentStep: 1 | 2 | 3;
  title: string;
  description: string;
};

const progressSteps = [
  {
    title: "Completa la solicitud",
    description: "Ingresa director, academia, ciudad y forma de contacto."
  },
  {
    title: "Recibe las instrucciones",
    description: "Sigue el enlace, revisa el codigo y envia el comprobante."
  },
  {
    title: "Activa el portal",
    description: "Define tu contrasena y entra a CobroFutbol con tu academia."
  }
] as const;

export function OnboardingProgressCard(props: OnboardingProgressCardProps) {
  return (
    <article className="stack onboarding-side onboarding-brief onboarding-public-copy onboarding-public-hero-card">
      <BrandMark compact src="/brand/logo_.png" trimTransparentPadding={false} />
      <span className="eyebrow">Creacion Academia</span>
      <h1 className="app-title onboarding-side-title">{props.title}</h1>
      <p className="muted onboarding-side-copy">{props.description}</p>

      <div className="onboarding-public-divider" />
      <ol className="onboarding-brief-list">
        {progressSteps.map((step, index) => {
          const stepNumber = (index + 1) as 1 | 2 | 3;
          const stepClassName =
            stepNumber === props.currentStep
              ? "is-active"
              : stepNumber < props.currentStep
                ? "is-complete"
                : undefined;

          return (
            <li key={step.title} className={stepClassName}>
              <strong>{step.title}</strong>
              <span>{step.description}</span>
            </li>
          );
        })}
      </ol>

      <p className="onboarding-brief-note">Pensado para completar el alta sin ruido y sin pasos innecesarios.</p>
    </article>
  );
}
