import { loginWithPassword } from "@/server/auth/session";
import { created, fail } from "@/server/http/response";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      email: string;
      password: string;
      schoolSlug?: string;
    };

    const session = await loginWithPassword(body);
    return created(session);
  } catch (error) {
    return fail(error);
  }
}
