import { permissionKeys } from "@/server/auth/permissions";
import { requireApiSession } from "@/server/auth/session";
import { fail, ok } from "@/server/http/response";
import { listReceipts } from "@/server/services/receipts.service";

export async function GET() {
  try {
    const session = await requireApiSession(permissionKeys.receiptsRead);
    return ok(await listReceipts(session.schoolId));
  } catch (error) {
    return fail(error);
  }
}
