import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import {
  getKpis,
  getVolumeTrend,
  getByPriority,
  getByCategory,
  getSlaComplianceTrend,
  getAgentPerformance,
  getBacklogAging,
  AnalyticsFilters,
} from "../services/analyticsService";

export const analyticsRouter = Router();
analyticsRouter.use(requireAuth);

function parseFilters(q: Record<string, unknown>): AnalyticsFilters {
  return {
    from: q.from ? new Date(String(q.from)) : undefined,
    to: q.to ? new Date(String(q.to)) : undefined,
    teamId: q.teamId ? String(q.teamId) : undefined,
    agentId: q.agentId ? String(q.agentId) : undefined,
    categoryId: q.categoryId ? String(q.categoryId) : undefined,
    priority: q.priority ? (String(q.priority) as any) : undefined,
  };
}

analyticsRouter.get("/kpis", async (req, res, next) => {
  try {
    res.json(await getKpis(parseFilters(req.query as Record<string, unknown>)));
  } catch (err) {
    next(err);
  }
});

analyticsRouter.get("/volume-trend", async (req, res, next) => {
  try {
    res.json({ data: await getVolumeTrend(parseFilters(req.query as Record<string, unknown>)) });
  } catch (err) {
    next(err);
  }
});

analyticsRouter.get("/by-priority", async (req, res, next) => {
  try {
    res.json({ data: await getByPriority(parseFilters(req.query as Record<string, unknown>)) });
  } catch (err) {
    next(err);
  }
});

analyticsRouter.get("/by-category", async (req, res, next) => {
  try {
    res.json({ data: await getByCategory(parseFilters(req.query as Record<string, unknown>)) });
  } catch (err) {
    next(err);
  }
});

analyticsRouter.get("/sla-compliance-trend", async (req, res, next) => {
  try {
    res.json({ data: await getSlaComplianceTrend(parseFilters(req.query as Record<string, unknown>)) });
  } catch (err) {
    next(err);
  }
});

analyticsRouter.get("/agent-performance", async (req, res, next) => {
  try {
    res.json({ data: await getAgentPerformance(parseFilters(req.query as Record<string, unknown>)) });
  } catch (err) {
    next(err);
  }
});

analyticsRouter.get("/backlog-aging", async (req, res, next) => {
  try {
    res.json({ data: await getBacklogAging(parseFilters(req.query as Record<string, unknown>)) });
  } catch (err) {
    next(err);
  }
});
