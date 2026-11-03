import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { ApiError } from "../lib/errors";
import { requireAuth, requireRole } from "../middleware/auth";
import { parsePagination, paginationEnvelope } from "../lib/pagination";
import { clusterTickets, commonSymptoms, SIMILARITY_THRESHOLD, MIN_CLUSTER_SIZE } from "../ai/similarity";
import { isValidIssueTransition, allowedNextIssueStatuses } from "../services/issueStateMachine";
import { IssueStatus, ISSUE_SEVERITIES, ISSUE_STATUSES } from "../types/enums";
import { logAudit } from "../services/auditService";

export const issuesRouter = Router();
issuesRouter.use(requireAuth);

async function issueSummary(issueId: string) {
  const links = await prisma.issueTicketLink.findMany({
    where: { issueId, removedAt: null },
    include: { ticket: { include: { customer: true } } },
  });
  const tickets = links.map((l) => l.ticket);
  const uniqueCustomers = new Set(tickets.map((t) => t.customerId ?? t.requesterEmail)).size;
  const firstSeen = tickets.length ? new Date(Math.min(...tickets.map((t) => t.createdAt.getTime()))) : null;
  const lastSeen = tickets.length ? new Date(Math.max(...tickets.map((t) => t.createdAt.getTime()))) : null;
  const trend = buildTrend(tickets.map((t) => t.createdAt));
  return { relatedTicketCount: tickets.length, uniqueCustomers, firstSeen, lastSeen, tickets, trend };
}

function buildTrend(dates: Date[]) {
  // weekly bucket counts over the last 12 weeks, for a simple volume-trend sparkline
  const weeks: { weekStart: string; count: number }[] = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const weekStart = new Date(now.getTime() - i * 7 * 86400000);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart.getTime() + 7 * 86400000);
    const count = dates.filter((d) => d >= weekStart && d < weekEnd).length;
    weeks.push({ weekStart: weekStart.toISOString().slice(0, 10), count });
  }
  return weeks;
}

issuesRouter.get("/", async (req, res, next) => {
  try {
    const { page, pageSize, skip, take } = parsePagination(req.query as Record<string, unknown>);
    const where: Record<string, unknown> = {};
    if (req.query.status) where.status = String(req.query.status);
    if (req.query.productArea) where.productArea = String(req.query.productArea);

    const [issues, total] = await Promise.all([
      prisma.productIssue.findMany({ where, skip, take, orderBy: { lastSeenAt: "desc" }, include: { owner: true } }),
      prisma.productIssue.count({ where }),
    ]);

    const data = await Promise.all(
      issues.map(async (issue) => {
        const summary = await issueSummary(issue.id);
        return {
          ...issue,
          relatedTicketCount: summary.relatedTicketCount,
          uniqueCustomers: summary.uniqueCustomers,
        };
      })
    );

    res.json(paginationEnvelope(data, total, page, pageSize));
  } catch (err) {
    next(err);
  }
});

issuesRouter.get("/:id", async (req, res, next) => {
  try {
    const issue = await prisma.productIssue.findUnique({
      where: { id: req.params.id },
      include: {
        owner: true,
        workItems: true,
        impactScenarios: { orderBy: { createdAt: "desc" } },
        releaseLinks: { include: { release: true } },
        measurements: { include: { release: true }, orderBy: { computedAt: "desc" } },
      },
    });
    if (!issue) throw ApiError.notFound("Issue not found");

    const links = await prisma.issueTicketLink.findMany({
      where: { issueId: issue.id },
      orderBy: { addedAt: "desc" },
      include: { ticket: { include: { customer: true, category: true } } },
    });
    const activeLinks = links.filter((l) => !l.removedAt);
    const tickets = activeLinks.map((l) => l.ticket);
    const texts = tickets.map((t) => `${t.subject}. ${t.description}`);
    const symptoms = commonSymptoms(texts, 8);
    const uniqueCustomers = new Set(tickets.map((t) => t.customerId ?? t.requesterEmail)).size;
    const trend = buildTrend(tickets.map((t) => t.createdAt));

    res.json({
      ...issue,
      allowedNextStatuses: allowedNextIssueStatuses(issue.status as IssueStatus),
      relatedTicketCount: tickets.length,
      uniqueCustomers,
      commonSymptoms: symptoms,
      supportingTickets: tickets,
      linkHistory: links,
      volumeTrend: trend,
      similarityExplanation: `Tickets are grouped using a Jaccard similarity score over word-bigram sets of each ticket's subject+description (threshold >= ${SIMILARITY_THRESHOLD}, minimum cluster size ${MIN_CLUSTER_SIZE}). This is a deterministic text-overlap measure, not a machine-learned confidence score. See docs/product-intelligence.md for the exact formula.`,
    });
  } catch (err) {
    next(err);
  }
});

