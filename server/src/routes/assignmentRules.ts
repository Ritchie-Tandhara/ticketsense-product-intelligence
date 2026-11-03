import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { ApiError } from "../lib/errors";
import { requireAuth, requireRole } from "../middleware/auth";
import { evaluateAssignment } from "../services/assignmentService";

export const assignmentRulesRouter = Router();
assignmentRulesRouter.use(requireAuth);

assignmentRulesRouter.get("/", async (_req, res, next) => {
  try {
    const rules = await prisma.assignmentRule.findMany({
      orderBy: { order: "asc" },
      include: { conditionCategory: true, targetTeam: true },
    });
    res.json({ data: rules });
  } catch (err) {
    next(err);
  }
});

const ruleSchema = z.object({
  name: z.string().min(1),
  order: z.number().int().optional(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  conditionPriority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).nullable().optional(),
  conditionCategoryId: z.string().nullable().optional(),
  strategy: z.enum(["ROUND_ROBIN", "LEAST_ACTIVE", "CATEGORY_BASED", "PRIORITY_ESCALATION"]),
  targetTeamId: z.string().nullable().optional(),
});

assignmentRulesRouter.post("/", requireRole("SUPER_ADMIN", "SUPPORT_MANAGER"), async (req, res, next) => {
  try {
    const body = ruleSchema.parse(req.body);
    const maxOrder = await prisma.assignmentRule.aggregate({ _max: { order: true } });
    const rule = await prisma.assignmentRule.create({
      data: { ...body, order: body.order ?? (maxOrder._max.order ?? 0) + 1 },
    });
    res.status(201).json(rule);
  } catch (err) {
    next(err);
  }
});

assignmentRulesRouter.patch("/:id", requireRole("SUPER_ADMIN", "SUPPORT_MANAGER"), async (req, res, next) => {
  try {
    const body = ruleSchema.partial().parse(req.body);
    const existing = await prisma.assignmentRule.findUnique({ where: { id: req.params.id } });
    if (!existing) throw ApiError.notFound("Rule not found");
    const rule = await prisma.assignmentRule.update({ where: { id: req.params.id }, data: body });
    res.json(rule);
  } catch (err) {
    next(err);
  }
});

assignmentRulesRouter.delete("/:id", requireRole("SUPER_ADMIN", "SUPPORT_MANAGER"), async (req, res, next) => {
  try {
    await prisma.assignmentRule.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

const reorderSchema = z.object({ orderedIds: z.array(z.string()) });
assignmentRulesRouter.post("/reorder", requireRole("SUPER_ADMIN", "SUPPORT_MANAGER"), async (req, res, next) => {
  try {
    const { orderedIds } = reorderSchema.parse(req.body);
    await Promise.all(orderedIds.map((id, idx) => prisma.assignmentRule.update({ where: { id }, data: { order: idx + 1 } })));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

const dryRunSchema = z.object({
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  categoryId: z.string().optional(),
});
assignmentRulesRouter.post("/dry-run", async (req, res, next) => {
  try {
    const body = dryRunSchema.parse(req.body);
    const sampleTicket = { id: "dry-run", priority: body.priority, categoryId: body.categoryId ?? null } as any;
    const result = await evaluateAssignment(sampleTicket);
    res.json(result);
  } catch (err) {
    next(err);
  }
});
