import { headers } from "next/headers";
import { env } from "@/server/config/env";
import { fail } from "@/server/http/response";
import { ingestTelegramWebhook } from "@/server/services/webhook-ingestion.service";

export async function POST(request: Request) {
  try {
    if (!env.TELEGRAM_ENABLED) {
      return new Response("Telegram disabled", { status: 503 });
    }

    const headerStore = await headers();
    const secret = headerStore.get("x-telegram-bot-api-secret-token");
    const { searchParams } = new URL(request.url);
    const schoolSlug = searchParams.get("schoolSlug");

    if (!schoolSlug) {
      throw new Error("schoolSlug es requerido");
    }

    if (env.TELEGRAM_WEBHOOK_SECRET && secret !== env.TELEGRAM_WEBHOOK_SECRET) {
      return new Response("Forbidden", { status: 403 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    await ingestTelegramWebhook(body, schoolSlug);
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
