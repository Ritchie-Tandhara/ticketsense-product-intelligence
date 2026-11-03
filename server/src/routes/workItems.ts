import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { ApiError } from "../lib/errors";
import { requireAuth, requireRole } from "../middleware/auth";
import { generateWorkItemDraft } from "../ai/baAssistant";
import { isValidWorkItemTransition, allowedNextWorkItemStatuses } from "../services/workItemStateMachine";
import { WorkItemStatus, WORK_ITEM_STATUSES } from "../types/enums";
import { logAudit } from "../services/auditService";

export const workItemsRouter = Router();
workItemsRouter.use(requireAuth);

workItemsRouter.post("/issues/:issueId/work-items/generate-draft", requireRole("SUPER_ADMIN", "SUPPORT_MANAGER"), async (req, res, next) => {
  try {
    const issue = await prisma.productIssue.findUnique({ where: { id: req.params.issueId } });
    if (!issue) throw ApiError.notFound("Issue not found");

    const links = await prisma.issueTicketLink.findMany({
      where: { issueId: issue.id, removedAt: null },
      include: { ticket: { include: { customer: true } } },
    });
    const tickets = links.map((l) => l.ticket);
    if (tickets.length === 0) throw ApiError.badRequest("Cannot draft a work item from an issue with no linked tickets");

    const uniqueCustomers = new Set(tickets.map((t) => t.customerId ?? t.requesterEmail)).size;

    const draft = generateWorkItemDraft({
      title: issue.title,
      productArea: issue.productArea,
      severity: issue.severity,
      uniqueCustomers,
      tickets: tickets.map((t) => ({
        id: t.id,
        ticketNumber: t.ticketNumber,
        subject: t.subject,
        description: t.description,
        requesterName: t.requesterName,
        priority: t.priority,
      })),
    });

    const workItem = await prisma.workItem.create({
      data: {
        issueId: issue.id,
        title: `Fix: ${issue.title}`,
        businessProblem: draft.businessProblem,
        productArea: issue.productArea,
        problemDescription: draft.problemDescription,
        customerImpact: draft.customerImpact,
        observedSymptoms: draft.observedSymptoms,
        rootCause: draft.rootCause,
        rootCauseIsHypothesis: draft.rootCauseIsHypothesis,
        reproductionSteps: draft.reproductionSteps,
        expectedBehavior: draft.expectedBehavior,
        actualBehavior: draft.actualBehavior,
        proposedSolution: draft.proposedSolution,
        userStory: draft.userStory,
        acceptanceCriteria: draft.acceptanceCriteria,
        edgeCases: draft.edgeCases,
        assumptions: draft.assumptions,
        openQuestions: draft.openQuestions,
        status: "DRAFT",
      },
    });

    await logAudit(req.user!.sub, "GENERATE_DRAFT", "WorkItem", workItem.id, { issueId: issue.id });
    res.status(201).json({ ...workItem, aiGenerated: true, aiDisclaimer: "AI-drafted (deterministic template, not an LLM) — review before approving." });
  } catch (err) {
    next(err);
  }
});

workItemsRouter.get("/work-items", async (req, res, next) => {
  try {
    const where: Record<string, unknown> = {};
    if (req.query.status) where.status = String(req.query.status);
    if (req.query.issueId) where.issueId = String(req.query.issueId);
    const items = await prisma.workItem.findMany({ where, orderBy: { updatedAt: "desc" }, include: { issue: true, owner: true } });
    res.json({ data: items });
  } catch (err) {
    next(err);
  }
});

workItemsRouter.get("/work-items/:id", async (req, res, next) => {
  try {
    const item = await prisma.workItem.findUnique({
      where: { id: req.params.id },
      include: { issue: true, owner: true, impactScenario: true, versions: { orderBy: { editedAt: "desc" }, include: { editedBy: true } } },
    });
    if (!item) throw ApiError.notFound("Work item not found");
    res.json({ ...item, allowedNextStatuses: allowedNextWorkItemStatuses(item.status as WorkItemStatus) });
  } catch (err) {
    next(err);
  }
});

