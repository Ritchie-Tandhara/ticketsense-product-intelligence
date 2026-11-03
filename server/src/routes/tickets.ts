import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { TicketPriority, TicketStatus } from "../types/enums";
import { prisma } from "../lib/prisma";
import { ApiError } from "../lib/errors";
import { requireAuth, requireRole } from "../middleware/auth";
import { parsePagination, paginationEnvelope } from "../lib/pagination";
import { isValidTransition, isReopenTransition, allowedNextStatuses } from "../services/stateMachine";
import { createSlaInstanceForTicket, handleReopen, recordFirstResponse, recordResolution } from "../services/slaService";
import { evaluateAssignment } from "../services/assignmentService";
import { analyzeTicket } from "../ai/provider";
import { logAudit } from "../services/auditService";

export const ticketsRouter = Router();
ticketsRouter.use(requireAuth);

const priorityEnum = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const statusEnum = z.enum(["NEW", "OPEN", "IN_PROGRESS", "PENDING", "RESOLVED", "CLOSED"]);

const createTicketSchema = z.object({
  subject: z.string().min(3).max(200),
  description: z.string().min(1),
  priority: priorityEnum.optional(),
  requesterName: z.string().min(1),
  requesterEmail: z.string().email(),
  categoryId: z.string().optional(),
  teamId: z.string().optional(),
});

ticketsRouter.get("/", async (req, res, next) => {
  try {
    const { page, pageSize, skip, take } = parsePagination(req.query as Record<string, unknown>);
    const where: Prisma.TicketWhereInput = {};
    const q = req.query;
    if (q.status) where.status = q.status as TicketStatus;
    if (q.priority) where.priority = q.priority as TicketPriority;
    if (q.categoryId) where.categoryId = String(q.categoryId);
    if (q.agentId) where.assignedAgentId = String(q.agentId);
    if (q.teamId) where.teamId = String(q.teamId);
    if (q.search) {
      where.OR = [
        { subject: { contains: String(q.search) } },
        { requesterName: { contains: String(q.search) } },
        { requesterEmail: { contains: String(q.search) } },
      ];
    }
    if (q.from || q.to) {
      where.createdAt = {};
      if (q.from) (where.createdAt as Prisma.DateTimeFilter).gte = new Date(String(q.from));
      if (q.to) (where.createdAt as Prisma.DateTimeFilter).lte = new Date(String(q.to));
    }

    const sortField = (q.sortBy as string) || "createdAt";
    const sortDir = (q.sortDir as string) === "asc" ? "asc" : "desc";

    const [data, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        skip,
        take,
        orderBy: { [sortField]: sortDir },
        include: { category: true, team: true, assignedAgent: true, slaInstance: true },
      }),
      prisma.ticket.count({ where }),
    ]);

    res.json(paginationEnvelope(data, total, page, pageSize));
  } catch (err) {
    next(err);
  }
});

ticketsRouter.get("/:id", async (req, res, next) => {
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: req.params.id },
      include: {
        category: true,
        team: true,
        assignedAgent: true,
        createdBy: true,
        slaInstance: true,
        messages: { orderBy: { createdAt: "asc" }, include: { author: true } },
        events: { orderBy: { createdAt: "desc" }, include: { actor: true } },
        recommendations: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!ticket) throw ApiError.notFound("Ticket not found");
    res.json({ ...ticket, allowedNextStatuses: allowedNextStatuses(ticket.status as TicketStatus) });
  } catch (err) {
    next(err);
  }
});

ticketsRouter.post("/", async (req, res, next) => {
  try {
    const body = createTicketSchema.parse(req.body);

    let priority: TicketPriority = body.priority ?? "MEDIUM";
    let aiResult = null;
    // Run deterministic classifier up-front so priority reflects a sensible guess
    // even before an agent manually runs /ai-analyze.
    if (!body.priority) {
      aiResult = await analyzeTicket(body.subject, body.description);
      priority = aiResult.priority;
    }

    const maxTicket = await prisma.ticket.aggregate({ _max: { ticketNumber: true } });
    const nextTicketNumber = (maxTicket._max.ticketNumber ?? 1000) + 1;

    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber: nextTicketNumber,
        subject: body.subject,
        description: body.description,
        priority,
        requesterName: body.requesterName,
        requesterEmail: body.requesterEmail,
        categoryId: body.categoryId,
        teamId: body.teamId,
        createdById: req.user!.sub,
        status: "NEW",
      },
    });

    await createSlaInstanceForTicket(ticket.id, ticket.priority as TicketPriority, ticket.createdAt);

    await prisma.ticketEvent.create({
      data: { ticketId: ticket.id, actorId: req.user!.sub, type: "CREATED", message: `Ticket created by ${req.user!.name}.` },
    });

    if (aiResult) {
      await prisma.aIRecommendation.create({
        data: {
          ticketId: ticket.id,
          suggestedCategory: aiResult.category,
          suggestedSubcategory: aiResult.subcategory,
          suggestedPriority: aiResult.priority,
          suggestedSentiment: aiResult.sentiment,
          confidence: aiResult.confidence,
          reasoning: aiResult.reasoning,
        },
      });
    }

    await logAudit(req.user!.sub, "CREATE", "Ticket", ticket.id);

    res.status(201).json(ticket);
  } catch (err) {
    next(err);
  }
});

