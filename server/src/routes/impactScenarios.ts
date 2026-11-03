import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { ApiError } from "../lib/errors";
import { requireAuth, requireRole } from "../middleware/auth";
import { calculateImpact, calculatePrioritizationScore } from "../services/impactCalculator";
import { SCENARIO_TYPES } from "../types/enums";
import { logAudit } from "../services/auditService";

export const impactScenariosRouter = Router();
impactScenariosRouter.use(requireAuth);

const inputsSchema = z.object({
  relatedTicketCount: z.number().min(0),
  uniqueCustomers: z.number().min(0),
  avgHandlingTimeMinutes: z.number().min(0),
  supportCostPerHour: z.number().min(0),
  projectedFutureTicketVolume: z.number().min(0),
  estimatedFixEffectivenessPct: z.number().min(0).max(100),
  engineeringCost: z.number().min(0),
  customerTier: z.string().optional(),
});

impactScenariosRouter.get("/issues/:issueId/impact-scenarios", async (req, res, next) => {
  try {
    const scenarios = await prisma.impactScenario.findMany({
      where: { issueId: req.params.issueId },
      orderBy: { createdAt: "desc" },
      include: { createdBy: true },
    });
    res.json({ data: scenarios.map(deserialize) });
  } catch (err) {
    next(err);
  }
});

impactScenariosRouter.get("/impact-scenarios/:id", async (req, res, next) => {
  try {
    const scenario = await prisma.impactScenario.findUnique({ where: { id: req.params.id }, include: { createdBy: true, issue: true } });
    if (!scenario) throw ApiError.notFound("Scenario not found");
    res.json(deserialize(scenario));
  } catch (err) {
    next(err);
  }
});

const createSchema = z.object({
  name: z.string().min(1),
  scenarioType: z.enum(SCENARIO_TYPES),
  inputs: inputsSchema,
});

impactScenariosRouter.post("/issues/:issueId/impact-scenarios", requireRole("SUPER_ADMIN", "SUPPORT_MANAGER"), async (req, res, next) => {
  try {
    const body = createSchema.parse(req.body);
    const issue = await prisma.productIssue.findUnique({ where: { id: req.params.issueId } });
    if (!issue) throw ApiError.notFound("Issue not found");

    const outputs = calculateImpact(body.inputs);
    const prioritization = calculatePrioritizationScore({
      uniqueCustomers: body.inputs.uniqueCustomers,
      relatedTicketCount: body.inputs.relatedTicketCount,
      historicalSupportCost: outputs.historicalSupportCost,
      severity: issue.severity,
      dominantCustomerTier: body.inputs.customerTier,
      engineeringCost: body.inputs.engineeringCost,
    });

    const scenario = await prisma.impactScenario.create({
      data: {
        issueId: issue.id,
        name: body.name,
        scenarioType: body.scenarioType,
        inputs: JSON.stringify(body.inputs),
        outputs: JSON.stringify({ ...outputs, prioritization }),
        createdById: req.user!.sub,
      },
      include: { createdBy: true },
    });

    await logAudit(req.user!.sub, "CREATE", "ImpactScenario", scenario.id, { issueId: issue.id });
    res.status(201).json(deserialize(scenario));
  } catch (err) {
    next(err);
  }
});

// Live preview (not persisted): used by the UI for instant recalculation as
// the user edits assumptions, without creating a saved scenario row.
impactScenariosRouter.post("/issues/:issueId/impact-scenarios/preview", async (req, res, next) => {
  try {
    const issue = await prisma.productIssue.findUnique({ where: { id: req.params.issueId } });
    if (!issue) throw ApiError.notFound("Issue not found");
    const inputs = inputsSchema.parse(req.body.inputs);
    const outputs = calculateImpact(inputs);
    const prioritization = calculatePrioritizationScore({
      uniqueCustomers: inputs.uniqueCustomers,
      relatedTicketCount: inputs.relatedTicketCount,
      historicalSupportCost: outputs.historicalSupportCost,
      severity: issue.severity,
      dominantCustomerTier: inputs.customerTier,
      engineeringCost: inputs.engineeringCost,
    });
    res.json({ outputs: { ...outputs, prioritization } });
  } catch (err) {
    next(err);
  }
});

// Recompute: always recalculates server-side from whatever inputs are posted —
// never trusts client-provided output numbers.
impactScenariosRouter.post("/impact-scenarios/:id/recompute", requireRole("SUPER_ADMIN", "SUPPORT_MANAGER"), async (req, res, next) => {
  try {
    const existing = await prisma.impactScenario.findUnique({ where: { id: req.params.id }, include: { issue: true } });
    if (!existing) throw ApiError.notFound("Scenario not found");

    const inputs = inputsSchema.parse(req.body.inputs ?? JSON.parse(existing.inputs));
    const outputs = calculateImpact(inputs);
    const prioritization = calculatePrioritizationScore({
      uniqueCustomers: inputs.uniqueCustomers,
      relatedTicketCount: inputs.relatedTicketCount,
      historicalSupportCost: outputs.historicalSupportCost,
      severity: existing.issue.severity,
      dominantCustomerTier: inputs.customerTier,
      engineeringCost: inputs.engineeringCost,
    });

    const updated = await prisma.impactScenario.update({
      where: { id: existing.id },
      data: { inputs: JSON.stringify(inputs), outputs: JSON.stringify({ ...outputs, prioritization }) },
      include: { createdBy: true },
    });

    res.json(deserialize(updated));
  } catch (err) {
    next(err);
  }
});

impactScenariosRouter.get("/issues/:issueId/impact-scenarios/compare", async (req, res, next) => {
  try {
    const scenarios = await prisma.impactScenario.findMany({ where: { issueId: req.params.issueId }, orderBy: { createdAt: "desc" } });
    const latestByType: Record<string, unknown> = {};
    for (const type of SCENARIO_TYPES) {
      const match = scenarios.find((s) => s.scenarioType === type);
      if (match) latestByType[type] = deserialize(match);
    }
    res.json(latestByType);
  } catch (err) {
    next(err);
  }
});

function deserialize(scenario: any) {
  return {
    ...scenario,
    inputs: JSON.parse(scenario.inputs),
    outputs: JSON.parse(scenario.outputs),
  };
}
