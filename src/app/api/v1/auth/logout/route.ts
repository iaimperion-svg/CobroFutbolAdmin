import { logoutSession } from "@/server/auth/session";
import { ok } from "@/server/http/response";

export async function POST() {
  await logoutSession();
  return ok({ success: true });
}