// ---- Clustering: detect emerging issues ----
issuesRouter.post("/detect-clustering", requireRole("SUPER_ADMIN", "SUPPORT_MANAGER"), async (req, res, next) => {
  try {
    const existingLinks = await prisma.issueTicketLink.findMany({ where: { removedAt: null }, select: { ticketId: true } });
    const alreadyLinked = new Set(existingLinks.map((l) => l.ticketId));

    const tickets = await prisma.ticket.findMany({
      where: { id: { notIn: [...alreadyLinked] } },
      select: { id: true, subject: true, description: true, categoryId: true, category: true, createdAt: true, priority: true },
    });

    const clusters = clusterTickets(
      tickets.map((t) => ({ id: t.id, text: `${t.subject}. ${t.description}` }))
    );

    let issuesCreated = 0;
    let issuesUpdated = 0;
    const createdIssues: string[] = [];

    for (const cluster of clusters) {
      const clusterTicketsFull = tickets.filter((t) => cluster.ticketIds.includes(t.id));
      const titleSource = clusterTicketsFull[0];
      const productArea = titleSource.category?.name ?? "Uncategorized";
      const firstSeenAt = new Date(Math.min(...clusterTicketsFull.map((t) => t.createdAt.getTime())));
      const lastSeenAt = new Date(Math.max(...clusterTicketsFull.map((t) => t.createdAt.getTime())));
      const severity = clusterTicketsFull.some((t) => t.priority === "CRITICAL")
        ? "CRITICAL"
        : clusterTicketsFull.some((t) => t.priority === "HIGH")
        ? "HIGH"
        : "MEDIUM";

      const issue = await prisma.productIssue.create({
        data: {
          title: `Recurring: ${titleSource.subject}`,
          description: `Automatically detected cluster of ${cluster.ticketIds.length} similar tickets (avg similarity ${cluster.avgSimilarity.toFixed(2)}).`,
          productArea,
          status: "DETECTED",
          severity,
          firstSeenAt,
          lastSeenAt,
        },
      });
      issuesCreated++;
      createdIssues.push(issue.id);

      for (const ticketId of cluster.ticketIds) {
        await prisma.issueTicketLink.create({
          data: { issueId: issue.id, ticketId, addedBy: "SYSTEM_CLUSTERING", manual: false },
        });
      }
    }

    const run = await prisma.clusteringRun.create({
      data: {
        algorithm: "jaccard-bigram-union-find",
        parameters: JSON.stringify({ similarityThreshold: SIMILARITY_THRESHOLD, minClusterSize: MIN_CLUSTER_SIZE }),
        ticketsConsidered: tickets.length,
        issuesCreated,
        issuesUpdated,
      },
    });

    await logAudit(req.user!.sub, "RUN_CLUSTERING", "ClusteringRun", run.id, { issuesCreated, ticketsConsidered: tickets.length });

    res.json({ run, createdIssues, issuesCreated, issuesUpdated });
  } catch (err) {
    next(err);
  }
});

issuesRouter.get("/clustering-runs/history", async (_req, res, next) => {
  try {
    const runs = await prisma.clusteringRun.findMany({ orderBy: { ranAt: "desc" }, take: 20 });
    res.json({ data: runs });
  } catch (err) {
    next(err);
  }
});

const createIssueSchema = z.object({
  title: z.string().min(3),
  description: z.string().min(1),
  productArea: z.string().min(1),
  severity: z.enum(ISSUE_SEVERITIES).optional(),
});

issuesRouter.post("/", requireRole("SUPER_ADMIN", "SUPPORT_MANAGER"), async (req, res, next) => {
  try {
    const body = createIssueSchema.parse(req.body);
    const now = new Date();
    const issue = await prisma.productIssue.create({
      data: { ...body, severity: body.severity ?? "MEDIUM", firstSeenAt: now, lastSeenAt: now },
    });
    await logAudit(req.user!.sub, "CREATE", "ProductIssue", issue.id);
    res.status(201).json(issue);
  } catch (err) {
    next(err);
  }
});

