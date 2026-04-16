import { ok } from "@/server/http/response";

export async function GET() {
  return ok({
    service: "CobroFutbol",
    status: "ok",
    timestamp: new Date().toISOString()
  });
}
