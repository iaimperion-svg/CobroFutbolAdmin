import { ContactChannel } from "@prisma/client";
import { z } from "zod";
import { permissionKeys } from "@/server/auth/permissions";
import { requireApiSession } from "@/server/auth/session";
import { fail, ok } from "@/server/http/response";
import { deleteStudent, getStudentById, updateStudent } from "@/server/services/students.service";

const relationshipSchema = z
  .string()
  .trim()
  .min(2, "Debes indicar la relacion del apoderado")
  .max(40, "La relacion del apoderado es demasiado larga");

const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9()\s-]{8,20}$/, "Ingresa un telefono valido")
  .optional()
  .nullable();

const emailSchema = z.string().trim().email("Ingresa un correo valido").optional().nullable();

const guardianSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("existing"),
    guardianId: z.string().min(1, "Selecciona un apoderado"),
    relationship: relationshipSchema
  }),
  z.object({
    mode: z.literal("upsert"),
    guardianId: z.string().optional(),
    fullName: z.string().trim().min(3, "Debes ingresar el nombre del apoderado").max(120),
    relationship: relationshipSchema,
    phone: phoneSchema,
    email: emailSchema,
    preferredChannel: z.nativeEnum(ContactChannel)
  })
]);

const updateStudentSchema = z.object({
  fullName: z.string().trim().min(3, "Debes ingresar el nombre del alumno").max(120),
  monthlyFeeCents: z
    .number()
    .int("La cuota mensual debe ser un numero entero")
    .positive("La cuota mensual debe ser mayor que cero"),
  billingDay: z
    .number()
    .int("El dia de cobro debe ser un numero entero")
    .min(1, "El dia de cobro debe estar entre 1 y 28")
    .max(28, "El dia de cobro debe estar entre 1 y 28"),
  notes: z.string().trim().max(500, "Las notas pueden tener hasta 500 caracteres").optional().nullable(),
  active: z.boolean(),
  guardian: guardianSchema
});

export async function GET(_request: Request, context: { params: Promise<{ studentId: string }> }) {
  try {
    const session = await requireApiSession(permissionKeys.studentsRead);
    const params = await context.params;
    return ok(await getStudentById(params.studentId, session.schoolId));
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ studentId: string }> }) {
  try {
    const session = await requireApiSession(permissionKeys.studentsWrite);
    const params = await context.params;
    const body = updateStudentSchema.parse(await request.json());

    return ok(
      await updateStudent(params.studentId, session.schoolId, {
        fullName: body.fullName,
        monthlyFeeCents: body.monthlyFeeCents,
        billingDay: body.billingDay,
        notes: body.notes,
        active: body.active,
        guardian: body.guardian
      })
    );
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ studentId: string }> }
) {
  try {
    const session = await requireApiSession(permissionKeys.studentsWrite);
    const params = await context.params;

    return ok(await deleteStudent(params.studentId, session.schoolId));
  } catch (error) {
    return fail(error);
  }
}
