import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { parsePagination, paginationEnvelope } from "../lib/pagination";

export const recommendationsRouter = Router();
recommendationsRouter.use(requireAuth);

recommendationsRouter.get("/", async (req, res, next) => {
  try {
    const { page, pageSize, skip, take } = parsePagination(req.query as Record<string, unknown>);
    const [data, total] = await Promise.all([
      prisma.aIRecommendation.findMany({
        skip,
        take,
        orderBy: { createdAt: "desc" },
        include: { ticket: true, reviewedBy: true },
      }),
      prisma.aIRecommendation.count(),
    ]);
    res.json(paginationEnvelope(data, total, page, pageSize));
  } catch (err) {
    next(err);
  }
});

recommendationsRouter.get("/stats", async (_req, res, next) => {
  try {
    const all = await prisma.aIRecommendation.findMany();
    const total = all.length;
    const accepted = all.filter((r) => r.status === "ACCEPTED").length;
    const rejected = all.filter((r) => r.status === "REJECTED").length;
    const edited = all.filter((r) => r.status === "EDITED").length;
    const pending = all.filter((r) => r.status === "PENDING").length;
    const reviewed = accepted + rejected + edited;
    const acceptanceRate = reviewed > 0 ? Math.round(((accepted + edited) / reviewed) * 1000) / 10 : 0;
    const avgConfidence = total > 0 ? Math.round((all.reduce((s, r) => s + r.confidence, 0) / total) * 100) / 100 : 0;
    const lowConfidenceCount = all.filter((r) => r.confidence < 0.6).length;

    res.json({ total, accepted, rejected, edited, pending, acceptanceRate, avgConfidence, lowConfidenceCount });
  } catch (err) {
    next(err);
  }
});
