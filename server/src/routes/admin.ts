import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { ApiError } from "../lib/errors";
import { requireAuth, requireRole } from "../middleware/auth";
import { parsePagination, paginationEnvelope } from "../lib/pagination";

export const adminRouter = Router();
adminRouter.use(requireAuth);

// ---- Users ----
adminRouter.get("/users", async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({ include: { team: true }, orderBy: { name: "asc" } });
    res.json({ data: users.map(({ passwordHash, ...u }) => u) });
  } catch (err) {
    next(err);
  }
});

const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["SUPER_ADMIN", "SUPPORT_MANAGER", "SUPPORT_AGENT", "READONLY_ANALYST"]),
  teamId: z.string().nullable().optional(),
  isSeniorAgent: z.boolean().optional(),
  maxLoad: z.number().int().positive().optional(),
});

adminRouter.post("/users", requireRole("SUPER_ADMIN"), async (req, res, next) => {
  try {
    const body = createUserSchema.parse(req.body);
    const passwordHash = await bcrypt.hash(body.password, 10);
    const user = await prisma.user.create({
      data: { name: body.name, email: body.email, passwordHash, role: body.role, teamId: body.teamId, isSeniorAgent: body.isSeniorAgent ?? false, maxLoad: body.maxLoad ?? 15 },
    });
    const { passwordHash: _ph, ...safe } = user;
    res.status(201).json(safe);
  } catch (err) {
    next(err);
  }
});

const updateUserSchema = createUserSchema.partial().omit({ password: true }).extend({ isActive: z.boolean().optional() });

adminRouter.patch("/users/:id", requireRole("SUPER_ADMIN"), async (req, res, next) => {
  try {
    const body = updateUserSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!existing) throw ApiError.notFound("User not found");
    const user = await prisma.user.update({ where: { id: req.params.id }, data: body });
    const { passwordHash: _ph, ...safe } = user;
    res.json(safe);
  } catch (err) {
    next(err);
  }
});

// ---- Teams ----
adminRouter.get("/teams", async (_req, res, next) => {
  try {
    const teams = await prisma.team.findMany({ include: { members: true }, orderBy: { name: "asc" } });
    res.json({ data: teams });
  } catch (err) {
    next(err);
  }
});

const teamSchema = z.object({ name: z.string().min(1), description: z.string().optional(), isEscalation: z.boolean().optional() });

adminRouter.post("/teams", requireRole("SUPER_ADMIN", "SUPPORT_MANAGER"), async (req, res, next) => {
  try {
    const body = teamSchema.parse(req.body);
    const team = await prisma.team.create({ data: body });
    res.status(201).json(team);
  } catch (err) {
    next(err);
  }
});

adminRouter.patch("/teams/:id", requireRole("SUPER_ADMIN", "SUPPORT_MANAGER"), async (req, res, next) => {
  try {
    const body = teamSchema.partial().parse(req.body);
    const existing = await prisma.team.findUnique({ where: { id: req.params.id } });
    if (!existing) throw ApiError.notFound("Team not found");
    const team = await prisma.team.update({ where: { id: req.params.id }, data: body });
    res.json(team);
  } catch (err) {
    next(err);
  }
});

adminRouter.delete("/teams/:id", requireRole("SUPER_ADMIN"), async (req, res, next) => {
  try {
    await prisma.team.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ---- Categories ----
adminRouter.get("/categories", async (_req, res, next) => {
  try {
    const categories = await prisma.ticketCategory.findMany({ orderBy: { name: "asc" } });
    res.json({ data: categories });
  } catch (err) {
    next(err);
  }
});

const categorySchema = z.object({ name: z.string().min(1), description: z.string().optional() });

adminRouter.post("/categories", requireRole("SUPER_ADMIN", "SUPPORT_MANAGER"), async (req, res, next) => {
  try {
    const body = categorySchema.parse(req.body);
    const category = await prisma.ticketCategory.create({ data: body });
    res.status(201).json(category);
  } catch (err) {
    next(err);
  }
});

adminRouter.patch("/categories/:id", requireRole("SUPER_ADMIN", "SUPPORT_MANAGER"), async (req, res, next) => {
  try {
    const body = categorySchema.partial().parse(req.body);
    const existing = await prisma.ticketCategory.findUnique({ where: { id: req.params.id } });
    if (!existing) throw ApiError.notFound("Category not found");
    const category = await prisma.ticketCategory.update({ where: { id: req.params.id }, data: body });
    res.json(category);
  } catch (err) {
    next(err);
  }
});

adminRouter.delete("/categories/:id", requireRole("SUPER_ADMIN"), async (req, res, next) => {
  try {
    await prisma.ticketCategory.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ---- Audit log ----
adminRouter.get("/audit-log", requireRole("SUPER_ADMIN", "SUPPORT_MANAGER", "READONLY_ANALYST"), async (req, res, next) => {
  try {
    const { page, pageSize, skip, take } = parsePagination(req.query as Record<string, unknown>);
    const [data, total] = await Promise.all([
      prisma.auditLog.findMany({ skip, take, orderBy: { createdAt: "desc" }, include: { actor: true } }),
      prisma.auditLog.count(),
    ]);
    res.json(paginationEnvelope(data, total, page, pageSize));
  } catch (err) {
    next(err);
  }
});
