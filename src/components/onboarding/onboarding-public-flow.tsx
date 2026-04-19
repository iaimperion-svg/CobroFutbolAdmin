"use client";

import { OnboardingPlan } from "@prisma/client";
import { useState } from "react";
import { OnboardingProgressCard } from "@/components/onboarding/onboarding-progress-card";
import { OnboardingRequestForm } from "@/components/onboarding/onboarding-request-form";

function getStepCopy(currentStep: 1 | 2) {
  if (currentStep === 2) {
    return {
      title: "Recibe instrucciones y envia tu comprobante.",
      description: "Guarda tu codigo, abre el bot y comparte el comprobante para continuar con la validacion."
    };
  }

  return {
    title: "Completa tu academia paso a paso.",
    description: "Ingresa los datos principales, elige tu plan y deja la solicitud lista para continuar."
  };
}

export function OnboardingPublicFlow(props: { initialPlan?: OnboardingPlan }) {
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);
  const copy = getStepCopy(currentStep);

  return (
    <section className="onboarding-stage-shell onboarding-grid onboarding-public-grid">
      <OnboardingProgressCard
        currentStep={currentStep}
        title={copy.title}
        description={copy.description}
      />
      <OnboardingRequestForm initialPlan={props.initialPlan} onCurrentStepChange={setCurrentStep} />
    </section>
  );
}
