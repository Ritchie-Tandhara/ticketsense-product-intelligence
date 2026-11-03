import { prisma } from "../lib/prisma";
import { addBusinessMinutes, addCalendarMinutes } from "../lib/businessHours";
import { TicketPriority } from "../types/enums";

/**
 * Creates the SLAInstance for a newly created ticket, based on the SLAPolicy
 * configured for the ticket's priority.
 */
export async function createSlaInstanceForTicket(ticketId: string, priority: TicketPriority, createdAt: Date) {
  const policy = await prisma.sLAPolicy.findUnique({ where: { priority } });
  if (!policy) return null;

  const firstResponseDueAt = policy.businessHoursOnly
    ? addBusinessMinutes(createdAt, policy.firstResponseTargetMin)
    : addCalendarMinutes(createdAt, policy.firstResponseTargetMin);
  const resolutionDueAt = policy.businessHoursOnly
    ? addBusinessMinutes(createdAt, policy.resolutionTargetMin)
    : addCalendarMinutes(createdAt, policy.resolutionTargetMin);

  return prisma.sLAInstance.create({
    data: {
      ticketId,
      slaPolicyId: policy.id,
      firstResponseDueAt,
      resolutionDueAt,
    },
  });
}

/**
 * Reopen rule (documented in docs/business-rules-and-sla.md):
 *  - The first-response due date/flag is left AS-IS (the customer already
 *    received a first response in the original lifecycle).
 *  - The resolution clock is RESET: a new resolutionDueAt is computed from
 *    "now" using the same policy's resolution target, and resolutionBreached
 *    is cleared, since the ticket is effectively back in active work.
 */
export async function handleReopen(ticketId: string) {
  const instance = await prisma.sLAInstance.findUnique({
    where: { ticketId },
    include: { slaPolicy: true },
  });
  if (!instance) return null;

  const now = new Date();
  const resolutionDueAt = instance.slaPolicy.businessHoursOnly
    ? addBusinessMinutes(now, instance.slaPolicy.resolutionTargetMin)
    : addCalendarMinutes(now, instance.slaPolicy.resolutionTargetMin);

  return prisma.sLAInstance.update({
    where: { ticketId },
    data: {
      resolutionDueAt,
      resolutionBreached: false,
      resolvedMetAt: null,
    },
  });
}

/** Marks first response as met (stops the first-response clock) if not already recorded. */
export async function recordFirstResponse(ticketId: string) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket || ticket.firstRespondedAt) return;

  await prisma.ticket.update({ where: { id: ticketId }, data: { firstRespondedAt: new Date() } });
  const instance = await prisma.sLAInstance.findUnique({ where: { ticketId } });
  if (instance && !instance.firstResponseMetAt) {
    const breached = new Date() > instance.firstResponseDueAt;
    await prisma.sLAInstance.update({
      where: { ticketId },
      data: { firstResponseMetAt: new Date(), firstResponseBreached: breached },
    });
  }
}

/** Marks resolution as met when a ticket transitions to RESOLVED. */
export async function recordResolution(ticketId: string) {
  const instance = await prisma.sLAInstance.findUnique({ where: { ticketId } });
  if (!instance) return;
  const breached = new Date() > instance.resolutionDueAt;
  await prisma.sLAInstance.update({
    where: { ticketId },
    data: { resolvedMetAt: new Date(), resolutionBreached: breached },
  });
}

/**
 * Breach detection sweep: marks any SLAInstance as breached when "now" has
 * passed the relevant due date and the ticket is not yet resolved/closed.
 * Returns the number of instances updated.
 */
export async function runBreachDetection() {
  const now = new Date();
  const openTickets = await prisma.ticket.findMany({
    where: { status: { notIn: ["RESOLVED", "CLOSED"] } },
    include: { slaInstance: true },
  });

  let updated = 0;
  for (const ticket of openTickets) {
    const instance = ticket.slaInstance;
    if (!instance) continue;
    const data: Record<string, boolean> = {};
    if (!instance.firstResponseMetAt && !instance.firstResponseBreached && now > instance.firstResponseDueAt) {
      data.firstResponseBreached = true;
    }
    if (!instance.resolutionBreached && now > instance.resolutionDueAt) {
      data.resolutionBreached = true;
    }
    if (Object.keys(data).length > 0) {
      await prisma.sLAInstance.update({ where: { ticketId: ticket.id }, data });
      await prisma.ticketEvent.create({
        data: {
          ticketId: ticket.id,
          type: "SLA_BREACH",
          message: `SLA breach detected: ${Object.keys(data).join(", ")}`,
        },
      });
      updated++;
    }
  }
  return updated;
}
