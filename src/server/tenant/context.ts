import { prisma } from "@/server/db/prisma";
import { AppError } from "@/server/http/errors";
import { getSession, resolveSchoolSlugFromHeaders } from "@/server/auth/session";

export async function resolveSchoolContext() {
  const session = await getSession();

  if (session) {
    return {
      schoolId: session.schoolId,
      schoolSlug: session.schoolSlug,
      source: "session" as const
    };
  }

  const schoolSlug = await resolveSchoolSlugFromHeaders();
  if (!schoolSlug) {
    throw new AppError("No se pudo resolver la escuela", 400);
  }

  const school = await prisma.school.findUnique({
    where: { slug: schoolSlug }
  });

  if (!school) {
    throw new AppError("Escuela no encontrada", 404);
  }

  return {
    schoolId: school.id,
    schoolSlug: school.slug,
    source: "header" as const
  };
}
