import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import {
  ChargeStatus,
  ContactChannel,
  MessageChannel,
  MessageDirection,
  MessageStatus,
  PaymentStatus,
  PrismaClient,
  ReconciliationStatus,
  ReceiptFileType,
  ReceiptStatus,
  SchoolStatus,
  UserStatus
} from "@prisma/client";

const prisma = new PrismaClient();
const databaseUrl = process.env.DATABASE_URL ?? "";
const demoSchoolSlug = (process.env.DEMO_SCHOOL_SLUG?.trim().toLowerCase() || "academia-local").replace(
  /[^a-z0-9-]/g,
  "-"
);
const demoSchoolName = process.env.DEMO_SCHOOL_NAME?.trim() || "Academia Local";
const demoLegalName = process.env.DEMO_SCHOOL_LEGAL_NAME?.trim() || `${demoSchoolName} SpA`;
const demoAdminEmail =
  process.env.DEMO_ADMIN_EMAIL?.trim().toLowerCase() || `admin@${demoSchoolSlug}.local`;
const demoOperatorEmail =
  process.env.DEMO_OPERATOR_EMAIL?.trim().toLowerCase() || `operaciones@${demoSchoolSlug}.local`;
const demoPassword = process.env.DEMO_ADMIN_PASSWORD?.trim() || randomBytes(18).toString("base64url");

function assertSeedIsSafe() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("El seed demo esta deshabilitado en production.");
  }

  if (process.env.ALLOW_DESTRUCTIVE_SEED !== "true") {
    throw new Error(
      "Seed bloqueado. Define ALLOW_DESTRUCTIVE_SEED=true solo para una base local desechable."
    );
  }

  const isLocalDatabase = /(?:localhost|127\.0\.0\.1)/i.test(databaseUrl);
  if (!isLocalDatabase && process.env.ALLOW_REMOTE_DESTRUCTIVE_SEED !== "true") {
    throw new Error(
      "DATABASE_URL no parece local. No se permite borrar una base remota sin ALLOW_REMOTE_DESTRUCTIVE_SEED=true."
    );
  }
}

const permissionCatalog = [
  ["dashboard.read", "Ver dashboard financiero"],
  ["students.read", "Ver alumnos"],
  ["students.write", "Crear y editar alumnos"],
  ["charges.read", "Ver cargos"],
  ["charges.write", "Crear y editar cargos"],
  ["receipts.read", "Ver comprobantes"],
  ["reviews.read", "Ver revision manual"],
  ["reviews.resolve", "Resolver revision manual"],
  ["webhooks.manage", "Configurar canales y webhooks"],
  ["settings.manage", "Administrar configuracion del tenant"]
] as const;

