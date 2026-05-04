import { redirect } from "next/navigation";
import { permissionKeys } from "@/server/auth/permissions";
import { getSession, loginWithPassword, logoutSession } from "@/server/auth/session";
import { env } from "@/server/config/env";
import { AppError } from "@/server/http/errors";

export function getOnboardingReviewConfiguredSecret() {
  if (!env.ONBOARDING_REVIEW_SECRET) {
    throw new AppError(
      "Falta configurar ONBOARDING_REVIEW_SECRET para operar backoffice.",
      500
    );
  }

  return env.ONBOARDING_REVIEW_SECRET;
}

export async function hasOnboardingReviewAccess() {
  const session = await getSession();
  return session?.permissions.includes(permissionKeys.settingsManage) ?? false;
}

export async function requireOnboardingReviewAccess() {
  if (!(await hasOnboardingReviewAccess())) {
    redirect("/login?next=/backoffice" as never);
  }
}

export async function assertOnboardingReviewAccess() {
  if (!(await hasOnboardingReviewAccess())) {
    throw new AppError("Debes iniciar sesion con permisos de backoffice antes de continuar.", 403);
  }
}

export async function requireOnboardingReviewSecret() {
  await requireOnboardingReviewAccess();
  return getOnboardingReviewConfiguredSecret();
}

function normalizeBackofficeUsername(username: string) {
  const normalized = username.trim().toLowerCase();
  return normalized.includes("@") ? normalized : `${normalized}@cobrofutbol.cl`;
}

export async function loginOnboardingReview(username: string, password: string) {
  const normalizedUsername = normalizeBackofficeUsername(username);
  const normalizedPassword = password.trim();

  if (!normalizedUsername || !normalizedPassword) {
    throw new AppError("Ingresa usuario y clave de backoffice.", 400);
  }

  const session = await loginWithPassword({
    email: normalizedUsername,
    password: normalizedPassword
  });

  if (!session.permissions.includes(permissionKeys.settingsManage)) {
    await logoutSession();
    throw new AppError("No autorizado para backoffice.", 403);
  }
}

export async function logoutOnboardingReview() {
  await logoutSession();
}