const editSchema = z.object({
  title: z.string().optional(),
  businessProblem: z.string().optional(),
  problemDescription: z.string().optional(),
  customerImpact: z.string().optional(),
  observedSymptoms: z.string().optional(),
  rootCause: z.string().nullable().optional(),
  rootCauseIsHypothesis: z.boolean().optional(),
  reproductionSteps: z.string().nullable().optional(),
  expectedBehavior: z.string().nullable().optional(),
  actualBehavior: z.string().nullable().optional(),
  proposedSolution: z.string().nullable().optional(),
  userStory: z.string().optional(),
  acceptanceCriteria: z.string().optional(),
  edgeCases: z.string().nullable().optional(),
  dependencies: z.string().nullable().optional(),
  priorityRecommendation: z.string().nullable().optional(),
  impactScenarioId: z.string().nullable().optional(),
  assumptions: z.string().nullable().optional(),
  openQuestions: z.string().nullable().optional(),
  ownerId: z.string().nullable().optional(),
});

workItemsRouter.patch("/work-items/:id", requireRole("SUPER_ADMIN", "SUPPORT_MANAGER"), async (req, res, next) => {
  try {
    const body = editSchema.parse(req.body);
    const item = await prisma.workItem.findUnique({ where: { id: req.params.id } });
    if (!item) throw ApiError.notFound("Work item not found");

    await prisma.workItemVersion.create({
      data: { workItemId: item.id, snapshot: JSON.stringify(item), editedById: req.user!.sub },
    });

    const updated = await prisma.workItem.update({ where: { id: item.id }, data: body });
    await logAudit(req.user!.sub, "UPDATE", "WorkItem", item.id, body);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

const transitionSchema = z.object({ status: z.enum(WORK_ITEM_STATUSES), note: z.string().optional() });

workItemsRouter.post("/work-items/:id/transition", requireRole("SUPER_ADMIN", "SUPPORT_MANAGER"), async (req, res, next) => {
  try {
    const { status, note } = transitionSchema.parse(req.body);
    const item = await prisma.workItem.findUnique({ where: { id: req.params.id } });
    if (!item) throw ApiError.notFound("Work item not found");

    if (!isValidWorkItemTransition(item.status as WorkItemStatus, status)) {
      throw ApiError.badRequest(`Invalid transition from ${item.status} to ${status}`, {
        allowedNextStatuses: allowedNextWorkItemStatuses(item.status as WorkItemStatus),
      });
    }

    const updated = await prisma.workItem.update({ where: { id: item.id }, data: { status } });
    await logAudit(req.user!.sub, "TRANSITION", "WorkItem", item.id, { from: item.status, to: status, note });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

workItemsRouter.get("/work-items/:id/export", async (req, res, next) => {
  try {
    const item = await prisma.workItem.findUnique({ where: { id: req.params.id }, include: { issue: true } });
    if (!item) throw ApiError.notFound("Work item not found");

    const format = String(req.query.format ?? "json");
    // Export shape mirrors a generic issue-tracker (Jira/Azure DevOps) import
    // payload — this is the integration seam described in docs, not a real
    // third-party API call.
    const exportPayload = {
      externalKey: `TS-${item.id.slice(-6).toUpperCase()}`,
      summary: item.title,
      description: item.problemDescription,
      issueType: "Bug",
      priority: item.priorityRecommendation ?? "Unspecified",
      labels: [item.productArea, "ticketsense-export"],
      customFields: {
        businessProblem: item.businessProblem,
        customerImpact: item.customerImpact,
        userStory: item.userStory,
        acceptanceCriteria: item.acceptanceCriteria,
        rootCause: item.rootCause,
        rootCauseIsHypothesis: item.rootCauseIsHypothesis,
        openQuestions: item.openQuestions,
        sourceIssueId: item.issueId,
      },
    };

    if (format === "csv") {
      const row = [exportPayload.externalKey, exportPayload.summary, exportPayload.issueType, exportPayload.priority, item.status]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",");
      res.setHeader("Content-Type", "text/csv");
      res.send(`key,summary,type,priority,status\n${row}\n`);
      return;
    }

    res.json(exportPayload);
  } catch (err) {
    next(err);
  }
});
