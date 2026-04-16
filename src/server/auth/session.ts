import bcrypt from "bcryptjs";
import { SchoolStatus, UserStatus } from "@prisma/client";
import { SignJWT, jwtVerify } from "jose";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db/prisma";
import { AppError } from "@/server/http/errors";
import { env } from "@/server/config/env";

const SESSION_COOKIE = "cf_session";

export type SessionPayload = {
  userId: string;
  schoolId: string;
  schoolSlug: string;
  email: string;
  fullName: string;
  roles: string[];
  permissions: string[];
};

function getJwtKey() {
  return new TextEncoder().encode(env.JWT_SECRET);
}

async function buildSessionPayload(userId: string, schoolSlug?: string): Promise<SessionPayload> {
  const membership = await prisma.userSchoolMembership.findFirst({
    where: {
      userId,
      user: {
        status: UserStatus.ACTIVE
      },
      school: {
        status: SchoolStatus.ACTIVE,
        ...(schoolSlug ? { slug: schoolSlug } : {})
      },
    },
    include: {
      school: true,
      user: true,
      roles: {
        include: {
          role: {
            include: {
              permissions: {
                include: {
                  permission: true
                }
              }
            }
          }
        }
      }
    },
    orderBy: {
      isDefault: "desc"
    }
  });

  if (!membership) {
    throw new AppError("No membership found for user", 401);
  }

  const roles = membership.roles.map((entry) => entry.role.key);
  const permissions = membership.roles.flatMap((entry) =>
    entry.role.permissions.map((item) => item.permission.key)
  );

  return {
    userId: membership.user.id,
    schoolId: membership.school.id,
    schoolSlug: membership.school.slug,
    email: membership.user.email,
    fullName: membership.user.fullName,
    roles,
    permissions: Array.from(new Set(permissions))
  };
}

export async function loginWithPassword(params: {
  email: string;
  password: string;
  schoolSlug?: string;
}) {
  const user = await prisma.user.findUnique({
    where: { email: params.email.toLowerCase().trim() }
  });

  if (!user) {
    throw new AppError("Credenciales invalidas", 401);
  }

  if (user.status !== UserStatus.ACTIVE) {
    throw new AppError("Tu usuario no tiene acceso activo", 403);
  }

  const passwordMatches = await bcrypt.compare(params.password, user.passwordHash);
  if (!passwordMatches) {
    throw new AppError("Credenciales invalidas", 401);
  }

  const payload = await buildSessionPayload(user.id, params.schoolSlug);
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(getJwtKey());

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12
  });

  return payload;
}

export async function logoutSession() {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, "", {
    httpOnly: true,
    path: "/",
    expires: new Date(0)
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (!token) {
    return null;
  }

  try {
    const result = await jwtVerify(token, getJwtKey());
    const payload = result.payload as SessionPayload;
    return await buildSessionPayload(payload.userId, payload.schoolSlug);
  } catch {
    return null;
  }
}

export async function requireSession() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  return session;
}

export async function requireApiSession(permission?: string) {
  const session = await getSession();

  if (!session) {
    throw new AppError("No autenticado", 401);
  }

  if (permission && !session.permissions.includes(permission)) {
    throw new AppError("No autorizado", 403);
  }

  return session;
}

export async function resolveSchoolSlugFromHeaders() {
  const headerStore = await headers();
  return headerStore.get("x-school-slug") ?? headerStore.get("x-tenant-slug");
}
