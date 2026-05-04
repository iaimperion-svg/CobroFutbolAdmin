import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  schoolFindUnique: vi.fn(),
  schoolUpdate: vi.fn(),
  bankAccountUpdateMany: vi.fn(),
  bankAccountUpdate: vi.fn(),
  bankAccountCreate: vi.fn(),
  prismaTransaction: vi.fn()
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    school: {
      findUnique: mocks.schoolFindUnique
    },
    $transaction: mocks.prismaTransaction
  }
}));

import { getSchoolSetupSnapshot, upsertSchoolSetup } from "@/server/services/school-setup.service";

describe("school setup service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.schoolFindUnique.mockResolvedValue({
      id: "school-1",
      name: "Maurop FC",
      currency: "CLP",
      operationsEmail: null,
      setupCompletedAt: null,
      bankAccounts: []
    });
    mocks.schoolUpdate.mockResolvedValue({});
    mocks.bankAccountUpdateMany.mockResolvedValue({ count: 0 });
    mocks.bankAccountUpdate.mockResolvedValue({
      id: "bank-1",
      bankName: "Scotiabank",
      accountType: "Cuenta Corriente",
      accountHolder: "Maurop FC",
      accountNumberMasked: "****43641"
    });
    mocks.bankAccountCreate.mockResolvedValue({
      id: "bank-1",
      bankName: "Scotiabank",
      accountType: "Cuenta Corriente",
      accountHolder: "Maurop FC",
      accountNumberMasked: "****43641"
    });
    mocks.prismaTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        school: {
          findUnique: mocks.schoolFindUnique,
          update: mocks.schoolUpdate
        },
        bankAccount: {
          updateMany: mocks.bankAccountUpdateMany,
          update: mocks.bankAccountUpdate,
          create: mocks.bankAccountCreate
        }
      })
    );
  });

  it("marca la configuracion como incompleta cuando faltan correo o cuenta", async () => {
    const snapshot = await getSchoolSetupSnapshot("school-1");

    expect(snapshot.isComplete).toBe(false);
    expect(snapshot.missingItems).toEqual(["correo_operativo", "cuenta_bancaria"]);
    expect(snapshot.defaultBankAccount).toBeNull();
  });

  it("crea la cuenta por defecto y guarda el correo operativo en la configuracion inicial", async () => {
    const result = await upsertSchoolSetup({
      schoolId: "school-1",
      operationsEmail: "pagos@maurop.cl",
      bankName: "Scotiabank",
      accountType: "Cuenta Corriente",
      accountHolder: "Maurop FC",
      accountNumber: "500343641"
    });

    expect(mocks.schoolUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "school-1" },
        data: expect.objectContaining({
          operationsEmail: "pagos@maurop.cl"
        })
      })
    );
    expect(mocks.bankAccountCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          schoolId: "school-1",
          bankName: "Scotiabank",
          accountType: "Cuenta Corriente",
          accountHolder: "Maurop FC",
          accountNumberReference: "500343641",
          accountNumberMasked: "****343641",
          currency: "CLP",
          isDefault: true
        })
      })
    );
    expect(result.isComplete).toBe(true);
    expect(result.missingItems).toEqual([]);
  });

  it("mantiene la cuenta actual si el usuario actualiza otros datos sin reenviar el numero", async () => {
    mocks.schoolFindUnique.mockResolvedValue({
      id: "school-1",
      name: "Maurop FC",
      currency: "CLP",
      operationsEmail: "pagos@maurop.cl",
      setupCompletedAt: null,
      bankAccounts: [
        {
          id: "bank-1",
          bankName: "Scotiabank",
          accountType: "Cuenta Corriente",
          accountHolder: "Maurop FC",
          accountNumberMasked: "****43641",
          accountNumberReference: "500343641",
          isDefault: true
        }
      ]
    });

    await upsertSchoolSetup({
      schoolId: "school-1",
      operationsEmail: "administracion@maurop.cl",
      bankName: "Scotiabank",
      accountType: "Cuenta Vista",
      accountHolder: "Maurop FC",
      accountNumber: ""
    });

    expect(mocks.bankAccountUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "bank-1" },
        data: expect.objectContaining({
          accountType: "Cuenta Vista",
          accountNumberReference: "500343641",
          accountNumberMasked: "****343641"
        })
      })
    );
  });
});
