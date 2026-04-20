import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const [{ env }, { getTelegramWebhookInfo, setTelegramWebhook }] = await Promise.all([
    import("@/server/config/env"),
    import("@/server/services/telegram.service")
  ]);

  if (!env.TELEGRAM_ENABLED) {
    throw new Error("TELEGRAM_ENABLED debe estar en true antes de registrar el webhook.");
  }

  await setTelegramWebhook();
  const info = await getTelegramWebhookInfo();
  console.log(JSON.stringify(info, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
