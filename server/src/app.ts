import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth";
import { ticketsRouter } from "./routes/tickets";
import { assignmentRulesRouter } from "./routes/assignmentRules";
import { slaRouter } from "./routes/sla";
import { analyticsRouter } from "./routes/analytics";
import { knowledgeRouter } from "./routes/knowledge";
import { recommendationsRouter } from "./routes/recommendations";
import { adminRouter } from "./routes/admin";
import { issuesRouter } from "./routes/issues";
import { impactScenariosRouter } from "./routes/impactScenarios";
import { workItemsRouter } from "./routes/workItems";
import { resolutionRouter } from "./routes/resolution";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/api/health", (_req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));

  app.use("/api/auth", authRouter);
  app.use("/api/tickets", ticketsRouter);
  app.use("/api/assignment-rules", assignmentRulesRouter);
  app.use("/api/sla", slaRouter);
  app.use("/api/analytics", analyticsRouter);
  app.use("/api/knowledge", knowledgeRouter);
  app.use("/api/recommendations", recommendationsRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/issues", issuesRouter);
  app.use("/api", impactScenariosRouter);
  app.use("/api", workItemsRouter);
  app.use("/api", resolutionRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
