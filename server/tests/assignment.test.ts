import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../src/lib/prisma";
import { resetDb, seedBaseFixtures } from "./fixtures";
import { evaluateAssignment } from "../src/services/assignmentService";

describe("Assignment engine", () => {
  let fixtures: Awaited<ReturnType<typeof seedBaseFixtures>>;

  beforeEach(async () => {
    await resetDb();
    fixtures = await seedBaseFixtures();
  });

  async function makeTicket(priority: string, categoryId?: string) {
    const maxTicket = await prisma.ticket.aggregate({ _max: { ticketNumber: true } });
    return prisma.ticket.create({
      data: {
        ticketNumber: (maxTicket._max.ticketNumber ?? 1000) + 1,
        subject: "Test ticket",
        description: "Test description",
        priority,
        categoryId,
        requesterName: "Customer",
        requesterEmail: "customer@example.com",
        status: "NEW",
      },
    });
  }

  it("distributes tickets round-robin across available agents on the default team", async () => {
    // agent1 and agent2 and seniorAgent are all on fixtures.team with maxLoad >= 2
    const picks = new Set<string>();
    for (let i = 0; i < 3; i++) {
      const ticket = await makeTicket("MEDIUM");
      const result = await evaluateAssignment(ticket);
      expect(result.agentId).toBeTruthy();
      picks.add(result.agentId!);
    }
    // Round robin across 3 available agents should hit more than one distinct agent.
    expect(picks.size).toBeGreaterThan(1);
  });

  it("excludes an overloaded agent from round-robin assignment", async () => {
    // Load agent1 and agent2 up to their maxLoad (2) with existing active tickets.
    for (const agent of [fixtures.agent1, fixtures.agent2]) {
      for (let i = 0; i < 2; i++) {
        const t = await makeTicket("MEDIUM");
        await prisma.ticket.update({ where: { id: t.id }, data: { assignedAgentId: agent.id, status: "OPEN" } });
      }
    }

    const ticket = await makeTicket("MEDIUM");
    const result = await evaluateAssignment(ticket);

    // Only seniorAgent should remain available (not yet loaded).
    expect(result.agentId).toBe(fixtures.seniorAgent.id);
  });

  it("escalates a critical ticket to a senior agent when one is available", async () => {
    const ticket = await makeTicket("CRITICAL");
    const result = await evaluateAssignment(ticket);
    expect(result.agentId).toBe(fixtures.seniorAgent.id);
    expect(result.reason.toLowerCase()).toContain("senior");
  });

  it("escalates a critical ticket to the escalation team when no senior agent on the primary team is free", async () => {
    // Overload the senior agent on the primary team.
    for (let i = 0; i < 5; i++) {
      const t = await makeTicket("MEDIUM");
      await prisma.ticket.update({ where: { id: t.id }, data: { assignedAgentId: fixtures.seniorAgent.id, status: "OPEN" } });
    }

    const ticket = await makeTicket("CRITICAL");
    const result = await evaluateAssignment(ticket);
    expect(result.agentId).toBe(fixtures.escalationAgent.id);
  });
});
