import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ingestWhatsappWebhook: vi.fn()
}));

vi.mock("@/server/config/env", () => ({
  env: {
    WHATSAPP_VERIFY_TOKEN: "verify-token",
    WHATSAPP_WEBHOOK_SECRET: "whatsapp-secret"
  }
}));

vi.mock("@/server/services/webhook-ingestion.service", () => ({
  ingestWhatsappWebhook: mocks.ingestWhatsappWebhook
}));

import { POST } from "@/app/api/v1/webhooks/whatsapp/route";

describe("whatsapp webhook route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ingestWhatsappWebhook.mockResolvedValue({
      ok: true
    });
  });

  it("rechaza POST sin firma valida", async () => {
    const request = new Request(
      "http://localhost:3000/api/v1/webhooks/whatsapp?schoolSlug=academia-central",
      {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ id: "msg-1" })
      }
    );

    const response = await POST(request);

    expect(response.status).toBe(403);
    expect(mocks.ingestWhatsappWebhook).not.toHaveBeenCalled();
  });

  it("acepta POST firmado correctamente", async () => {
    const rawBody = JSON.stringify({ id: "msg-1", message: "Pago abril" });
    const signature = createHmac("sha256", "whatsapp-secret").update(rawBody).digest("hex");
    const request = new Request(
      "http://localhost:3000/api/v1/webhooks/whatsapp?schoolSlug=academia-central",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-hub-signature-256": `sha256=${signature}`
        },
        body: rawBody
      }
    );

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      data: {
        ok: true
      }
    });
    expect(mocks.ingestWhatsappWebhook).toHaveBeenCalledWith(
      {
        id: "msg-1",
        message: "Pago abril"
      },
      "academia-central"
    );
  });
});
