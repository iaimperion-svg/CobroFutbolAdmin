import { ActivationForm } from "@/components/onboarding/activation-form";
import { getActivationSnapshot } from "@/server/services/onboarding.service";

export default async function ActivationPage(props: {
  searchParams: Promise<{ token?: string }>;
}) {
  const searchParams = await props.searchParams;
  const token = searchParams.token ?? "";
  const snapshot = token ? await getActivationSnapshot(token) : null;

  return (
    <main className="login-wrap">
      <ActivationForm token={token} snapshot={snapshot} />
    </main>
  );
}