const linkSchema = z.object({ ticketId: z.string() });

issuesRouter.post("/:id/link-ticket", requireRole("SUPER_ADMIN", "SUPPORT_MANAGER", "SUPPORT_AGENT"), async (req, res, next) => {
  try {
    const { ticketId } = linkSchema.parse(req.body);
    const issue = await prisma.productIssue.findUnique({ where: { id: req.params.id } });
    if (!issue) throw ApiError.notFound("Issue not found");
    const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw ApiError.notFound("Ticket not found");

    const existing = await prisma.issueTicketLink.findFirst({ where: { issueId: issue.id, ticketId, removedAt: null } });
    if (existing) throw ApiError.conflict("Ticket already linked to this issue");

    const link = await prisma.issueTicketLink.create({
      data: { issueId: issue.id, ticketId, addedBy: req.user!.sub, manual: true },
    });

    if (ticket.createdAt < issue.firstSeenAt || ticket.createdAt > issue.lastSeenAt) {
      await prisma.productIssue.update({
        where: { id: issue.id },
        data: {
          firstSeenAt: ticket.createdAt < issue.firstSeenAt ? ticket.createdAt : issue.firstSeenAt,
          lastSeenAt: ticket.createdAt > issue.lastSeenAt ? ticket.createdAt : issue.lastSeenAt,
        },
      });
    }

    await logAudit(req.user!.sub, "LINK_TICKET", "ProductIssue", issue.id, { ticketId });
    res.status(201).json(link);
  } catch (err) {
    next(err);
  }
});

