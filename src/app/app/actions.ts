"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { permissionKeys } from "@/server/auth/permissions";
import { requireSession } from "@/server/auth/session";
import { getErrorMessage } from "@/server/http/errors";
import { upsertSchoolSetup } from "@/server/services/school-setup.service";

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

function redirectToDashboard(params: Record<string, string>) {
  const nextParams = new URLSearchParams(params);
  const query = nextParams.toString();
  redirect((query ? `/app?${query}` : "/app") as never);
}

export async function saveSchoolSetupAction(formData: FormData) {
  try {
    const session = await requireSession();

    if (!session.permissions.includes(permissionKeys.settingsManage)) {
      throw new Error("No tienes permiso para actualizar la configuracion de la escuela.");
    }

    await upsertSchoolSetup({
      schoolId: session.schoolId,
      operationsEmail: String(formData.get("operationsEmail") ?? ""),
      bankName: String(formData.get("bankName") ?? ""),
      accountType: String(formData.get("accountType") ?? ""),
      accountHolder: String(formData.get("accountHolder") ?? ""),
      accountNumber: String(formData.get("accountNumber") ?? "")
    });

    revalidatePath("/app");
    redirectToDashboard({
      notice: "Datos de la escuela guardados correctamente."
    });
  } catch (error) {
    rethrowRedirectError(error);
    redirectToDashboard({
      error: getErrorMessage(error)
    });
  }
}
