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

function rethrowRedirectError(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  ) {
    throw error;
  }
}

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

    const emailDelivered = result.delivery.delivered;
    const telegramDelivered = result.telegramDelivery.delivered;
    const notice =
      emailDelivered && telegramDelivered
        ? `Solicitud ${result.publicCode} aprobada. Link enviado por correo y Telegram; acceso manual disponible.`
        : emailDelivered
          ? `Solicitud ${result.publicCode} aprobada. Correo enviado; acceso manual disponible.`
          : telegramDelivered
            ? `Solicitud ${result.publicCode} aprobada. Link enviado por Telegram; acceso manual disponible.`
            : `Solicitud ${result.publicCode} aprobada. No se pudo enviar el acceso automatico; comparte el enlace manualmente.`;

    revalidatePath("/backoffice/onboarding");
    redirectToBackoffice({
      notice,
      activationUrl: result.activationUrl,
      publicCode: result.publicCode,
      deliveryMode: result.delivery.mode
    });
  } catch (error) {
    rethrowRedirectError(error);
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
    rethrowRedirectError(error);
    redirectToBackoffice({
      error: getErrorMessage(error)
    });
  }
}
