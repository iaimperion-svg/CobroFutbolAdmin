import { ContactChannel } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/server/http/errors";
import { createStudent, deleteStudent, updateStudent } from "@/server/services/students.service";

const {
  prismaMock,
  txMock
} = vi.hoisted(() => {
  const tx = {
    student: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn()
    },
    charge: {
      findFirst: vi.fn(),
      create: vi.fn(),
      count: vi.fn()
    },
    guardian: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn()
    },
    studentGuardian: {
      updateMany: vi.fn(),
      upsert: vi.fn()
    }
  };

  return {
    txMock: tx,
    prismaMock: {
      student: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        delete: vi.fn()
      },
      guardian: {
        findMany: vi.fn()
      },
      charge: {
        count: vi.fn()
      },
      payment: {
        count: vi.fn()
      },
      receipt: {
        count: vi.fn()
      },
      message: {
        count: vi.fn()
      },
      reviewTask: {
        count: vi.fn()
      },
      receiptCandidateMatch: {
        count: vi.fn()
      },
      $transaction: vi.fn()
    }
  };
});

vi.mock("@/server/db/prisma", () => ({
  prisma: prismaMock
}));

function buildHydratedStudent(
  overrides?: Partial<{
    id: string;
    schoolId: string;
    fullName: string;
    externalCode: string | null;
    monthlyFeeCents: number | null;
    billingDay: number;
    notes: string | null;
    active: boolean;
    guardianId: string;
    guardianName: string;
    guardianPhone: string | null;
    guardianEmail: string | null;
    relationship: string;
  }>
) {
  const {
    id = "student-1",
    schoolId = "school-1",
    fullName = "Ignacio Perez",
    externalCode = "ALU-001",
    monthlyFeeCents = 3500000,
    billingDay = 10,
    notes = "Observacion",
    active = true,
    guardianId = "guardian-1",
    guardianName = "Andrea Perez",
    guardianPhone = "+56911111111",
    guardianEmail = "andrea@mail.cl",
    relationship = "Madre"
  } = overrides ?? {};

  return {
    id,
    schoolId,
    fullName,
    externalCode,
    monthlyFeeCents,
    billingDay,
    notes,
    active,
    guardians: [
      {
        relationship,
        isPrimary: true,
        guardian: {
          id: guardianId,
          fullName: guardianName,
          phone: guardianPhone,
          email: guardianEmail,
          preferredChannel: ContactChannel.WHATSAPP
        }
      }
    ],
    charges: [
      {
        outstandingCents: 7000000
      }
    ]
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation(async (input) => {
    if (typeof input === "function") {
      return input(txMock);
    }

    return [0, 0, 0, 0, 0, 0];
  });
  prismaMock.student.findFirst.mockResolvedValue(buildHydratedStudent());
  txMock.student.findFirst.mockResolvedValue(null);
  txMock.student.findMany.mockResolvedValue([]);
  txMock.charge.findFirst.mockResolvedValue(null);
  txMock.charge.count.mockResolvedValue(0);
  txMock.guardian.findFirst.mockResolvedValue(null);
  txMock.student.create.mockResolvedValue({ id: "student-1" });
  txMock.charge.create.mockResolvedValue({ id: "charge-1" });
  txMock.guardian.create.mockResolvedValue({ id: "guardian-1" });
  txMock.student.update.mockResolvedValue({ id: "student-1" });
  txMock.guardian.update.mockResolvedValue({ id: "guardian-1" });
  txMock.studentGuardian.updateMany.mockResolvedValue({ count: 0 });
  txMock.studentGuardian.upsert.mockResolvedValue({});
});

