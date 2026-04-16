import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "@/server/config/env";
import { AppError } from "@/server/http/errors";

const ONBOARDING_REVIEW_COOKIE = "cf_onboarding_review";
const ONBOARDING_REVIEW_PATH = "/backoffice/onboarding";

function hashSecret(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function secretsMatch(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function getOnboardingReviewConfiguredSecret() {
  if (!env.ONBOARDING_REVIEW_SECRET) {
    throw new AppError(
      "Falta configurar ONBOARDING_REVIEW_SECRET para usar la bandeja interna de onboarding.",
      500
    );
  }

  return env.ONBOARDING_REVIEW_SECRET;
}

export async function hasOnboardingReviewAccess() {
  if (!env.ONBOARDING_REVIEW_SECRET) {
    return false;
  }

  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(ONBOARDING_REVIEW_COOKIE)?.value;
  if (!cookieValue) {
    return false;
  }

  return secretsMatch(cookieValue, hashSecret(env.ONBOARDING_REVIEW_SECRET));
}

export async function requireOnboardingReviewAccess() {
  if (!(await hasOnboardingReviewAccess())) {
    redirect("/backoffice/onboarding" as never);
  }
}

export async function assertOnboardingReviewAccess() {
  if (!(await hasOnboardingReviewAccess())) {
    throw new AppError("Debes ingresar a la bandeja interna antes de continuar.", 403);
  }
}

export async function requireOnboardingReviewSecret() {
  await assertOnboardingReviewAccess();
  return getOnboardingReviewConfiguredSecret();
}

export async function loginOnboardingReview(secretAttempt: string) {
  const configuredSecret = getOnboardingReviewConfiguredSecret();
  const normalizedAttempt = secretAttempt.trim();

  if (!normalizedAttempt) {
    throw new AppError("Ingresa la clave interna de onboarding.", 400);
  }

  if (!secretsMatch(normalizedAttempt, configuredSecret)) {
    throw new AppError("La clave interna no es valida.", 403);
  }

  const cookieStore = await cookies();
  cookieStore.set(ONBOARDING_REVIEW_COOKIE, hashSecret(configuredSecret), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: ONBOARDING_REVIEW_PATH,
    maxAge: 60 * 60 * 12
  });
}

export async function logoutOnboardingReview() {
  const cookieStore = await cookies();
  cookieStore.set(ONBOARDING_REVIEW_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: ONBOARDING_REVIEW_PATH,
    expires: new Date(0)
  });
}
