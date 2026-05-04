import { AppShell } from "@/components/app/app-shell";
import { requireSession } from "@/server/auth/session";
import { env } from "@/server/config/env";

export default async function PrivateLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await requireSession();
  const telegramBotUsername = env.TELEGRAM_BOT_USERNAME || env.ONBOARDING_TELEGRAM_BOT_USERNAME;
  const kapitanUrl = telegramBotUsername ? `https://t.me/${telegramBotUsername}` : "https://telegram.org/dl";

  return (
    <AppShell session={session} kapitanUrl={kapitanUrl}>
      {children}
    </AppShell>
  );
}
