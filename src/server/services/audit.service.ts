import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";

type AuditClient = Pick<typeof prisma, "auditLog">;

export async function createAuditLog(input: {
  schoolId?: string;
  actorUserId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}, client: AuditClient = prisma) {
  return client.auditLog.create({
    data: {
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
      ...(input.schoolId ? { school: { connect: { id: input.schoolId } } } : {}),
      ...(input.actorUserId ? { actorUser: { connect: { id: input.actorUserId } } } : {})
    }
  });
}

export async function listReceiptAuditTrail(schoolId: string, receiptId: string) {
  return prisma.auditLog.findMany({
    where: {
      schoolId,
      entityType: "Receipt",
      entityId: receiptId
    },
    include: {
      actorUser: true
    },
    orderBy: {
      createdAt: "desc"
    }
  });
}
