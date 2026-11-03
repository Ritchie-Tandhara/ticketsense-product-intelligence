import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { resetDb, seedBaseFixtures } from "./fixtures";
import { authHeader } from "./helpers";

const app = createApp();

describe("Dashboard analytics KPIs", () => {
  let fixtures: Awaited<ReturnType<typeof seedBaseFixtures>>;

  beforeEach(async () => {
    await resetDb();
    fixtures = await seedBaseFixtures();
  });

  it("computes KPI totals that match the underlying seeded ticket data", async () => {
    const maxTicket = await prisma.ticket.aggregate({ _max: { ticketNumber: true } });
    let n = maxTicket._max.ticketNumber ?? 1000;

    // Create a known, deterministic mix of tickets directly via Prisma.
    const statuses = ["NEW", "OPEN", "OPEN", "RESOLVED", "CLOSED"];
    for (const status of statuses) {
      n++;
      await prisma.ticket.create({
        data: {
          ticketNumber: n,
          subject: "KPI test ticket",
          description: "desc",
          status,
          priority: status === "OPEN" ? "CRITICAL" : "LOW",
          requesterName: "Customer",
          requesterEmail: "customer@example.com",
          assignedAgentId: status === "NEW" ? null : fixtures.agent1.id,
        },
      });
    }

    const res = await request(app).get("/api/analytics/kpis").set(authHeader(fixtures.admin));
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(5);
    expect(res.body.resolved).toBe(1);
    expect(res.body.closed).toBe(1);
    expect(res.body.critical).toBe(2);
    expect(res.body.unassigned).toBe(1);
    // open = everything not resolved/closed = NEW + OPEN + OPEN = 3
    expect(res.body.open).toBe(3);
  });
});
