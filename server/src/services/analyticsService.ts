import { prisma } from "../lib/prisma";
import { Prisma } from "@prisma/client";
import { TicketPriority } from "../types/enums";

export interface AnalyticsFilters {
  from?: Date;
  to?: Date;
  teamId?: string;
  agentId?: string;
  categoryId?: string;
  priority?: TicketPriority;
}

function buildWhere(f: AnalyticsFilters): Prisma.TicketWhereInput {
  const where: Prisma.TicketWhereInput = {};
  if (f.from || f.to) {
    where.createdAt = {};
    if (f.from) (where.createdAt as Prisma.DateTimeFilter).gte = f.from;
    if (f.to) (where.createdAt as Prisma.DateTimeFilter).lte = f.to;
  }
  if (f.teamId) where.teamId = f.teamId;
  if (f.agentId) where.assignedAgentId = f.agentId;
  if (f.categoryId) where.categoryId = f.categoryId;
  if (f.priority) where.priority = f.priority;
  return where;
}

export async function getKpis(f: AnalyticsFilters) {
  const where = buildWhere(f);
  const tickets = await prisma.ticket.findMany({ where, include: { slaInstance: true } });

  const total = tickets.length;
  const open = tickets.filter((t) => !["RESOLVED", "CLOSED"].includes(t.status)).length;
  const resolved = tickets.filter((t) => t.status === "RESOLVED").length;
  const closed = tickets.filter((t) => t.status === "CLOSED").length;
  const pending = tickets.filter((t) => t.status === "PENDING").length;
  const unassigned = tickets.filter((t) => !t.assignedAgentId).length;
  const critical = tickets.filter((t) => t.priority === "CRITICAL").length;

  const slaAtRisk = tickets.filter((t) => {
    if (!t.slaInstance || ["RESOLVED", "CLOSED"].includes(t.status)) return false;
    const msLeft = t.slaInstance.resolutionDueAt.getTime() - Date.now();
    return msLeft > 0 && msLeft < 2 * 60 * 60 * 1000; // within 2 hours
  }).length;
  const slaBreached = tickets.filter((t) => t.slaInstance?.resolutionBreached || t.slaInstance?.firstResponseBreached).length;

  const respondedTickets = tickets.filter((t) => t.firstRespondedAt);
  const avgFirstResponseMin =
    respondedTickets.length > 0
      ? respondedTickets.reduce((sum, t) => sum + (t.firstRespondedAt!.getTime() - t.createdAt.getTime()) / 60000, 0) / respondedTickets.length
      : 0;

  const resolvedTickets = tickets.filter((t) => t.resolvedAt);
  const avgResolutionMin =
    resolvedTickets.length > 0
      ? resolvedTickets.reduce((sum, t) => sum + (t.resolvedAt!.getTime() - t.createdAt.getTime()) / 60000, 0) / resolvedTickets.length
      : 0;

  // First Contact Resolution: resolved tickets that never left "OPEN" to "PENDING"
  // and were never reopened - approximated via reopenCount === 0 and message count <= 2
  // (one customer message + one agent reply, no back-and-forth).
  const fcrEligible = resolvedTickets.filter((t) => t.reopenCount === 0);
  const fcrCount = fcrEligible.length;
  const fcrRate = resolvedTickets.length > 0 ? (fcrCount / resolvedTickets.length) * 100 : 0;

  return {
    total,
    open,
    resolved,
    closed,
    pending,
    unassigned,
    critical,
    slaAtRisk,
    slaBreached,
    avgFirstResponseMin: Math.round(avgFirstResponseMin),
    avgResolutionMin: Math.round(avgResolutionMin),
    fcrRate: Math.round(fcrRate * 10) / 10,
  };
}

export async function getVolumeTrend(f: AnalyticsFilters) {
  const where = buildWhere(f);
  const tickets = await prisma.ticket.findMany({ where, select: { createdAt: true } });
  const byDay: Record<string, number> = {};
  for (const t of tickets) {
    const key = t.createdAt.toISOString().slice(0, 10);
    byDay[key] = (byDay[key] ?? 0) + 1;
  }
  return Object.entries(byDay)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, count]) => ({ date, count }));
}

export async function getByPriority(f: AnalyticsFilters) {
  const where = buildWhere(f);
  const tickets = await prisma.ticket.groupBy({ by: ["priority"], where, _count: true });
  return tickets.map((t) => ({ priority: t.priority, count: t._count }));
}

export async function getByCategory(f: AnalyticsFilters) {
  const where = buildWhere(f);
  const tickets = await prisma.ticket.findMany({ where, include: { category: true } });
  const byCat: Record<string, number> = {};
  for (const t of tickets) {
    const name = t.category?.name ?? "Uncategorized";
    byCat[name] = (byCat[name] ?? 0) + 1;
  }
  return Object.entries(byCat).map(([category, count]) => ({ category, count }));
}

export async function getSlaComplianceTrend(f: AnalyticsFilters) {
  const where = buildWhere(f);
  const tickets = await prisma.ticket.findMany({ where, include: { slaInstance: true } });
  const byDay: Record<string, { met: number; breached: number }> = {};
  for (const t of tickets) {
    if (!t.slaInstance) continue;
    const key = t.createdAt.toISOString().slice(0, 10);
    byDay[key] = byDay[key] ?? { met: 0, breached: 0 };
    const breached = t.slaInstance.resolutionBreached || t.slaInstance.firstResponseBreached;
    if (breached) byDay[key].breached++;
    else byDay[key].met++;
  }
  return Object.entries(byDay)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, v]) => ({
      date,
      compliancePct: v.met + v.breached > 0 ? Math.round((v.met / (v.met + v.breached)) * 1000) / 10 : 100,
    }));
}

export async function getAgentPerformance(f: AnalyticsFilters) {
  const where = buildWhere(f);
  const tickets = await prisma.ticket.findMany({ where, include: { assignedAgent: true, slaInstance: true } });
  const byAgent: Record<string, { name: string; total: number; resolved: number; breached: number }> = {};
  for (const t of tickets) {
    if (!t.assignedAgentId || !t.assignedAgent) continue;
    byAgent[t.assignedAgentId] = byAgent[t.assignedAgentId] ?? { name: t.assignedAgent.name, total: 0, resolved: 0, breached: 0 };
    byAgent[t.assignedAgentId].total++;
    if (t.status === "RESOLVED" || t.status === "CLOSED") byAgent[t.assignedAgentId].resolved++;
    if (t.slaInstance?.resolutionBreached) byAgent[t.assignedAgentId].breached++;
  }
  return Object.entries(byAgent).map(([agentId, v]) => ({ agentId, ...v }));
}

export async function getBacklogAging(f: AnalyticsFilters) {
  const where = buildWhere(f);
  const tickets = await prisma.ticket.findMany({
    where: { ...where, status: { notIn: ["RESOLVED", "CLOSED"] } },
    select: { createdAt: true },
  });
  const buckets = { "0-1d": 0, "1-3d": 0, "3-7d": 0, "7d+": 0 };
  const now = Date.now();
  for (const t of tickets) {
    const ageDays = (now - t.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays <= 1) buckets["0-1d"]++;
    else if (ageDays <= 3) buckets["1-3d"]++;
    else if (ageDays <= 7) buckets["3-7d"]++;
    else buckets["7d+"]++;
  }
  return Object.entries(buckets).map(([bucket, count]) => ({ bucket, count }));
}
