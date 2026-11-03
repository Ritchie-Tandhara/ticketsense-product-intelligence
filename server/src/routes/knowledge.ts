import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { ApiError } from "../lib/errors";
import { requireAuth, requireRole } from "../middleware/auth";
import { parsePagination, paginationEnvelope } from "../lib/pagination";

export const knowledgeRouter = Router();
knowledgeRouter.use(requireAuth);

knowledgeRouter.get("/", async (req, res, next) => {
  try {
    const { page, pageSize, skip, take } = parsePagination(req.query as Record<string, unknown>);
    const where: any = {};
    if (req.query.published !== undefined) where.isPublished = req.query.published === "true";
    if (req.query.search) {
      const s = String(req.query.search).toLowerCase();
      where.OR = [{ title: { contains: s } }, { body: { contains: s } }, { tags: { contains: s } }];
    }
    const [data, total] = await Promise.all([
      prisma.knowledgeArticle.findMany({ where, skip, take, orderBy: { updatedAt: "desc" } }),
      prisma.knowledgeArticle.count({ where }),
    ]);
    res.json(paginationEnvelope(data, total, page, pageSize));
  } catch (err) {
    next(err);
  }
});

const articleSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  tags: z.string().optional(),
  isPublished: z.boolean().optional(),
});

knowledgeRouter.post("/", requireRole("SUPER_ADMIN", "SUPPORT_MANAGER", "SUPPORT_AGENT"), async (req, res, next) => {
  try {
    const body = articleSchema.parse(req.body);
    const article = await prisma.knowledgeArticle.create({
      data: { ...body, tags: body.tags ?? "", authorId: req.user!.sub },
    });
    res.status(201).json(article);
  } catch (err) {
    next(err);
  }
});

knowledgeRouter.patch("/:id", requireRole("SUPER_ADMIN", "SUPPORT_MANAGER", "SUPPORT_AGENT"), async (req, res, next) => {
  try {
    const body = articleSchema.partial().parse(req.body);
    const existing = await prisma.knowledgeArticle.findUnique({ where: { id: req.params.id } });
    if (!existing) throw ApiError.notFound("Article not found");
    const article = await prisma.knowledgeArticle.update({ where: { id: req.params.id }, data: body });
    res.json(article);
  } catch (err) {
    next(err);
  }
});

knowledgeRouter.delete("/:id", requireRole("SUPER_ADMIN", "SUPPORT_MANAGER"), async (req, res, next) => {
  try {
    await prisma.knowledgeArticle.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

knowledgeRouter.get("/suggest/:ticketId", async (req, res, next) => {
  try {
    const ticket = await prisma.ticket.findUnique({ where: { id: req.params.ticketId } });
    if (!ticket) throw ApiError.notFound("Ticket not found");

    const articles = await prisma.knowledgeArticle.findMany({ where: { isPublished: true } });
    const ticketWords = new Set(
      `${ticket.subject} ${ticket.description}`.toLowerCase().split(/\W+/).filter((w) => w.length > 3)
    );

    const scored = articles
      .map((a) => {
        const tagWords = a.tags.toLowerCase().split(/[,\s]+/).filter(Boolean);
        const titleWords = a.title.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
        const overlap = [...tagWords, ...titleWords].filter((w) => ticketWords.has(w)).length;
        return { article: a, overlap };
      })
      .filter((s) => s.overlap > 0)
      .sort((a, b) => b.overlap - a.overlap)
      .slice(0, 5);

    res.json({ data: scored.map((s) => ({ ...s.article, matchScore: s.overlap })) });
  } catch (err) {
    next(err);
  }
});
