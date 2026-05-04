import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function LegacyOnboardingProjectPage() {
  redirect("/backoffice/maestro/proyecto" as never);
}
