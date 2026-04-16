import { requireApiSession } from "@/server/auth/session";
import { fail, ok } from "@/server/http/response";

export async function GET() {
  try {
    const session = await requireApiSession();
    return ok(session);
  } catch (error) {
    return fail(error);
  }
}
