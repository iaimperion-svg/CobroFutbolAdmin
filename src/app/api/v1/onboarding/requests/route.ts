import { OnboardingPlan } from "@prisma/client";
import { z } from "zod";
import { created, fail } from "@/server/http/response";
import { createOnboardingRequest } from "@/server/services/onboarding.service";

const onboardingRequestSchema = z.object({
  fullName: z.string().trim().min(3, "Ingresa tu nombre completo"),
  academyName: z.string().trim().min(3, "Ingresa el nombre de la academia"),
  email: z.string().trim().email("Ingresa un correo valido"),
  phone: z.string().trim().min(8, "Ingresa un WhatsApp o telefono valido"),
  city: z.string().trim().max(120).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
  plan: z.nativeEnum(OnboardingPlan)
});

export async function POST(request: Request) {
  try {
    const body = onboardingRequestSchema.parse(await request.json());
    const result = await createOnboardingRequest(body);
    return created(result);
  } catch (error) {
    return fail(error);
  }
}
