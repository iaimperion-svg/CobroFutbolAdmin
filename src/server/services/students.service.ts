import { ChargeStatus, ContactChannel, Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { AppError } from "@/server/http/errors";

function normalizeOptionalText(value: string | null | undefined) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeRequiredText(value: string, fieldLabel: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new AppError(`Debes ingresar ${fieldLabel}`);
  }

  return trimmed;
}

function normalizeStudentName(value: string) {
  return normalizeRequiredText(value, "el nombre del alumno");
}

function normalizeEmail(value: string | null | undefined) {
  const normalized = normalizeOptionalText(value);

  if (normalized === undefined || normalized === null) {
    return normalized;
  }

  return normalized.toLowerCase();
}

function normalizePhone(value: string | null | undefined) {
  return normalizeOptionalText(value);
}

function normalizeMonthlyFee(value: number | null | undefined) {
  if (value === undefined || value === null) {
    return null;
  }

  if (!Number.isInteger(value) || value <= 0) {
    throw new AppError("La cuota mensual debe ser un monto positivo");
  }

  return value;
}

function normalizeBillingDay(value: number | null | undefined) {
  if (value === undefined || value === null) {
    return 10;
  }

  if (!Number.isInteger(value) || value < 1 || value > 28) {
    throw new AppError("El dia de cobro debe estar entre 1 y 28");
  }

  return value;
}

function buildCurrentMonthlyCharge(input: {
  schoolId: string;
  studentId: string;
  guardianId: string | null;
  monthlyFeeCents: number;
  billingDay: number;
}) {
  const now = new Date();
  const dueDate = new Date(
    now.getFullYear(),
    now.getMonth(),
    input.billingDay,
    12,
    0,
    0,
    0
  );
  const periodLabel = `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, "0")}`;
  const monthLabel = new Intl.DateTimeFormat("es-CL", { month: "long" }).format(dueDate);

  return {
    schoolId: input.schoolId,
    studentId: input.studentId,
    guardianId: input.guardianId ?? undefined,
    description: `Mensualidad ${monthLabel}`,
    periodLabel,
    dueDate,
    amountCents: input.monthlyFeeCents,
    outstandingCents: input.monthlyFeeCents,
    status: dueDate.getTime() < Date.now() ? ChargeStatus.OVERDUE : ChargeStatus.PENDING
  };
}

async function ensureInitialMonthlyCharge(
  tx: Prisma.TransactionClient,
  input: {
    schoolId: string;
    studentId: string;
    guardianId: string | null;
    monthlyFeeCents: number | null;
    billingDay: number;
  }
) {
  if (!input.monthlyFeeCents) {
    return;
  }

  const chargeData = buildCurrentMonthlyCharge({
    schoolId: input.schoolId,
    studentId: input.studentId,
    guardianId: input.guardianId,
    monthlyFeeCents: input.monthlyFeeCents,
    billingDay: input.billingDay
  });

  const existingCharge = await tx.charge.findFirst({
    where: {
      schoolId: input.schoolId,
      studentId: input.studentId,
      periodLabel: chargeData.periodLabel,
      description: chargeData.description
    },
    select: {
      id: true
    }
  });

  if (existingCharge) {
    return;
  }

  await tx.charge.create({
    data: chargeData
  });
}

const studentDetailsInclude = {
  guardians: {
    include: {
      guardian: true
    },
    orderBy: [{ isPrimary: "desc" as const }, { guardian: { fullName: "asc" as const } }]
  },
  charges: {
    orderBy: { dueDate: "asc" as const }
  }
} satisfies Prisma.StudentInclude;

type ExistingGuardianInput = {
  mode: "existing";
  guardianId: string;
  relationship: string;
};

type UpsertGuardianInput = {
  mode: "upsert";
  guardianId?: string;
  fullName: string;
  relationship: string;
  phone?: string | null;
  email?: string | null;
  preferredChannel: ContactChannel;
};

type StudentGuardianInput = ExistingGuardianInput | UpsertGuardianInput;

type StudentWriteInput = {
  schoolId: string;
  fullName: string;
  monthlyFeeCents?: number | null;
  billingDay?: number | null;
  notes?: string | null;
  active?: boolean;
  guardian: StudentGuardianInput;
};

