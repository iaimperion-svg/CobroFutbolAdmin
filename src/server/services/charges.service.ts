import { ChargeStatus } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { AppError } from "@/server/http/errors";

function ensureValidAmount(amountCents: number) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new AppError("El monto del cargo debe ser un numero entero positivo");
  }

  return amountCents;
}

function ensureValidDueDate(dueDate: Date) {
  if (Number.isNaN(dueDate.getTime())) {
    throw new AppError("La fecha de vencimiento no es valida");
  }

  return dueDate;
}

export async function listCharges(schoolId: string) {
  return prisma.charge.findMany({
    where: { schoolId },
    include: {
      student: true,
      guardian: true
    },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }]
  });
}

export async function createCharge(input: {
  schoolId: string;
  studentId: string;
  guardianId?: string;
  description: string;
  periodLabel?: string;
  dueDate: Date;
  amountCents: number;
}) {
  const dueDate = ensureValidDueDate(input.dueDate);
  const amountCents = ensureValidAmount(input.amountCents);

  const student = await prisma.student.findFirst({
    where: {
      id: input.studentId,
      schoolId: input.schoolId
    },
    select: {
      id: true,
      guardians: {
        select: {
          guardianId: true,
          isPrimary: true
        }
      }
    }
  });

  if (!student) {
    throw new AppError("El alumno seleccionado no existe", 404);
  }

  if (input.guardianId) {
    const guardian = await prisma.guardian.findFirst({
      where: {
        id: input.guardianId,
        schoolId: input.schoolId
      },
      select: {
        id: true
      }
    });

    if (!guardian) {
      throw new AppError("El apoderado seleccionado no existe", 404);
    }

    const guardianBelongsToStudent = student.guardians.some(
      (relation) => relation.guardianId === input.guardianId
    );

    if (!guardianBelongsToStudent) {
      throw new AppError("El apoderado seleccionado no corresponde al alumno indicado");
    }
  }

  return prisma.charge.create({
    data: {
      schoolId: input.schoolId,
      studentId: input.studentId,
      guardianId: input.guardianId,
      description: input.description,
      periodLabel: input.periodLabel,
      dueDate,
      amountCents,
      outstandingCents: amountCents,
      status: dueDate.getTime() < Date.now() ? ChargeStatus.OVERDUE : ChargeStatus.PENDING
    }
  });
}
