import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function BackofficeBotsMaintainerPage() {
  redirect("/backoffice/maestro/mantenedores/alertas" as never);
}
