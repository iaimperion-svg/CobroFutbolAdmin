import { permissionKeys } from "@/server/auth/permissions";
import { requireApiSession } from "@/server/auth/session";
import { fail, ok } from "@/server/http/response";
import { listReviewTasks } from "@/server/services/manual-review.service";

export async function GET() {
  try {
    const session = await requireApiSession(permissionKeys.reviewsRead);
    return ok(await listReviewTasks(session.schoolId));
  } catch (error) {
    return fail(error);
  }
}
