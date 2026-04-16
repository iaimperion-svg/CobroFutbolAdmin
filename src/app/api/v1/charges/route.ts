import { z } from "zod";
import { permissionKeys } from "@/server/auth/permissions";
import { requireApiSession } from "@/server/auth/session";
import { created, fail, ok } from "@/server/http/response";
import { createCharge, listCharges } from "@/server/services/charges.service";

const createChargeSchema = z.object({
  studentId: z.string().min(1, "Selecciona un alumno"),
  guardianId: z.string().min(1, "Selecciona un apoderado").optional(),
  description: z.string().trim().min(3, "Debes ingresar una descripcion").max(160),
  periodLabel: z.string().trim().max(20).optional(),
  dueDate: z.string().datetime("La fecha de vencimiento no es valida"),
  amountCents: z
    .number()
    .int("El monto del cargo debe ser un numero entero")
    .positive("El monto del cargo debe ser mayor que cero")
});

export async function GET() {
  try {
    const session = await requireApiSession(permissionKeys.chargesRead);
    return ok(await listCharges(session.schoolId));
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireApiSession(permissionKeys.chargesWrite);
    const body = createChargeSchema.parse(await request.json());

    const charge = await createCharge({
      schoolId: session.schoolId,
      studentId: body.studentId,
      guardianId: body.guardianId,
      description: body.description,
      periodLabel: body.periodLabel,
      dueDate: new Date(body.dueDate),
      amountCents: body.amountCents
    });

    return created(charge);
  } catch (error) {
    return fail(error);
  }
}
