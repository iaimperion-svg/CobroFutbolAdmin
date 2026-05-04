"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertOnboardingReviewAccess } from "@/server/auth/onboarding-review";
import { getErrorMessage } from "@/server/http/errors";
import {
  ensureCurrentPlatformInvoices,
  ensurePlatformInvoiceForSchool,
  recordPlatformInvoicePayment
} from "@/server/services/backoffice-master.service";

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

function redirectToMaster(params: Record<string, string>) {
  const nextParams = new URLSearchParams(params);
  const query = nextParams.toString();
  redirect((query ? `/backoffice/maestro?${query}` : "/backoffice/maestro") as never);
}

function redirectToSchool(schoolSlug: string, params: Record<string, string>) {
  const nextParams = new URLSearchParams(params);
  const query = nextParams.toString();
  const basePath = `/backoffice/maestro/${encodeURIComponent(schoolSlug)}`;
  redirect((query ? `${basePath}?${query}` : basePath) as never);
}

function parseAmountCents(value: string) {
  const normalized = value.replace(/[^\d-]/g, "").trim();
  const amountPesos = Number(normalized);

  if (!Number.isInteger(amountPesos) || amountPesos <= 0) {
    throw new Error("Ingresa un monto valido en pesos para registrar el pago CobroFutbol.");
  }

  return amountPesos * 100;
}

function parseDateValue(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return new Date();
  }

  const parsed = new Date(`${normalized}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("La fecha del pago CobroFutbol no es valida.");
  }

  return parsed;
}

export async function ensureCurrentPlatformInvoicesAction() {
  try {
    await assertOnboardingReviewAccess();
    const result = await ensureCurrentPlatformInvoices();

    revalidatePath("/backoffice/maestro");
    redirectToMaster({
      notice:
        result.createdCount > 0
          ? `Mensualidades ${result.periodLabel} emitidas para ${result.createdCount} escuela(s).`
          : `No habia mensualidades nuevas por emitir para ${result.periodLabel}.`
    });
  } catch (error) {
    rethrowRedirectError(error);
    redirectToMaster({
      error: getErrorMessage(error)
    });
  }
}

export async function ensurePlatformInvoiceAction(formData: FormData) {
  const schoolSlug = String(formData.get("schoolSlug") ?? "").trim();

  try {
    await assertOnboardingReviewAccess();
    const schoolId = String(formData.get("schoolId") ?? "").trim();
    const periodLabel = String(formData.get("periodLabel") ?? "").trim();
    const result = await ensurePlatformInvoiceForSchool({
      schoolId,
      periodLabel
    });

    revalidatePath("/backoffice/maestro");
    revalidatePath(`/backoffice/maestro/${result.schoolSlug}`);
    redirectToSchool(result.schoolSlug, {
      notice: result.created
        ? `Mensualidad CobroFutbol ${result.periodLabel} emitida para ${result.schoolName}.`
        : `Mensualidad CobroFutbol ${result.periodLabel} recalculada para ${result.schoolName}.`
    });
  } catch (error) {
    rethrowRedirectError(error);
    redirectToSchool(schoolSlug || "maestro", {
      error: getErrorMessage(error)
    });
  }
}

export async function recordPlatformPaymentAction(formData: FormData) {
  const schoolSlug = String(formData.get("schoolSlug") ?? "").trim();

  try {
    await assertOnboardingReviewAccess();
    const schoolId = String(formData.get("schoolId") ?? "").trim();
    const invoiceId = String(formData.get("invoiceId") ?? "").trim();
    const amountCents = parseAmountCents(String(formData.get("amount") ?? ""));
    const paidAt = parseDateValue(String(formData.get("paidAt") ?? ""));
    const receiptReference = String(formData.get("receiptReference") ?? "");
    const notes = String(formData.get("notes") ?? "");

    const result = await recordPlatformInvoicePayment({
      schoolId,
      invoiceId,
      amountCents,
      paidAt,
      receiptReference,
      notes
    });

    revalidatePath("/backoffice/maestro");
    revalidatePath(`/backoffice/maestro/${result.schoolSlug}`);
    redirectToSchool(result.schoolSlug, {
      notice: `Pago CobroFutbol registrado por ${Math.round(result.amountCents / 100)} para ${result.periodLabel}.`
    });
  } catch (error) {
    rethrowRedirectError(error);
    redirectToSchool(schoolSlug || "maestro", {
      error: getErrorMessage(error)
    });
  }
}
