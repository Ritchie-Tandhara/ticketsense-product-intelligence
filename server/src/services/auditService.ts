import { prisma } from "../lib/prisma";

export async function logAudit(actorId: string | undefined, action: string, entity: string, entityId?: string, details?: unknown) {
  await prisma.auditLog.create({
    data: {
      actorId: actorId ?? null,
      action,
      entity,
      entityId: entityId ?? null,
      details: details ? JSON.stringify(details) : null,
    },
  });
}
