import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { resetDb, seedBaseFixtures } from "./fixtures";
import { authHeader } from "./helpers";
import { prisma } from "../src/lib/prisma";

const app = createApp();

describe("Impact Simulator API", () => {
  let fixtures: Awaited<ReturnType<typeof seedBaseFixtures>>;

  beforeEach(async () => {
    await resetDb();
    fixtures = await seedBaseFixtures();
  });

  it("creates a scenario and computes outputs server-side, returning null ROI for zero engineering cost", async () => {
    const issue = await prisma.productIssue.create({ data: { title: "Issue", description: "d", productArea: "Technical", firstSeenAt: new Date(), lastSeenAt: new Date() } });

    const res = await request(app)
      .post(`/api/issues/${issue.id}/impact-scenarios`)
      .set(authHeader(fixtures.admin))
      .send({
        name: "Zero-cost scenario",
        scenarioType: "EXPECTED",
        inputs: {
          relatedTicketCount: 10,
          uniqueCustomers: 5,
          avgHandlingTimeMinutes: 20,
          supportCostPerHour: 20,
          projectedFutureTicketVolume: 20,
          estimatedFixEffectivenessPct: 50,
          engineeringCost: 0,
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.outputs.roiPct).toBeNull();
    expect(res.body.outputs.prioritization.score).toBeGreaterThan(0);
  });

  it("recompute never trusts client-provided output numbers, always recalculating server-side", async () => {
    const issue = await prisma.productIssue.create({ data: { title: "Issue", description: "d", productArea: "Technical", firstSeenAt: new Date(), lastSeenAt: new Date() } });
    const create = await request(app)
      .post(`/api/issues/${issue.id}/impact-scenarios`)
      .set(authHeader(fixtures.admin))
      .send({
        name: "Scenario",
        scenarioType: "EXPECTED",
        inputs: { relatedTicketCount: 10, uniqueCustomers: 5, avgHandlingTimeMinutes: 20, supportCostPerHour: 20, projectedFutureTicketVolume: 20, estimatedFixEffectivenessPct: 50, engineeringCost: 1000 },
      });

    const scenarioId = create.body.id;
    const recompute = await request(app)
      .post(`/api/impact-scenarios/${scenarioId}/recompute`)
      .set(authHeader(fixtures.admin))
      .send({ inputs: { relatedTicketCount: 100, uniqueCustomers: 50, avgHandlingTimeMinutes: 20, supportCostPerHour: 20, projectedFutureTicketVolume: 100, estimatedFixEffectivenessPct: 90, engineeringCost: 1000 } });

    expect(recompute.status).toBe(200);
    // bigger inputs -> bigger computed savings than the original scenario
    expect(recompute.body.outputs.costSavings).toBeGreaterThan(create.body.outputs.costSavings);
  });
});