const updateTicketSchema = z.object({
  subject: z.string().min(3).max(200).optional(),
  description: z.string().min(1).optional(),
  priority: priorityEnum.optional(),
  categoryId: z.string().nullable().optional(),
  teamId: z.string().nullable().optional(),
  assignedAgentId: z.string().nullable().optional(),
});

ticketsRouter.patch("/:id", async (req, res, next) => {
  try {
    const body = updateTicketSchema.parse(req.body);
    const ticket = await prisma.ticket.findUnique({ where: { id: req.params.id } });
    if (!ticket) throw ApiError.notFound("Ticket not found");

    const updated = await prisma.ticket.update({ where: { id: req.params.id }, data: body });
    await logAudit(req.user!.sub, "UPDATE", "Ticket", ticket.id, body);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

const statusChangeSchema = z.object({
  status: statusEnum,
  comment: z.string().optional(),
});

ticketsRouter.post("/:id/status", async (req, res, next) => {
  try {
    const { status, comment } = statusChangeSchema.parse(req.body);
    const ticket = await prisma.ticket.findUnique({ where: { id: req.params.id } });
    if (!ticket) throw ApiError.notFound("Ticket not found");

    const currentStatus = ticket.status as TicketStatus;
    if (!isValidTransition(currentStatus, status)) {
      throw ApiError.badRequest(`Invalid status transition from ${ticket.status} to ${status}`, {
        allowedNextStatuses: allowedNextStatuses(currentStatus),
      });
    }

    const reopening = isReopenTransition(currentStatus, status);
    const data: Prisma.TicketUpdateInput = { status };
    if (status === "RESOLVED") data.resolvedAt = new Date();
    if (status === "CLOSED") data.closedAt = new Date();
    if (reopening) data.reopenCount = { increment: 1 };

    const updated = await prisma.ticket.update({ where: { id: req.params.id }, data });

    await prisma.ticketEvent.create({
      data: {
        ticketId: ticket.id,
        actorId: req.user!.sub,
        type: reopening ? "REOPEN" : "STATUS_CHANGE",
        message: `Status changed from ${ticket.status} to ${status} by ${req.user!.name}.${comment ? ` Note: ${comment}` : ""}`,
      },
    });

    if (reopening) {
      await handleReopen(ticket.id);
    }
    if (status === "RESOLVED") {
      await recordResolution(ticket.id);
    }

    await logAudit(req.user!.sub, "STATUS_CHANGE", "Ticket", ticket.id, { from: ticket.status, to: status });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

const bulkSchema = z.object({
  ticketIds: z.array(z.string()).min(1),
  status: statusEnum.optional(),
  assignedAgentId: z.string().optional(),
});

ticketsRouter.post("/bulk", requireRole("SUPER_ADMIN", "SUPPORT_MANAGER", "SUPPORT_AGENT"), async (req, res, next) => {
  try {
    const body = bulkSchema.parse(req.body);
    const results: { ticketId: string; ok: boolean; error?: string }[] = [];

    for (const ticketId of body.ticketIds) {
      const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
      if (!ticket) {
        results.push({ ticketId, ok: false, error: "Not found" });
        continue;
      }
      try {
        if (body.status) {
          if (!isValidTransition(ticket.status as TicketStatus, body.status)) {
            results.push({ ticketId, ok: false, error: `Invalid transition ${ticket.status} -> ${body.status}` });
            continue;
          }
          await prisma.ticket.update({ where: { id: ticketId }, data: { status: body.status } });
          await prisma.ticketEvent.create({
            data: { ticketId, actorId: req.user!.sub, type: "STATUS_CHANGE", message: `Bulk status change to ${body.status}.` },
          });
        }
        if (body.assignedAgentId) {
          await prisma.ticket.update({ where: { id: ticketId }, data: { assignedAgentId: body.assignedAgentId } });
          await prisma.ticketEvent.create({
            data: { ticketId, actorId: req.user!.sub, type: "ASSIGNMENT", message: `Bulk assigned.` },
          });
        }
        results.push({ ticketId, ok: true });
      } catch (e) {
        results.push({ ticketId, ok: false, error: String(e) });
      }
    }

    await logAudit(req.user!.sub, "BULK_UPDATE", "Ticket", undefined, body);
    res.json({ results });
  } catch (err) {
    next(err);
  }
});

const messageSchema = z.object({
  body: z.string().min(1),
  type: z.enum(["CUSTOMER_REPLY", "AGENT_REPLY", "INTERNAL_NOTE"]),
});

ticketsRouter.post("/:id/messages", async (req, res, next) => {
  try {
    const body = messageSchema.parse(req.body);
    const ticket = await prisma.ticket.findUnique({ where: { id: req.params.id } });
    if (!ticket) throw ApiError.notFound("Ticket not found");

    const message = await prisma.ticketMessage.create({
      data: { ticketId: ticket.id, authorId: req.user!.sub, type: body.type, body: body.body },
    });

    await prisma.ticketEvent.create({
      data: {
        ticketId: ticket.id,
        actorId: req.user!.sub,
        type: body.type === "INTERNAL_NOTE" ? "NOTE_ADDED" : "REPLY_ADDED",
        message: `${body.type === "INTERNAL_NOTE" ? "Internal note" : "Reply"} added by ${req.user!.name}.`,
      },
    });

    if (body.type === "AGENT_REPLY") {
      await recordFirstResponse(ticket.id);
    }

    const timeline = await prisma.ticketMessage.findMany({ where: { ticketId: ticket.id }, orderBy: { createdAt: "asc" }, include: { author: true } });
    res.status(201).json({ message, timeline });
  } catch (err) {
    next(err);
  }
});

ticketsRouter.get("/:id/events", async (req, res, next) => {
  try {
    const events = await prisma.ticketEvent.findMany({
      where: { ticketId: req.params.id },
      orderBy: { createdAt: "desc" },
      include: { actor: true },
    });
    res.json({ data: events });
  } catch (err) {
    next(err);
  }
});

ticketsRouter.post("/:id/ai-analyze", async (req, res, next) => {
  try {
    const ticket = await prisma.ticket.findUnique({ where: { id: req.params.id } });
    if (!ticket) throw ApiError.notFound("Ticket not found");

    const result = await analyzeTicket(ticket.subject, ticket.description);
    const rec = await prisma.aIRecommendation.create({
      data: {
        ticketId: ticket.id,
        suggestedCategory: result.category,
        suggestedSubcategory: result.subcategory,
        suggestedPriority: result.priority,
        suggestedSentiment: result.sentiment,
        confidence: result.confidence,
        reasoning: result.reasoning,
      },
    });

    await prisma.ticketEvent.create({
      data: { ticketId: ticket.id, actorId: req.user!.sub, type: "AI_ANALYSIS", message: `AI analysis run: suggested ${result.category}/${result.subcategory}, priority ${result.priority}, confidence ${(result.confidence * 100).toFixed(0)}%.` },
    });

    res.status(201).json(rec);
  } catch (err) {
    next(err);
  }
});

const reviewSchema = z.object({
  decision: z.enum(["ACCEPTED", "REJECTED", "EDITED"]),
  editedValue: z.record(z.any()).optional(),
});

ticketsRouter.post("/:id/ai-recommendations/:recId/review", async (req, res, next) => {
  try {
    const { decision, editedValue } = reviewSchema.parse(req.body);
    const rec = await prisma.aIRecommendation.findUnique({ where: { id: req.params.recId } });
    if (!rec || rec.ticketId !== req.params.id) throw ApiError.notFound("Recommendation not found");

    const updated = await prisma.aIRecommendation.update({
      where: { id: rec.id },
      data: {
        status: decision,
        reviewedById: req.user!.sub,
        reviewedAt: new Date(),
        editedValue: editedValue ? JSON.stringify(editedValue) : null,
      },
    });

    if (decision === "ACCEPTED" || decision === "EDITED") {
      const data: Prisma.TicketUpdateInput = {};
      const source = decision === "EDITED" && editedValue ? editedValue : rec;
      if (source.suggestedPriority) data.priority = source.suggestedPriority as TicketPriority;
      await prisma.ticket.update({ where: { id: req.params.id }, data });
    }

    await prisma.ticketEvent.create({
      data: { ticketId: req.params.id, actorId: req.user!.sub, type: "AI_REVIEW", message: `AI recommendation ${decision.toLowerCase()} by ${req.user!.name}.` },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

ticketsRouter.post("/:id/auto-assign", async (req, res, next) => {
  try {
    const ticket = await prisma.ticket.findUnique({ where: { id: req.params.id } });
    if (!ticket) throw ApiError.notFound("Ticket not found");

    const result = await evaluateAssignment(ticket);

    const updated = await prisma.ticket.update({
      where: { id: ticket.id },
      data: { assignedAgentId: result.agentId ?? undefined, teamId: result.teamId ?? ticket.teamId },
    });

    await prisma.ticketEvent.create({
      data: {
        ticketId: ticket.id,
        actorId: req.user!.sub,
        type: "ASSIGNMENT",
        message: `Auto-assignment via rule "${result.ruleName}": ${result.reason}`,
      },
    });

    res.json({ ticket: updated, ...result });
  } catch (err) {
    next(err);
  }
});
