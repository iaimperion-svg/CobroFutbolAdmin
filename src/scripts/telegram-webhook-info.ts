import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const { getTelegramWebhookInfo } = await import("@/server/services/telegram.service");
  const info = await getTelegramWebhookInfo();
  console.log(JSON.stringify(info, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