describe("students.service", () => {
  it("crea un alumno con codigo interno automatico, apoderado principal y devuelve la version hidratada", async () => {
    const student = await createStudent({
      schoolId: "school-1",
      fullName: " Ignacio Perez ",
      monthlyFeeCents: 2417000,
      billingDay: 10,
      notes: " Observacion ",
      active: true,
      guardian: {
        mode: "upsert",
        fullName: " Andrea Perez ",
        relationship: "Madre",
        phone: "+56911111111",
        email: "andrea@mail.cl",
        preferredChannel: ContactChannel.WHATSAPP
      }
    });

    expect(txMock.student.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          schoolId: "school-1",
          fullName: "Ignacio Perez",
          externalCode: "ALU-001",
          monthlyFeeCents: 2417000,
          billingDay: 10,
          notes: "Observacion",
          active: true
        })
      })
    );
    expect(txMock.charge.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          schoolId: "school-1",
          studentId: "student-1",
          amountCents: 2417000,
          outstandingCents: 2417000,
          periodLabel: expect.stringMatching(/^\d{4}-\d{2}$/)
        })
      })
    );
    expect(txMock.guardian.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fullName: "Andrea Perez",
          phone: "+56911111111",
          email: "andrea@mail.cl",
          preferredChannel: ContactChannel.WHATSAPP
        })
      })
    );
    expect(txMock.studentGuardian.upsert).toHaveBeenCalled();
    expect(student.guardians[0]?.guardian.fullName).toBe("Andrea Perez");
  });

  it("actualiza un alumno y permite vincular un apoderado existente", async () => {
    prismaMock.student.findFirst
      .mockResolvedValueOnce({ id: "student-1", externalCode: null })
      .mockResolvedValueOnce(
        buildHydratedStudent({
          fullName: "Ignacio Perez Actualizado",
          externalCode: null,
          monthlyFeeCents: 2417000,
          billingDay: 12,
          notes: null,
          active: false,
          guardianId: "guardian-2",
          guardianName: "Valentina Morales",
          guardianPhone: "+56922222222",
          guardianEmail: "valentina@mail.cl",
          relationship: "Apoderado"
        })
      );
    txMock.student.findFirst.mockResolvedValue(null);
    txMock.student.findMany.mockResolvedValue([{ externalCode: "ALU-001" }]);
    txMock.guardian.findFirst.mockResolvedValue({ id: "guardian-2" });

    const student = await updateStudent("student-1", "school-1", {
      fullName: " Ignacio Perez Actualizado ",
      monthlyFeeCents: 2417000,
      billingDay: 12,
      notes: null,
      active: false,
      guardian: {
        mode: "existing",
        guardianId: "guardian-2",
        relationship: "Apoderado"
      }
    });

    expect(txMock.student.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fullName: "Ignacio Perez Actualizado",
          externalCode: "ALU-002",
          monthlyFeeCents: 2417000,
          billingDay: 12,
          notes: null,
          active: false
        })
      })
    );
    expect(txMock.studentGuardian.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          guardianId: "guardian-2",
          relationship: "Apoderado",
          isPrimary: true
        })
      })
    );
    expect(student.guardians[0]?.guardian.id).toBe("guardian-2");
  });

  it("genera el siguiente codigo interno disponible segun la secuencia actual", async () => {
    txMock.student.findMany.mockResolvedValue([
      { externalCode: "ALU-001" },
      { externalCode: "ALU-002" },
      { externalCode: "ALU-009" }
    ]);

    await createStudent({
      schoolId: "school-1",
      fullName: "Ignacio Perez",
      monthlyFeeCents: 2417000,
      billingDay: 10,
      guardian: {
        mode: "upsert",
        fullName: "Andrea Perez",
        relationship: "Madre",
        phone: "+56911111111",
        email: null,
        preferredChannel: ContactChannel.WHATSAPP
      }
    });

    expect(txMock.student.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          externalCode: "ALU-010"
        })
      })
    );
  });

  it("bloquea la eliminacion cuando el alumno tiene movimientos", async () => {
    prismaMock.student.findFirst.mockResolvedValue({ id: "student-1" });
    prismaMock.$transaction.mockResolvedValue([1, 0, 0, 0, 0, 0]);

    await expect(deleteStudent("student-1", "school-1")).rejects.toBeInstanceOf(AppError);
    expect(prismaMock.student.delete).not.toHaveBeenCalled();
  });
});
