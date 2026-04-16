import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/server/http/errors";

const mocks = vi.hoisted(() => ({
  studentFindFirst: vi.fn(),
  guardianFindFirst: vi.fn(),
  chargeCreate: vi.fn()
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    student: {
      findFirst: mocks.studentFindFirst
    },
    guardian: {
      findFirst: mocks.guardianFindFirst
    },
    charge: {
      create: mocks.chargeCreate
    }
  }
}));

import { createCharge } from "@/server/services/charges.service";

describe("charges.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.studentFindFirst.mockResolvedValue({
      id: "student-1",
      guardians: [{ guardianId: "guardian-1", isPrimary: true }]
    });
    mocks.guardianFindFirst.mockResolvedValue({
      id: "guardian-1"
    });
    mocks.chargeCreate.mockResolvedValue({
      id: "charge-1"
    });
  });

  it("crea cargos solo con alumno y apoderado consistentes dentro del tenant", async () => {
    const result = await createCharge({
      schoolId: "school-1",
      studentId: "student-1",
      guardianId: "guardian-1",
      description: "Mensualidad mayo",
      periodLabel: "2026-05",
      dueDate: new Date("2026-05-10T12:00:00.000Z"),
      amountCents: 3500000
    });

    expect(result).toEqual({ id: "charge-1" });
    expect(mocks.studentFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "student-1",
          schoolId: "school-1"
        }
      })
    );
    expect(mocks.guardianFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "guardian-1",
          schoolId: "school-1"
        }
      })
    );
    expect(mocks.chargeCreate).toHaveBeenCalled();
  });

  it("rechaza apoderados que no pertenecen al alumno", async () => {
    mocks.studentFindFirst.mockResolvedValue({
      id: "student-1",
      guardians: [{ guardianId: "guardian-2", isPrimary: true }]
    });

    await expect(
      createCharge({
        schoolId: "school-1",
        studentId: "student-1",
        guardianId: "guardian-1",
        description: "Mensualidad mayo",
        periodLabel: "2026-05",
        dueDate: new Date("2026-05-10T12:00:00.000Z"),
        amountCents: 3500000
      })
    ).rejects.toMatchObject({
      message: "El apoderado seleccionado no corresponde al alumno indicado"
    } satisfies Partial<AppError>);

    expect(mocks.chargeCreate).not.toHaveBeenCalled();
  });
});
