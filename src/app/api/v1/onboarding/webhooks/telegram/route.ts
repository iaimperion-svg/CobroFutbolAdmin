import { headers } from "next/headers";
import { env } from "@/server/config/env";
import { fail } from "@/server/http/response";
import { handleOnboardingTelegramUpdate } from "@/server/services/onboarding.service";
import { parseTelegramUpdate } from "@/server/services/telegram.service";

export async function POST(request: Request) {
  try {
    if (!env.ONBOARDING_TELEGRAM_ENABLED) {
      return new Response("Onboarding Telegram disabled", { status: 503 });
    }

    const headerStore = await headers();
    const secret = headerStore.get("x-telegram-bot-api-secret-token");

    if (
      env.ONBOARDING_TELEGRAM_WEBHOOK_SECRET &&
      secret !== env.ONBOARDING_TELEGRAM_WEBHOOK_SECRET
    ) {
      return new Response("Forbidden", { status: 403 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const parsed = parseTelegramUpdate(body);

    if (!parsed) {
      return new Response(JSON.stringify({ ok: true, ignored: true }), {
        status: 202,
        headers: {
          "content-type": "application/json"
        }
      });
    }

    await handleOnboardingTelegramUpdate(parsed);

    return new Response(JSON.stringify({ ok: true, accepted: true }), {
      status: 202,
      headers: {
        "content-type": "application/json"
      }
    });
  } catch (error) {
    return fail(error);
  }
}
