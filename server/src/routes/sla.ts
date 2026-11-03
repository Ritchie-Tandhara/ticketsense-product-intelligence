import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { ApiError } from "../lib/errors";
import { requireAuth, requireRole } from "../middleware/auth";
import { runBreachDetection } from "../services/slaService";

export const slaRouter = Router();
slaRouter.use(requireAuth);

slaRouter.get("/policies", async (_req, res, next) => {
  try {
    const policies = await prisma.sLAPolicy.findMany({ orderBy: { priority: "asc" } });
    res.json({ data: policies });
  } catch (err) {
    next(err);
  }
});

const policySchema = z.object({
  name: z.string().min(1),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  firstResponseTargetMin: z.number().int().positive(),
  resolutionTargetMin: z.number().int().positive(),
  businessHoursOnly: z.boolean().optional(),
});

slaRouter.post("/policies", requireRole("SUPER_ADMIN", "SUPPORT_MANAGER"), async (req, res, next) => {
  try {
    const body = policySchema.parse(req.body);
    const policy = await prisma.sLAPolicy.create({ data: body });
    res.status(201).json(policy);
  } catch (err) {
    next(err);
  }
});

slaRouter.patch("/policies/:id", requireRole("SUPER_ADMIN", "SUPPORT_MANAGER"), async (req, res, next) => {
  try {
    const body = policySchema.partial().parse(req.body);
    const existing = await prisma.sLAPolicy.findUnique({ where: { id: req.params.id } });
    if (!existing) throw ApiError.notFound("Policy not found");
    const policy = await prisma.sLAPolicy.update({ where: { id: req.params.id }, data: body });
    res.json(policy);
  } catch (err) {
    next(err);
  }
});

slaRouter.get("/breaches", async (_req, res, next) => {
  try {
    const breaches = await prisma.sLAInstance.findMany({
      where: { OR: [{ firstResponseBreached: true }, { resolutionBreached: true }] },
      include: { ticket: { include: { assignedAgent: true, category: true } } },
      orderBy: { resolutionDueAt: "asc" },
    });
    res.json({ data: breaches });
  } catch (err) {
    next(err);
  }
});

slaRouter.post("/run-breach-detection", requireRole("SUPER_ADMIN", "SUPPORT_MANAGER", "SUPPORT_AGENT"), async (_req, res, next) => {
  try {
    const updated = await runBreachDetection();
    res.json({ updated });
  } catch (err) {
    next(err);
  }
});
