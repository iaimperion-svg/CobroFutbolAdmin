import { AppShell } from "@/components/app/app-shell";
import { requireSession } from "@/server/auth/session";

export default async function PrivateLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await requireSession();
  return <AppShell session={session}>{children}</AppShell>;
}
