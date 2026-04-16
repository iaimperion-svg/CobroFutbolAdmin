import { SchoolStatus, UserStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const cookieStore = {
    get: vi.fn(),
    set: vi.fn()
  };

  const signJwt = {
    setProtectedHeader: vi.fn(),
    setIssuedAt: vi.fn(),
    setExpirationTime: vi.fn(),
    sign: vi.fn()
  };

  signJwt.setProtectedHeader.mockReturnValue(signJwt);
  signJwt.setIssuedAt.mockReturnValue(signJwt);
  signJwt.setExpirationTime.mockReturnValue(signJwt);

  return {
    cookieStore,
    userFindUnique: vi.fn(),
    membershipFindFirst: vi.fn(),
    bcryptCompare: vi.fn(),
    jwtVerify: vi.fn(),
    SignJWT: vi.fn(() => signJwt),
    signJwt
  };
});

vi.mock("bcryptjs", () => ({
  default: {
    compare: mocks.bcryptCompare
  }
}));

vi.mock("jose", () => ({
  SignJWT: mocks.SignJWT,
  jwtVerify: mocks.jwtVerify
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => mocks.cookieStore),
  headers: vi.fn(async () => ({
    get: vi.fn()
  }))
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn()
}));

vi.mock("@/server/config/env", () => ({
  env: {
    JWT_SECRET: "very-secret-token-123"
  }
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique
    },
    userSchoolMembership: {
      findFirst: mocks.membershipFindFirst
    }
  }
}));

import { getSession, loginWithPassword } from "@/server/auth/session";

function buildMembership(overrides?: Partial<{ permissions: string[] }>) {
  const permissions = overrides?.permissions ?? ["students.read"];

  return {
    school: {
      id: "school-1",
      slug: "academia-central",
      status: SchoolStatus.ACTIVE
    },
    user: {
      id: "user-1",
      email: "admin@academia.cl",
      fullName: "Camila Rojas",
      status: UserStatus.ACTIVE
    },
    roles: [
      {
        role: {
          key: "admin",
          permissions: permissions.map((permission) => ({
            permission: { key: permission }
          }))
        }
      }
    ]
  };
}

describe("session service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.signJwt.sign.mockResolvedValue("signed-token");
    mocks.bcryptCompare.mockResolvedValue(true);
    mocks.userFindUnique.mockResolvedValue({
      id: "user-1",
      email: "admin@academia.cl",
      passwordHash: "hash",
      status: UserStatus.ACTIVE
    });
    mocks.membershipFindFirst.mockResolvedValue(buildMembership());
    mocks.jwtVerify.mockResolvedValue({
      payload: {
        userId: "user-1",
        schoolSlug: "academia-central",
        permissions: ["old.permission"]
      }
    });
    mocks.cookieStore.get.mockReturnValue({
      value: "session-token"
    });
  });

  it("bloquea login de usuarios no activos", async () => {
    mocks.userFindUnique.mockResolvedValueOnce({
      id: "user-1",
      email: "admin@academia.cl",
      passwordHash: "hash",
      status: UserStatus.DISABLED
    });

    await expect(
      loginWithPassword({
        email: "admin@academia.cl",
        password: "Passw0rd!"
      })
    ).rejects.toMatchObject({
      message: "Tu usuario no tiene acceso activo"
    });
  });

  it("rehidrata permisos desde base de datos en cada lectura de sesion", async () => {
    mocks.membershipFindFirst.mockResolvedValueOnce(
      buildMembership({
        permissions: ["dashboard.read", "reviews.resolve"]
      })
    );

    const session = await getSession();

    expect(session).toMatchObject({
      userId: "user-1",
      schoolSlug: "academia-central",
      permissions: ["dashboard.read", "reviews.resolve"]
    });
  });

  it("invalida la sesion si la membresia activa ya no existe", async () => {
    mocks.membershipFindFirst.mockResolvedValueOnce(null);

    await expect(getSession()).resolves.toBeNull();
  });
});