async function main() {
  assertSeedIsSafe();

  await prisma.auditLog.deleteMany();
  await prisma.reviewTask.deleteMany();
  await prisma.reconciliationAllocation.deleteMany();
  await prisma.reconciliation.deleteMany();
  await prisma.receiptCandidateMatch.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.charge.deleteMany();
  await prisma.message.deleteMany();
  await prisma.receipt.deleteMany();
  await prisma.studentGuardian.deleteMany();
  await prisma.student.deleteMany();
  await prisma.guardian.deleteMany();
  await prisma.membershipRole.deleteMany();
  await prisma.userSchoolMembership.deleteMany();
  await prisma.rolePermission.deleteMany();
  await prisma.role.deleteMany();
  await prisma.permission.deleteMany();
  await prisma.bankAccount.deleteMany();
  await prisma.user.deleteMany();
  await prisma.school.deleteMany();

  const permissions = await Promise.all(
    permissionCatalog.map(([key, description]) =>
      prisma.permission.create({
        data: { key, description }
      })
    )
  );

  const school = await prisma.school.create({
    data: {
      name: demoSchoolName,
      legalName: demoLegalName,
      slug: demoSchoolSlug,
      status: SchoolStatus.ACTIVE,
      locale: "es-CL",
      timezone: "America/Santiago",
      currency: "CLP"
    }
  });

  const adminRole = await prisma.role.create({
    data: {
      schoolId: school.id,
      name: "Administrador",
      key: "admin",
      description: "Acceso completo al tenant",
      isSystem: true
    }
  });

  const operatorRole = await prisma.role.create({
    data: {
      schoolId: school.id,
      name: "Operaciones",
      key: "operator",
      description: "Revision y conciliacion operativa",
      isSystem: true
    }
  });

  await prisma.rolePermission.createMany({
    data: [
      ...permissions.map((permission) => ({
        roleId: adminRole.id,
        permissionId: permission.id
      })),
      ...permissions
        .filter((permission) =>
          [
            "dashboard.read",
            "students.read",
            "charges.read",
            "receipts.read",
            "reviews.read",
            "reviews.resolve"
          ].includes(permission.key)
        )
        .map((permission) => ({
          roleId: operatorRole.id,
          permissionId: permission.id
        }))
    ]
  });

  const passwordHash = await bcrypt.hash(demoPassword, 10);

  const [adminUser, operatorUser] = await Promise.all([
    prisma.user.create({
      data: {
        email: demoAdminEmail,
        passwordHash,
        fullName: "Camila Rojas",
        status: UserStatus.ACTIVE
      }
    }),
    prisma.user.create({
      data: {
        email: demoOperatorEmail,
        passwordHash,
        fullName: "Matias Soto",
        status: UserStatus.ACTIVE
      }
    })
  ]);

  const [adminMembership, operatorMembership] = await Promise.all([
    prisma.userSchoolMembership.create({
      data: {
        userId: adminUser.id,
        schoolId: school.id,
        isDefault: true
      }
    }),
    prisma.userSchoolMembership.create({
      data: {
        userId: operatorUser.id,
        schoolId: school.id,
        isDefault: true
      }
    })
  ]);

  await prisma.membershipRole.createMany({
    data: [
      { membershipId: adminMembership.id, roleId: adminRole.id },
      { membershipId: operatorMembership.id, roleId: operatorRole.id }
    ]
  });

  const bankAccount = await prisma.bankAccount.create({
    data: {
      schoolId: school.id,
      bankName: "Banco Estado",
      accountHolder: "Academia Central SpA",
      accountNumberMasked: "****2345",
      accountType: "Cuenta Corriente",
      currency: "CLP",
      isDefault: true
    }
  });

  const [guardian1, guardian2, guardian3] = await Promise.all([
    prisma.guardian.create({
      data: {
        schoolId: school.id,
        fullName: "Andrea Perez",
        phone: "+56911111111",
        email: "andrea.perez@mail.cl",
        preferredChannel: ContactChannel.WHATSAPP
      }
    }),
    prisma.guardian.create({
      data: {
        schoolId: school.id,
        fullName: "Rodrigo Diaz",
        phone: "+56922222222",
        email: "rodrigo.diaz@mail.cl",
        preferredChannel: ContactChannel.TELEGRAM
      }
    }),
    prisma.guardian.create({
      data: {
        schoolId: school.id,
        fullName: "Valentina Morales",
        phone: "+56933333333",
        email: "valentina.morales@mail.cl",
        preferredChannel: ContactChannel.WHATSAPP
      }
    })
  ]);

  const [student1, student2, student3] = await Promise.all([
    prisma.student.create({
      data: {
        schoolId: school.id,
        fullName: "Ignacio Perez",
        externalCode: "ALU-001",
        monthlyFeeCents: 3500000,
        billingDay: 10,
        notes: "Categoria sub-10"
      }
    }),
    prisma.student.create({
      data: {
        schoolId: school.id,
        fullName: "Martin Diaz",
        externalCode: "ALU-002",
        monthlyFeeCents: 4000000,
        billingDay: 5,
        notes: "Categoria sub-12"
      }
    }),
    prisma.student.create({
      data: {
        schoolId: school.id,
        fullName: "Lucas Morales",
        externalCode: "ALU-003",
        monthlyFeeCents: 4200000,
        billingDay: 12,
        notes: "Categoria sub-14"
      }
    })
  ]);

  await prisma.studentGuardian.createMany({
    data: [
      {
        studentId: student1.id,
        guardianId: guardian1.id,
        relationship: "Madre",
        isPrimary: true
      },
      {
        studentId: student2.id,
        guardianId: guardian2.id,
        relationship: "Padre",
        isPrimary: true
      },
      {
        studentId: student3.id,
        guardianId: guardian3.id,
        relationship: "Madre",
        isPrimary: true
      }
    ]
  });

  const [charge1, charge2, charge3, charge4, charge5, charge6] = await Promise.all([
    prisma.charge.create({
      data: {
        schoolId: school.id,
        studentId: student1.id,
        guardianId: guardian1.id,
        description: "Mensualidad marzo",
        periodLabel: "2026-03",
        dueDate: new Date("2026-03-10T12:00:00.000Z"),
        amountCents: 3500000,
        outstandingCents: 3500000,
        status: ChargeStatus.OVERDUE
      }
    }),
    prisma.charge.create({
      data: {
        schoolId: school.id,
        studentId: student1.id,
        guardianId: guardian1.id,
        description: "Mensualidad abril",
        periodLabel: "2026-04",
        dueDate: new Date("2026-04-10T12:00:00.000Z"),
        amountCents: 3500000,
        outstandingCents: 3500000,
        status: ChargeStatus.PENDING
      }
    }),
    prisma.charge.create({
      data: {
        schoolId: school.id,
        studentId: student2.id,
        guardianId: guardian2.id,
        description: "Mensualidad abril",
        periodLabel: "2026-04",
        dueDate: new Date("2026-04-05T12:00:00.000Z"),
        amountCents: 4000000,
        outstandingCents: 1500000,
        status: ChargeStatus.PARTIALLY_PAID
      }
    }),
    prisma.charge.create({
      data: {
        schoolId: school.id,
        studentId: student2.id,
        guardianId: guardian2.id,
        description: "Mensualidad mayo",
        periodLabel: "2026-05",
        dueDate: new Date("2026-05-10T12:00:00.000Z"),
        amountCents: 2800000,
        outstandingCents: 0,
        status: ChargeStatus.PAID
      }
    }),
    prisma.charge.create({
      data: {
        schoolId: school.id,
        studentId: student3.id,
        guardianId: guardian3.id,
        description: "Mensualidad abril",
        periodLabel: "2026-04",
        dueDate: new Date("2026-04-12T12:00:00.000Z"),
        amountCents: 4200000,
        outstandingCents: 4200000,
        status: ChargeStatus.PENDING
      }
    }),
    prisma.charge.create({
      data: {
        schoolId: school.id,
        studentId: student3.id,
        guardianId: guardian3.id,
        description: "Mensualidad marzo",
        periodLabel: "2026-03",
        dueDate: new Date("2026-03-12T12:00:00.000Z"),
        amountCents: 4200000,
        outstandingCents: 4200000,
        status: ChargeStatus.OVERDUE
      }
    })
  ]);

  const multiCandidateReceipt = await prisma.receipt.create({
    data: {
      schoolId: school.id,
      guardianId: guardian1.id,
      studentId: student1.id,
      channel: MessageChannel.WHATSAPP,
      status: ReceiptStatus.MANUAL_REVIEW,
      fileType: ReceiptFileType.IMAGE,
      originalFileName: "transferencia-marzo.jpg",
      extractedText: "Transferencia Banco Estado Andrea Perez 35.000 09/03/2026 referencia 8891",
      extractedAmountCents: 3500000,
      extractedPaidAt: new Date("2026-03-09T14:00:00.000Z"),
      extractedSenderName: "Andrea Perez",
      extractedReference: "8891",
      extractedBankName: "Banco Estado",
      extractionConfidence: 0.84
    }
  });

  const message = await prisma.message.create({
    data: {
      schoolId: school.id,
      guardianId: guardian1.id,
      studentId: student1.id,
      channel: MessageChannel.WHATSAPP,
      direction: MessageDirection.INBOUND,
      senderHandle: guardian1.phone,
      senderName: guardian1.fullName,
      bodyText: "Adjunto el comprobante de Ignacio",
      mediaCount: 1,
      status: MessageStatus.PROCESSED
    }
  });

  await prisma.receipt.update({
    where: { id: multiCandidateReceipt.id },
    data: { messageId: message.id }
  });

  const multiCandidatePayment = await prisma.payment.create({
    data: {
      schoolId: school.id,
      studentId: student2.id,
      guardianId: guardian2.id,
      bankAccountId: bankAccount.id,
      amountCents: 2500000,
      paidAt: new Date("2026-04-03T16:00:00.000Z"),
      senderName: guardian2.fullName,
      senderReference: "TRX-20260403",
      bankName: "Banco de Chile",
      source: MessageChannel.TELEGRAM,
      status: PaymentStatus.RECONCILED
    }
  });

  const reconciliation = await prisma.reconciliation.create({
    data: {
      schoolId: school.id,
      paymentId: multiCandidatePayment.id,
      receiptId: multiCandidateReceipt.id,
      status: ReconciliationStatus.SUGGESTED,
      matchScore: 0.79,
      strategy: "manual_review_seed",
      notes: "Caso con multiples candidatos del mismo monto"
    }
  });

  await prisma.reconciliationAllocation.create({
    data: {
      reconciliationId: reconciliation.id,
      chargeId: charge1.id,
      amountCents: 3500000
    }
  });

  await prisma.reviewTask.create({
    data: {
      schoolId: school.id,
      receiptId: multiCandidateReceipt.id,
      reconciliationId: reconciliation.id,
      suggestedStudentId: student1.id,
      suggestedGuardianId: guardian1.id,
      priority: 1,
      reason: "Coincidencia alta pero existen multiples cargos del mismo monto"
    }
  });

  await prisma.receiptCandidateMatch.createMany({
    data: [
      {
        schoolId: school.id,
        receiptId: multiCandidateReceipt.id,
        studentId: student1.id,
        guardianId: guardian1.id,
        chargeId: charge1.id,
        matchType: "CHARGE",
        confidence: 0.79,
        rationale: "Monto exacto, remitente coincide con apoderada principal y fecha cercana al vencimiento"
      },
      {
        schoolId: school.id,
        receiptId: multiCandidateReceipt.id,
        studentId: student1.id,
        guardianId: guardian1.id,
        chargeId: charge2.id,
        matchType: "CHARGE",
        confidence: 0.62,
        rationale: "Mismo alumno y mismo monto, pero periodo posterior"
      }
    ]
  });

  const autoReceipt = await prisma.receipt.create({
    data: {
      schoolId: school.id,
      guardianId: guardian2.id,
      studentId: student2.id,
      channel: MessageChannel.TELEGRAM,
      status: ReceiptStatus.AUTO_RECONCILED,
      fileType: ReceiptFileType.IMAGE,
      originalFileName: "transferencia-auto-mayo.jpg",
      extractedText: "Transferencia Rodrigo Diaz 28.000 mensualidad mayo",
      extractedAmountCents: 2800000,
      extractedPaidAt: new Date("2026-05-02T12:00:00.000Z"),
      extractedSenderName: guardian2.fullName,
      extractedReference: "AUTO-0502",
      extractedBankName: "Banco de Chile",
      extractionConfidence: 0.96,
      processedAt: new Date("2026-05-02T12:05:00.000Z")
    }
  });

  const autoPayment = await prisma.payment.create({
    data: {
      schoolId: school.id,
      studentId: student2.id,
      guardianId: guardian2.id,
      bankAccountId: bankAccount.id,
      receiptId: autoReceipt.id,
      amountCents: 2800000,
      paidAt: new Date("2026-05-02T12:00:00.000Z"),
      senderName: guardian2.fullName,
      senderReference: "AUTO-0502",
      bankName: "Banco de Chile",
      source: MessageChannel.TELEGRAM,
      status: PaymentStatus.RECONCILED
    }
  });

  const autoReconciliation = await prisma.reconciliation.create({
    data: {
      schoolId: school.id,
      paymentId: autoPayment.id,
      receiptId: autoReceipt.id,
      status: ReconciliationStatus.AUTO_CONFIRMED,
      matchScore: 0.96,
      strategy: "automatic_matching_threshold",
      notes: "Caso auto conciliado de referencia",
      executedAt: new Date("2026-05-02T12:05:00.000Z")
    }
  });

  await prisma.reconciliationAllocation.create({
    data: {
      reconciliationId: autoReconciliation.id,
      chargeId: charge4.id,
      amountCents: 2800000
    }
  });

  const reviewReceipt = await prisma.receipt.create({
    data: {
      schoolId: school.id,
      guardianId: guardian3.id,
      studentId: student3.id,
      channel: MessageChannel.WHATSAPP,
      status: ReceiptStatus.MANUAL_REVIEW,
      fileType: ReceiptFileType.IMAGE,
      originalFileName: "transferencia-lucas-abril.jpg",
      extractedText: "Transferencia Valentina Morales 42.000 Lucas abril",
      extractedAmountCents: 4200000,
      extractedPaidAt: new Date("2026-04-10T17:30:00.000Z"),
      extractedSenderName: guardian3.fullName,
      extractedReference: "LUCAS-ABRIL",
      extractedBankName: "Banco Estado",
      extractionConfidence: 0.81
    }
  });

  await prisma.reviewTask.create({
    data: {
      schoolId: school.id,
      receiptId: reviewReceipt.id,
      suggestedStudentId: student3.id,
      suggestedGuardianId: guardian3.id,
      priority: 1,
      reason: "Coincidencia parcial requiere validacion humana"
    }
  });

  await prisma.receiptCandidateMatch.create({
    data: {
      schoolId: school.id,
      receiptId: reviewReceipt.id,
      studentId: student3.id,
      guardianId: guardian3.id,
      chargeId: charge5.id,
      matchType: "CHARGE",
      confidence: 0.73,
      rationale: "Monto exacto y apoderada coincide, pero la fecha del pago es tardia respecto al vencimiento"
    }
  });

  const rejectableReceipt = await prisma.receipt.create({
    data: {
      schoolId: school.id,
      channel: MessageChannel.WHATSAPP,
      status: ReceiptStatus.MANUAL_REVIEW,
      fileType: ReceiptFileType.IMAGE,
      originalFileName: "transferencia-origen-desconocido.jpg",
      extractedText: "Transferencia 51.000 remitente borroso",
      extractedAmountCents: 5100000,
      extractedPaidAt: new Date("2026-04-06T11:40:00.000Z"),
      extractedSenderName: "No identificado",
      extractedReference: "SIN-ORIGEN",
      extractedBankName: "Banco desconocido",
      extractionConfidence: 0.58
    }
  });

  await prisma.reviewTask.create({
    data: {
      schoolId: school.id,
      receiptId: rejectableReceipt.id,
      priority: 2,
      reason: "No se encontro una coincidencia confiable"
    }
  });

  const reassignableReceipt = await prisma.receipt.create({
    data: {
      schoolId: school.id,
      guardianId: guardian2.id,
      studentId: student2.id,
      channel: MessageChannel.TELEGRAM,
      status: ReceiptStatus.MANUAL_REVIEW,
      fileType: ReceiptFileType.IMAGE,
      originalFileName: "transferencia-reasignable.jpg",
      extractedText: "Transferencia Valentina Morales 42.000 Lucas abril",
      extractedAmountCents: 4200000,
      extractedPaidAt: new Date("2026-04-09T10:20:00.000Z"),
      extractedSenderName: guardian3.fullName,
      extractedReference: "REASIGNAR-420",
      extractedBankName: "Banco Estado",
      extractionConfidence: 0.77
    }
  });

  const reassignablePayment = await prisma.payment.create({
    data: {
      schoolId: school.id,
      studentId: student2.id,
      guardianId: guardian2.id,
      bankAccountId: bankAccount.id,
      receiptId: reassignableReceipt.id,
      amountCents: 4200000,
      paidAt: new Date("2026-04-09T10:20:00.000Z"),
      senderName: guardian3.fullName,
      senderReference: "REASIGNAR-420",
      bankName: "Banco Estado",
      source: MessageChannel.TELEGRAM,
      status: PaymentStatus.RECEIVED
    }
  });

  const reassignableReconciliation = await prisma.reconciliation.create({
    data: {
      schoolId: school.id,
      paymentId: reassignablePayment.id,
      receiptId: reassignableReceipt.id,
      status: ReconciliationStatus.SUGGESTED,
      matchScore: 0.74,
      strategy: "manual_review_seed",
      notes: "Caso pensado para reasignar a otro alumno"
    }
  });

  await prisma.reconciliationAllocation.create({
    data: {
      reconciliationId: reassignableReconciliation.id,
      chargeId: charge3.id,
      amountCents: 1500000
    }
  });

  await prisma.reviewTask.create({
    data: {
      schoolId: school.id,
      receiptId: reassignableReceipt.id,
      reconciliationId: reassignableReconciliation.id,
      suggestedStudentId: student2.id,
      suggestedGuardianId: guardian2.id,
      priority: 1,
      reason: "El remitente apunta a otro apoderado y requiere reasignacion manual"
    }
  });

  await prisma.receiptCandidateMatch.createMany({
    data: [
      {
        schoolId: school.id,
        receiptId: reassignableReceipt.id,
        studentId: student2.id,
        guardianId: guardian2.id,
        chargeId: charge3.id,
        matchType: "CHARGE",
        confidence: 0.74,
        rationale: "Monto parcial compatible, pero el remitente no coincide con el apoderado esperado"
      },
      {
        schoolId: school.id,
        receiptId: reassignableReceipt.id,
        studentId: student3.id,
        guardianId: guardian3.id,
        chargeId: charge5.id,
        matchType: "CHARGE",
        confidence: 0.71,
        rationale: "Remitente coincide exactamente con la apoderada y el monto calza con la mensualidad de Lucas"
      }
    ]
  });

  await prisma.reviewNote.create({
    data: {
      schoolId: school.id,
      receiptId: reassignableReceipt.id,
      body: "Caso ideal para probar reasignacion y observaciones internas.",
      authorUserId: operatorUser.id
    }
  });

  await prisma.auditLog.createMany({
    data: [
      {
        schoolId: school.id,
        actorUserId: adminUser.id,
        action: "seed.completed",
        entityType: "System",
        metadata: { schoolSlug: school.slug }
      },
      {
        schoolId: school.id,
        actorUserId: operatorUser.id,
        action: "review.created",
        entityType: "Receipt",
        entityId: multiCandidateReceipt.id,
        metadata: { reason: "seed" }
      },
      {
        schoolId: school.id,
        actorUserId: operatorUser.id,
        action: "review.created",
        entityType: "Receipt",
        entityId: reassignableReceipt.id,
        metadata: { reason: "seed" }
      }
    ]
  });

  console.log("Seed completado");
  console.log({
    school: school.slug,
    adminEmail: adminUser.email,
    operatorEmail: operatorUser.email,
    demoPassword,
    seededCharges: [charge1.id, charge2.id, charge3.id, charge4.id, charge5.id, charge6.id]
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
