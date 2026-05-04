import { prisma } from "@/server/db/prisma";
import { AppError } from "@/server/http/errors";

function normalizeRequiredText(value: string | null | undefined, label: string) {
  const normalized = value?.trim() ?? "";
  if (!normalized) {
    throw new AppError(`Debes ingresar ${label}`);
  }

  return normalized;
}

function normalizeOptionalEmail(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (!normalized) {
    return null;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new AppError("Debes ingresar un correo operativo valido");
  }

  return normalized;
}

function normalizeAccountNumber(value: string | null | undefined) {
  const digits = (value ?? "").replace(/[^\d]/g, "");
  return digits.length > 0 ? digits : null;
}

function maskAccountNumber(accountNumber: string) {
  if (accountNumber.length <= 4) {
    return accountNumber;
  }

  const visibleDigits = accountNumber.slice(-6);
  const hiddenDigits = "*".repeat(Math.max(4, accountNumber.length - visibleDigits.length));
  return `${hiddenDigits}${visibleDigits}`;
}

function buildMissingItems(input: {
  operationsEmail: string | null;
  defaultBankAccount: {
    bankName: string | null;
    accountType: string | null;
    accountHolder: string | null;
    accountNumberMasked: string | null;
    accountNumberReference: string | null;
  } | null;
}) {
  const items: string[] = [];

  if (!input.operationsEmail) {
    items.push("correo_operativo");
  }

  if (
    !input.defaultBankAccount ||
    !input.defaultBankAccount.bankName ||
    !input.defaultBankAccount.accountType ||
    !input.defaultBankAccount.accountHolder ||
    (!input.defaultBankAccount.accountNumberReference && !input.defaultBankAccount.accountNumberMasked)
  ) {
    items.push("cuenta_bancaria");
  }

  return items;
}

export async function getSchoolSetupSnapshot(schoolId: string) {
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    include: {
      bankAccounts: {
        where: { isDefault: true },
        orderBy: { createdAt: "asc" },
        take: 1
      }
    }
  });

  if (!school) {
    throw new AppError("Escuela no encontrada", 404);
  }

  const defaultBankAccount = school.bankAccounts[0] ?? null;
  const missingItems = buildMissingItems({
    operationsEmail: school.operationsEmail,
    defaultBankAccount: defaultBankAccount
      ? {
          bankName: defaultBankAccount.bankName,
          accountType: defaultBankAccount.accountType,
          accountHolder: defaultBankAccount.accountHolder,
          accountNumberMasked: defaultBankAccount.accountNumberMasked,
          accountNumberReference: defaultBankAccount.accountNumberReference
        }
      : null
  });

  return {
    schoolId: school.id,
    schoolName: school.name,
    operationsEmail: school.operationsEmail,
    setupCompletedAt: school.setupCompletedAt,
    isComplete: missingItems.length === 0,
    missingItems,
    defaultBankAccount: defaultBankAccount
      ? {
          id: defaultBankAccount.id,
          bankName: defaultBankAccount.bankName,
          accountType: defaultBankAccount.accountType,
          accountHolder: defaultBankAccount.accountHolder,
          accountNumberMasked: defaultBankAccount.accountNumberMasked
        }
      : null
  };
}

export async function upsertSchoolSetup(input: {
  schoolId: string;
  operationsEmail: string;
  bankName: string;
  accountType: string;
  accountHolder: string;
  accountNumber?: string | null;
}) {
  const operationsEmail = normalizeOptionalEmail(input.operationsEmail);
  if (!operationsEmail) {
    throw new AppError("Debes ingresar un correo operativo");
  }

  const bankName = normalizeRequiredText(input.bankName, "el banco");
  const accountType = normalizeRequiredText(input.accountType, "el tipo de cuenta");
  const accountHolder = normalizeRequiredText(input.accountHolder, "el titular de la cuenta");
  const nextAccountNumber = normalizeAccountNumber(input.accountNumber);

  return prisma.$transaction(async (tx) => {
    const school = await tx.school.findUnique({
      where: { id: input.schoolId },
      include: {
        bankAccounts: {
          where: { isDefault: true },
          orderBy: { createdAt: "asc" },
          take: 1
        }
      }
    });

    if (!school) {
      throw new AppError("Escuela no encontrada", 404);
    }

    const currentDefaultAccount = school.bankAccounts[0] ?? null;
    const accountNumberReference = nextAccountNumber ?? currentDefaultAccount?.accountNumberReference ?? null;

    if (!accountNumberReference || accountNumberReference.length < 6) {
      throw new AppError("Debes ingresar un numero de cuenta valido");
    }

    const accountNumberMasked = maskAccountNumber(accountNumberReference);

    await tx.school.update({
      where: { id: input.schoolId },
      data: {
        operationsEmail,
        setupCompletedAt: new Date()
      }
    });

    await tx.bankAccount.updateMany({
      where: {
        schoolId: input.schoolId,
        isDefault: true
      },
      data: {
        isDefault: false
      }
    });

    const updatedAccount = currentDefaultAccount
      ? await tx.bankAccount.update({
          where: { id: currentDefaultAccount.id },
          data: {
            bankName,
            accountType,
            accountHolder,
            accountNumberMasked,
            accountNumberReference,
            currency: school.currency,
            isDefault: true
          }
        })
      : await tx.bankAccount.create({
          data: {
            schoolId: input.schoolId,
            bankName,
            accountType,
            accountHolder,
            accountNumberMasked,
            accountNumberReference,
            currency: school.currency,
            isDefault: true
          }
        });

    return {
      schoolId: school.id,
      schoolName: school.name,
      operationsEmail,
      setupCompletedAt: new Date(),
      isComplete: true,
      missingItems: [],
      defaultBankAccount: {
        id: updatedAccount.id,
        bankName: updatedAccount.bankName,
        accountType: updatedAccount.accountType,
        accountHolder: updatedAccount.accountHolder,
        accountNumberMasked: updatedAccount.accountNumberMasked
      }
    };
  });
}
