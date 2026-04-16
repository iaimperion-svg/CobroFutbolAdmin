import { permissionKeys } from "@/server/auth/permissions";
import { requireApiSession } from "@/server/auth/session";
import { getFinancialDashboard } from "@/server/services/dashboard.service";
import { fail, ok } from "@/server/http/response";

export async function GET() {
  try {
    const session = await requireApiSession(permissionKeys.dashboardRead);
    return ok(await getFinancialDashboard(session.schoolId));
  } catch (error) {
    return fail(error);
  }
}