issuesRouter.post("/:id/unlink-ticket", requireRole("SUPER_ADMIN", "SUPPORT_MANAGER", "SUPPORT_AGENT"), async (req, res, next) => {
  try {
    const { ticketId } = linkSchema.parse(req.body);
    const link = await prisma.issueTicketLink.findFirst({ where: { issueId: req.params.id, ticketId, removedAt: null } });
    if (!link) throw ApiError.notFound("Active link not found");

    const updated = await prisma.issueTicketLink.update({
      where: { id: link.id },
      data: { removedAt: new Date(), removedBy: req.user!.sub },
    });

    await logAudit(req.user!.sub, "UNLINK_TICKET", "ProductIssue", req.params.id, { ticketId });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

const mergeSchema = z.object({ sourceIssueId: z.string(), targetIssueId: z.string() });

issuesRouter.post("/merge", requireRole("SUPER_ADMIN", "SUPPORT_MANAGER"), async (req, res, next) => {
  try {
    const { sourceIssueId, targetIssueId } = mergeSchema.parse(req.body);
    if (sourceIssueId === targetIssueId) throw ApiError.badRequest("Cannot merge an issue into itself");
    const [source, target] = await Promise.all([
      prisma.productIssue.findUnique({ where: { id: sourceIssueId } }),
      prisma.productIssue.findUnique({ where: { id: targetIssueId } }),
    ]);
    if (!source || !target) throw ApiError.notFound("Source or target issue not found");

    const sourceLinks = await prisma.issueTicketLink.findMany({ where: { issueId: sourceIssueId, removedAt: null } });
    for (const link of sourceLinks) {
      const alreadyOnTarget = await prisma.issueTicketLink.findFirst({ where: { issueId: targetIssueId, ticketId: link.ticketId, removedAt: null } });
      // Mark the old link removed (history preserved) and create a new one on the target (history preserved there too).
      await prisma.issueTicketLink.update({ where: { id: link.id }, data: { removedAt: new Date(), removedBy: `MERGE_INTO:${targetIssueId}` } });
      if (!alreadyOnTarget) {
        await prisma.issueTicketLink.create({ data: { issueId: targetIssueId, ticketId: link.ticketId, addedBy: `MERGED_FROM:${sourceIssueId}`, manual: true } });
      }
    }

    const firstSeenAt = source.firstSeenAt < target.firstSeenAt ? source.firstSeenAt : target.firstSeenAt;
    const lastSeenAt = source.lastSeenAt > target.lastSeenAt ? source.lastSeenAt : target.lastSeenAt;
    const updatedTarget = await prisma.productIssue.update({ where: { id: targetIssueId }, data: { firstSeenAt, lastSeenAt } });
    await prisma.productIssue.update({ where: { id: sourceIssueId }, data: { status: "RESOLVED", description: `${source.description}\n\n[Merged into issue ${targetIssueId}]` } });

    await logAudit(req.user!.sub, "MERGE", "ProductIssue", targetIssueId, { sourceIssueId });
    res.json({ target: updatedTarget, mergedTicketLinks: sourceLinks.length });
  } catch (err) {
    next(err);
  }
});

const splitSchema = z.object({ ticketIds: z.array(z.string()).min(1), newIssue: createIssueSchema });

issuesRouter.post("/:id/split", requireRole("SUPER_ADMIN", "SUPPORT_MANAGER"), async (req, res, next) => {
  try {
    const { ticketIds, newIssue } = splitSchema.parse(req.body);
    const source = await prisma.productIssue.findUnique({ where: { id: req.params.id } });
    if (!source) throw ApiError.notFound("Issue not found");

    const now = new Date();
    const created = await prisma.productIssue.create({
      data: { ...newIssue, severity: newIssue.severity ?? source.severity, firstSeenAt: now, lastSeenAt: now },
    });

    let moved = 0;
    for (const ticketId of ticketIds) {
      const link = await prisma.issueTicketLink.findFirst({ where: { issueId: source.id, ticketId, removedAt: null } });
      if (!link) continue;
      await prisma.issueTicketLink.update({ where: { id: link.id }, data: { removedAt: new Date(), removedBy: `SPLIT_INTO:${created.id}` } });
      await prisma.issueTicketLink.create({ data: { issueId: created.id, ticketId, addedBy: `SPLIT_FROM:${source.id}`, manual: true } });
      moved++;
    }

    const movedTickets = await prisma.ticket.findMany({ where: { id: { in: ticketIds } } });
    if (movedTickets.length) {
      await prisma.productIssue.update({
        where: { id: created.id },
        data: {
          firstSeenAt: new Date(Math.min(...movedTickets.map((t) => t.createdAt.getTime()))),
          lastSeenAt: new Date(Math.max(...movedTickets.map((t) => t.createdAt.getTime()))),
        },
      });
    }

    await logAudit(req.user!.sub, "SPLIT", "ProductIssue", source.id, { newIssueId: created.id, movedTickets: moved });
    res.status(201).json({ newIssue: created, movedTickets: moved });
  } catch (err) {
    next(err);
  }
});

const transitionSchema = z.object({ status: z.enum(ISSUE_STATUSES), note: z.string().optional() });

issuesRouter.post("/:id/transition", requireRole("SUPER_ADMIN", "SUPPORT_MANAGER"), async (req, res, next) => {
  try {
    const { status, note } = transitionSchema.parse(req.body);
    const issue = await prisma.productIssue.findUnique({ where: { id: req.params.id } });
    if (!issue) throw ApiError.notFound("Issue not found");

    if (status === "CONFIRMED" && !note) {
      throw ApiError.badRequest("A human note is required when confirming an issue.");
    }

    if (!isValidIssueTransition(issue.status as IssueStatus, status)) {
      throw ApiError.badRequest(`Invalid transition from ${issue.status} to ${status}`, {
        allowedNextStatuses: allowedNextIssueStatuses(issue.status as IssueStatus),
      });
    }

    const updated = await prisma.productIssue.update({ where: { id: issue.id }, data: { status } });
    await logAudit(req.user!.sub, "TRANSITION", "ProductIssue", issue.id, { from: issue.status, to: status, note });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

const assignSchema = z.object({ ownerId: z.string().nullable() });

issuesRouter.post("/:id/assign-owner", requireRole("SUPER_ADMIN", "SUPPORT_MANAGER"), async (req, res, next) => {
  try {
    const { ownerId } = assignSchema.parse(req.body);
    const issue = await prisma.productIssue.findUnique({ where: { id: req.params.id } });
    if (!issue) throw ApiError.notFound("Issue not found");
    const updated = await prisma.productIssue.update({ where: { id: issue.id }, data: { ownerId } });
    await logAudit(req.user!.sub, "ASSIGN_OWNER", "ProductIssue", issue.id, { ownerId });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});