async function generateNextExternalCode(tx: Prisma.TransactionClient, schoolId: string) {
  const students = await tx.student.findMany({
    where: {
      schoolId,
      externalCode: {
        not: null
      }
    },
    select: {
      externalCode: true
    }
  });

  const highestSequence = students.reduce((maxValue, student) => {
    const match = student.externalCode?.match(/^ALU-(\d+)$/);
    const value = match ? Number(match[1]) : 0;
    return value > maxValue ? value : maxValue;
  }, 0);

  return `ALU-${String(highestSequence + 1).padStart(3, "0")}`;
}

async function syncPrimaryGuardian(
  tx: Prisma.TransactionClient,
  schoolId: string,
  studentId: string,
  guardianInput: StudentGuardianInput
) {
  const relationship = normalizeRequiredText(
    guardianInput.relationship,
    "la relacion del apoderado"
  );

  let guardianId = "";

  if (guardianInput.mode === "existing") {
    const guardian = await tx.guardian.findFirst({
      where: {
        id: guardianInput.guardianId,
        schoolId
      },
      select: {
        id: true
      }
    });

    if (!guardian) {
      throw new AppError("El apoderado seleccionado no existe", 404);
    }

    guardianId = guardian.id;
  } else {
    const fullName = normalizeRequiredText(guardianInput.fullName, "el nombre del apoderado");
    const phone = normalizePhone(guardianInput.phone);
    const email = normalizeEmail(guardianInput.email);

    if (!phone && !email) {
      throw new AppError("El apoderado debe tener al menos telefono o correo");
    }

    if (guardianInput.guardianId) {
      const currentGuardian = await tx.guardian.findFirst({
        where: {
          id: guardianInput.guardianId,
          schoolId
        },
        select: {
          id: true
        }
      });

      if (!currentGuardian) {
        throw new AppError("El apoderado actual no existe", 404);
      }

      guardianId = currentGuardian.id;

      await tx.guardian.update({
        where: {
          id: guardianId
        },
        data: {
          fullName,
          phone,
          email,
          preferredChannel: guardianInput.preferredChannel
        }
      });
    } else {
      const duplicateGuardian = await tx.guardian.findFirst({
        where: {
          schoolId,
          OR: [
            phone ? { phone } : undefined,
            email ? { email } : undefined
          ].filter(Boolean) as Prisma.GuardianWhereInput[]
        },
        select: {
          id: true
        }
      });

      if (duplicateGuardian) {
        throw new AppError(
          "Ya existe un apoderado con ese telefono o correo. Vinculalo desde la lista existente.",
          409
        );
      }

      const guardian = await tx.guardian.create({
        data: {
          schoolId,
          fullName,
          phone,
          email,
          preferredChannel: guardianInput.preferredChannel
        },
        select: {
          id: true
        }
      });

      guardianId = guardian.id;
    }
  }

  await tx.studentGuardian.updateMany({
    where: {
      studentId
    },
    data: {
      isPrimary: false
    }
  });

  await tx.studentGuardian.upsert({
    where: {
      studentId_guardianId: {
        studentId,
        guardianId
      }
    },
    update: {
      relationship,
      isPrimary: true
    },
    create: {
      studentId,
      guardianId,
      relationship,
      isPrimary: true
    }
  });

  return guardianId;
}

export async function listStudents(schoolId: string) {
  return prisma.student.findMany({
    where: { schoolId },
    include: studentDetailsInclude,
    orderBy: { fullName: "asc" }
  });
}

export async function listGuardiansForStudentForm(schoolId: string) {
  return prisma.guardian.findMany({
    where: { schoolId },
    orderBy: { fullName: "asc" },
    select: {
      id: true,
      fullName: true,
      phone: true,
      email: true,
      preferredChannel: true,
      students: {
        include: {
          student: {
            select: {
              id: true,
              fullName: true
            }
          }
        },
        orderBy: [{ isPrimary: "desc" }, { student: { fullName: "asc" } }]
      }
    }
  });
}

