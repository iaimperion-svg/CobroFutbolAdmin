"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  loginOnboardingReview,
  logoutOnboardingReview,
  requireOnboardingReviewSecret
} from "@/server/auth/onboarding-review";
import { getErrorMessage } from "@/server/http/errors";
import { approveOnboardingRequest, rejectOnboardingRequest } from "@/server/services/onboarding.service";

function redirectToBackoffice(params: Record<string, string>) {
  const nextParams = new URLSearchParams(params);
  const query = nextParams.toString();
  redirect((query ? `/backoffice/onboarding?${query}` : "/backoffice/onboarding") as never);
}

export async function loginOnboardingReviewAction(formData: FormData) {
  try {
    await loginOnboardingReview(String(formData.get("secret") ?? ""));
  } catch (error) {
    redirectToBackoffice({
      error: getErrorMessage(error)
    });
  }

  redirectToBackoffice({
    notice: "Acceso interno habilitado."
  });
}

export async function logoutOnboardingReviewAction() {
  await logoutOnboardingReview();
  redirect("/backoffice/onboarding" as never);
}

export async function approveOnboardingReviewAction(formData: FormData) {
  try {
    const reviewSecret = await requireOnboardingReviewSecret();
    const requestId = String(formData.get("requestId") ?? "").trim();
    const result = await approveOnboardingRequest({
      requestId,
      reviewSecret
    });

    revalidatePath("/backoffice/onboarding");
    redirectToBackoffice(
      result.delivery.delivered
        ? {
            notice: `Solicitud ${result.publicCode} aprobada y correo enviado.`
          }
        : {
            notice: `Solicitud ${result.publicCode} aprobada. El acceso quedo listo para envio manual.`,
            activationUrl: result.activationUrl
          }
    );
  } catch (error) {
    redirectToBackoffice({
      error: getErrorMessage(error)
    });
  }
}

export async function rejectOnboardingReviewAction(formData: FormData) {
  try {
    const reviewSecret = await requireOnboardingReviewSecret();
    const requestId = String(formData.get("requestId") ?? "").trim();
    const reason = String(formData.get("reason") ?? "");

    await rejectOnboardingRequest({
      requestId,
      reviewSecret,
      reason
    });

    revalidatePath("/backoffice/onboarding");
    redirectToBackoffice({
      notice: "Solicitud rechazada y registrada en la bandeja."
    });
  } catch (error) {
    redirectToBackoffice({
      error: getErrorMessage(error)
    });
  }
}
