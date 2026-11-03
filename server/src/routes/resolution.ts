import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { ApiError } from "../lib/errors";
import { requireAuth, requireRole } from "../middleware/auth";
import { computeMeasurement, DEFAULT_WINDOW_DAYS, OUTCOME_THRESHOLDS } from "../services/resolutionMeasurementService";
import { logAudit } from "../services/auditService";

export const resolutionRouter = Router();
resolutionRouter.use(requireAuth);

const createReleaseSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  releasedAt: z.string(),
  description: z.string().optional(),
});

resolutionRouter.get("/releases", async (_req, res, next) => {
  try {
    const releases = await prisma.release.findMany({
      orderBy: { releasedAt: "desc" },
      include: { issueLinks: { include: { issue: true } }, measurements: true },
    });
    res.json({ data: releases });
  } catch (err) {
    next(err);
  }
});

resolutionRouter.post("/releases", requireRole("SUPER_ADMIN", "SUPPORT_MANAGER"), async (req, res, next) => {
  try {
    const body = createReleaseSchema.parse(req.body);
    const release = await prisma.release.create({
      data: { ...body, releasedAt: new Date(body.releasedAt) },
    });
    await logAudit(req.user!.sub, "CREATE", "Release", release.id);
    res.status(201).json(release);
  } catch (err) {
    next(err);
  }
});

resolutionRouter.get("/releases/:id", async (req, res, next) => {
  try {
    const release = await prisma.release.findUnique({
      where: { id: req.params.id },
      include: { issueLinks: { include: { issue: true } }, measurements: { include: { issue: true } } },
    });
    if (!release) throw ApiError.notFound("Release not found");
    res.json(release);
  } catch (err) {
    next(err);
  }
});

const linkSchema = z.object({ issueId: z.string() });

resolutionRouter.post("/releases/:id/link-issue", requireRole("SUPER_ADMIN", "SUPPORT_MANAGER"), async (req, res, next) => {
  try {
    const { issueId } = linkSchema.parse(req.body);
    const [release, issue] = await Promise.all([
      prisma.release.findUnique({ where: { id: req.params.id } }),
      prisma.productIssue.findUnique({ where: { id: issueId } }),
    ]);
    if (!release || !issue) throw ApiError.notFound("Release or issue not found");

    const link = await prisma.releaseIssueLink.upsert({
      where: { releaseId_issueId: { releaseId: release.id, issueId } },
      update: {},
      create: { releaseId: release.id, issueId },
    });

    await logAudit(req.user!.sub, "LINK_ISSUE", "Release", release.id, { issueId });
    res.status(201).json(link);
  } catch (err) {
    next(err);
  }
});

const measureSchema = z.object({ issueId: z.string(), windowDays: z.number().min(1).max(180).optional() });

resolutionRouter.post("/releases/:id/measure", requireRole("SUPER_ADMIN", "SUPPORT_MANAGER"), async (req, res, next) => {
  try {
    const { issueId, windowDays } = measureSchema.parse(req.body);
    const release = await prisma.release.findUnique({ where: { id: req.params.id } });
    if (!release) throw ApiError.notFound("Release not found");

    const result = await computeMeasurement(issueId, release.id, windowDays ?? DEFAULT_WINDOW_DAYS);

    const measurement = await prisma.resolutionMeasurement.create({
      data: {
        issueId,
        releaseId: release.id,
        preWindowStart: result.preWindow.start,
        preWindowEnd: result.preWindow.end,
        postWindowStart: result.postWindow.start,
        postWindowEnd: result.postWindow.end,
        preTicketCount: result.pre.ticketCount,
        postTicketCount: result.post.ticketCount,
        preAffectedCustomers: result.pre.affectedCustomers,
        postAffectedCustomers: result.post.affectedCustomers,
        preSupportHours: result.pre.supportHours,
        postSupportHours: result.post.supportHours,
        outcomeClassification: result.outcomeClassification,
      },
    });

    await logAudit(req.user!.sub, "MEASURE", "ResolutionMeasurement", measurement.id, { issueId, releaseId: release.id });
    res.status(201).json({ ...measurement, thresholds: OUTCOME_THRESHOLDS });
  } catch (err) {
    next(err);
  }
});

resolutionRouter.get("/measurements", async (req, res, next) => {
  try {
    const where: Record<string, unknown> = {};
    if (req.query.issueId) where.issueId = String(req.query.issueId);
    if (req.query.releaseId) where.releaseId = String(req.query.releaseId);
    const measurements = await prisma.resolutionMeasurement.findMany({
      where,
      orderBy: { computedAt: "desc" },
      include: { issue: true, release: true, verifiedBy: true },
    });
    res.json({ data: measurements, thresholds: OUTCOME_THRESHOLDS });
  } catch (err) {
    next(err);
  }
});

resolutionRouter.post("/measurements/:id/verify", requireRole("SUPER_ADMIN", "SUPPORT_MANAGER"), async (req, res, next) => {
  try {
    const measurement = await prisma.resolutionMeasurement.findUnique({ where: { id: req.params.id } });
    if (!measurement) throw ApiError.notFound("Measurement not found");
    const updated = await prisma.resolutionMeasurement.update({
      where: { id: measurement.id },
      data: { verifiedById: req.user!.sub, verifiedAt: new Date() },
    });

    if (measurement.outcomeClassification === "IMPROVING") {
      const issue = await prisma.productIssue.findUnique({ where: { id: measurement.issueId } });
      if (issue && (issue.status === "MONITORING" || issue.status === "RELEASED")) {
        await prisma.productIssue.update({ where: { id: issue.id }, data: { status: "RESOLVED" } });
      }
    }

    await logAudit(req.user!.sub, "VERIFY", "ResolutionMeasurement", measurement.id);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

resolutionRouter.post("/measurements/:id/reopen-issue", requireRole("SUPER_ADMIN", "SUPPORT_MANAGER"), async (req, res, next) => {
  try {
    const measurement = await prisma.resolutionMeasurement.findUnique({ where: { id: req.params.id }, include: { issue: true } });
    if (!measurement) throw ApiError.notFound("Measurement not found");

    const current = measurement.issue.status;
    if (current !== "MONITORING" && current !== "RESOLVED") {
      throw ApiError.badRequest(`Cannot reopen an issue in status ${current}`);
    }

    const updatedIssue = await prisma.productIssue.update({ where: { id: measurement.issueId }, data: { status: "REOPENED" } });
    await logAudit(req.user!.sub, "REOPEN", "ProductIssue", measurement.issueId, { measurementId: measurement.id });
    res.json(updatedIssue);
  } catch (err) {
    next(err);
  }
});