export async function createStudent(input: StudentWriteInput) {
  const notes = normalizeOptionalText(input.notes);
  const monthlyFeeCents = normalizeMonthlyFee(input.monthlyFeeCents);
  const billingDay = normalizeBillingDay(input.billingDay);

  const student = await prisma.$transaction(async (tx) => {
    const externalCode = await generateNextExternalCode(tx, input.schoolId);

    const createdStudent = await tx.student.create({
      data: {
        schoolId: input.schoolId,
        fullName: normalizeStudentName(input.fullName),
        externalCode,
        monthlyFeeCents,
        billingDay,
        notes,
        active: input.active ?? true
      },
      select: {
        id: true
      }
    });

    const guardianId = await syncPrimaryGuardian(tx, input.schoolId, createdStudent.id, input.guardian);
    await ensureInitialMonthlyCharge(tx, {
      schoolId: input.schoolId,
      studentId: createdStudent.id,
      guardianId,
      monthlyFeeCents,
      billingDay
    });
    return createdStudent;
  });

  return getStudentById(student.id, input.schoolId);
}

export async function updateStudent(
  studentId: string,
  schoolId: string,
  input: Omit<StudentWriteInput, "schoolId">
) {
  const student = await prisma.student.findFirst({
    where: {
      id: studentId,
      schoolId
    },
    select: {
      id: true,
      externalCode: true
    }
  });

  if (!student) {
    throw new AppError("Alumno no encontrado", 404);
  }

  const notes = normalizeOptionalText(input.notes);
  const monthlyFeeCents = normalizeMonthlyFee(input.monthlyFeeCents);
  const billingDay = normalizeBillingDay(input.billingDay);

  await prisma.$transaction(async (tx) => {
    const externalCode = student.externalCode ?? (await generateNextExternalCode(tx, schoolId));

    await tx.student.update({
      where: {
        id: studentId
      },
      data: {
        fullName: normalizeStudentName(input.fullName),
        externalCode: externalCode ?? null,
        monthlyFeeCents,
        billingDay,
        notes: notes ?? null,
        active: input.active ?? true
      }
    });

    const guardianId = await syncPrimaryGuardian(tx, schoolId, studentId, input.guardian);

    const chargesCount = await tx.charge.count({
      where: {
        schoolId,
        studentId
      }
    });

    if (chargesCount === 0) {
      await ensureInitialMonthlyCharge(tx, {
        schoolId,
        studentId,
        guardianId,
        monthlyFeeCents,
        billingDay
      });
    }
  });

  return getStudentById(studentId, schoolId);
}

export async function getStudentById(studentId: string, schoolId: string) {
  const student = await prisma.student.findFirst({
    where: {
      id: studentId,
      schoolId
    },
    include: studentDetailsInclude
  });

  if (!student) {
    throw new AppError("Alumno no encontrado", 404);
  }

  return student;
}

export async function deleteStudent(studentId: string, schoolId: string) {
  const student = await prisma.student.findFirst({
    where: {
      id: studentId,
      schoolId
    },
    select: {
      id: true
    }
  });

  if (!student) {
    throw new AppError("Alumno no encontrado", 404);
  }

  const [chargesCount, paymentsCount, receiptsCount, messagesCount, reviewTasksCount, matchesCount] =
    await prisma.$transaction([
      prisma.charge.count({ where: { studentId, schoolId } }),
      prisma.payment.count({ where: { studentId, schoolId } }),
      prisma.receipt.count({ where: { studentId, schoolId } }),
      prisma.message.count({ where: { studentId, schoolId } }),
      prisma.reviewTask.count({ where: { suggestedStudentId: studentId, schoolId } }),
      prisma.receiptCandidateMatch.count({ where: { studentId, schoolId } })
    ]);

  if (
    chargesCount + paymentsCount + receiptsCount + messagesCount + reviewTasksCount + matchesCount >
    0
  ) {
    throw new AppError(
      "No se puede eliminar el alumno porque tiene movimientos asociados. Puedes desactivarlo.",
      409
    );
  }

  await prisma.student.delete({
    where: {
      id: studentId
    }
  });

  return { deleted: true };
}
