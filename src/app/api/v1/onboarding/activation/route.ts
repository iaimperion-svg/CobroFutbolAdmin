import { z } from "zod";
import { fail, ok } from "@/server/http/response";
import { consumeActivationToken, getActivationSnapshot } from "@/server/services/onboarding.service";

const activationSchema = z.object({
  token: z.string().min(20, "El enlace de activacion no es valido"),
  password: z.string().min(10, "La contrasena debe tener al menos 10 caracteres")
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token") ?? "";
    const snapshot = await getActivationSnapshot(token);

    if (!snapshot) {
      return ok({ valid: false });
    }

    return ok({
      valid: true,
      ...snapshot
    });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = activationSchema.parse(await request.json());
    await consumeActivationToken(body);
    return ok({ activated: true });
  } catch (error) {
    return fail(error);
  }
}
