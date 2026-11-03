import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { resetDb, seedBaseFixtures } from "./fixtures";
import { authHeader } from "./helpers";
import { prisma } from "../src/lib/prisma";

const app = createApp();

describe("Support-to-Roadmap Engine", () => {
  let fixtures: Awaited<ReturnType<typeof seedBaseFixtures>>;

  beforeEach(async () => {
    await resetDb();
    fixtures = await seedBaseFixtures();
  });

  async function makeIssueWithTickets(count = 3) {
    const issue = await prisma.productIssue.create({
      data: { title: "Recurring issue", description: "d", productArea: "Technical", firstSeenAt: new Date(), lastSeenAt: new Date() },
    });
    for (let i = 0; i < count; i++) {
      const ticket = await prisma.ticket.create({
        data: {
          ticketNumber: 8000 + i,
          subject: "Timeout against gateway",
          description: "We keep seeing a timeout against the SMS gateway when sending codes.",
          requesterName: `Customer ${i}`,
          requesterEmail: `c${i}@example.com`,
          status: "RESOLVED",
        },
      });
      await prisma.issueTicketLink.create({ data: { issueId: issue.id, ticketId: ticket.id, manual: true } });
    }
    return issue;
  }

  it("generates a draft work item from an issue with an evidence-grounded root-cause hypothesis", async () => {
    const issue = await makeIssueWithTickets();
    const res = await request(app).post(`/api/issues/${issue.id}/work-items/generate-draft`).set(authHeader(fixtures.admin));
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("DRAFT");
    expect(res.body.rootCauseIsHypothesis).toBe(true);
    expect(res.body.aiDisclaimer).toMatch(/AI-drafted/);
  });

  it("refuses to draft a work item from an issue with no linked tickets", async () => {
    const issue = await prisma.productIssue.create({ data: { title: "Empty", description: "d", productArea: "Technical", firstSeenAt: new Date(), lastSeenAt: new Date() } });
    const res = await request(app).post(`/api/issues/${issue.id}/work-items/generate-draft`).set(authHeader(fixtures.admin));
    expect(res.status).toBe(400);
  });

  it("enforces the approval state machine: rejects invalid transitions, allows valid ones", async () => {
    const issue = await makeIssueWithTickets();
    const draftRes = await request(app).post(`/api/issues/${issue.id}/work-items/generate-draft`).set(authHeader(fixtures.admin));
    const workItemId = draftRes.body.id;

    // Cannot jump straight from DRAFT to APPROVED
    const invalid = await request(app).post(`/api/work-items/${workItemId}/transition`).set(authHeader(fixtures.admin)).send({ status: "APPROVED" });
    expect(invalid.status).toBe(400);

    const toReview = await request(app).post(`/api/work-items/${workItemId}/transition`).set(authHeader(fixtures.admin)).send({ status: "UNDER_REVIEW" });
    expect(toReview.status).toBe(200);

    const approve = await request(app).post(`/api/work-items/${workItemId}/transition`).set(authHeader(fixtures.admin)).send({ status: "APPROVED" });
    expect(approve.status).toBe(200);
    expect(approve.body.status).toBe("APPROVED");

    // A VERIFIED item has no further transitions
    await prisma.workItem.update({ where: { id: workItemId }, data: { status: "VERIFIED" } });
    const afterVerified = await request(app).post(`/api/work-items/${workItemId}/transition`).set(authHeader(fixtures.admin)).send({ status: "DRAFT" });
    expect(afterVerified.status).toBe(400);
  });

  it("creates a WorkItemVersion snapshot on edit", async () => {
    const issue = await makeIssueWithTickets();
    const draftRes = await request(app).post(`/api/issues/${issue.id}/work-items/generate-draft`).set(authHeader(fixtures.admin));
    const workItemId = draftRes.body.id;

    const editRes = await request(app).patch(`/api/work-items/${workItemId}`).set(authHeader(fixtures.admin)).send({ title: "Updated title" });
    expect(editRes.status).toBe(200);
    expect(editRes.body.title).toBe("Updated title");

    const detail = await request(app).get(`/api/work-items/${workItemId}`).set(authHeader(fixtures.admin));
    expect(detail.body.versions.length).toBe(1);
  });
});
