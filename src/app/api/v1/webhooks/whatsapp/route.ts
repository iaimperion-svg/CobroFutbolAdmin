import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/server/config/env";
import { fail, ok } from "@/server/http/response";
import { ingestWhatsappWebhook } from "@/server/services/webhook-ingestion.service";

function isValidWhatsappSignature(rawBody: string, signatureHeader: string | null) {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) {
    return false;
  }

  const expected = createHmac("sha256", env.WHATSAPP_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");
  const received = signatureHeader.slice("sha256=".length);

  const expectedBuffer = Buffer.from(expected, "hex");
  const receivedBuffer = Buffer.from(received, "hex");

  if (expectedBuffer.length === 0 || expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, receivedBuffer);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const challenge = searchParams.get("hub.challenge");
  const token = searchParams.get("hub.verify_token");

  if (mode === "subscribe" && token === env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge ?? "", { status: 200 });
  }

  return new Response("Invalid verification", { status: 403 });
}

export async function POST(request: Request) {
  try {
    if (!env.WHATSAPP_WEBHOOK_SECRET) {
      return new Response("WhatsApp webhook secret not configured", { status: 503 });
    }

    const { searchParams } = new URL(request.url);
    const schoolSlug = searchParams.get("schoolSlug");
    if (!schoolSlug) {
      throw new Error("schoolSlug es requerido");
    }

    const rawBody = await request.text();
    const signature = request.headers.get("x-hub-signature-256");

    if (!isValidWhatsappSignature(rawBody, signature)) {
      return new Response("Forbidden", { status: 403 });
    }

    const body = JSON.parse(rawBody) as Record<string, unknown>;
    const result = await ingestWhatsappWebhook(body, schoolSlug);
    return ok(result);
  } catch (error) {
    return fail(error);
  }
}
