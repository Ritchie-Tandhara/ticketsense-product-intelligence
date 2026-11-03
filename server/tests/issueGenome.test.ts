import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { resetDb, seedBaseFixtures } from "./fixtures";
import { authHeader } from "./helpers";
import { prisma } from "../src/lib/prisma";

const app = createApp();

async function makeTicket(overrides: Partial<{ subject: string; description: string; categoryId: string; createdById: string }> = {}) {
  const n = Math.floor(Math.random() * 1_000_000);
  return prisma.ticket.create({
    data: {
      ticketNumber: 9000 + n,
      subject: overrides.subject ?? "OTP not received during login",
      description: overrides.description ?? "I am not receiving the OTP verification code when I try to log in, the SMS never arrives.",
      requesterName: "Test Customer",
      requesterEmail: `customer${n}@example.com`,
      categoryId: overrides.categoryId,
      createdById: overrides.createdById,
      status: "RESOLVED",
    },
  });
}

describe("Issue Genome", () => {
  let fixtures: Awaited<ReturnType<typeof seedBaseFixtures>>;

  beforeEach(async () => {
    await resetDb();
    fixtures = await seedBaseFixtures();
  });

  it("detects a cluster of near-duplicate tickets via /api/issues/detect-clustering", async () => {
    for (let i = 0; i < 4; i++) {
      await makeTicket({
        subject: "OTP not received during login",
        description: `I am not receiving the OTP verification code when I try to log in, the SMS never arrives on my phone attempt ${i}.`,
        categoryId: fixtures.category.id,
        createdById: fixtures.admin.id,
      });
    }
    await makeTicket({ subject: "Feature request: dark mode", description: "Please add a dark mode toggle to settings, not urgent.", categoryId: fixtures.category.id, createdById: fixtures.admin.id });

    const res = await request(app).post("/api/issues/detect-clustering").set(authHeader(fixtures.admin));
    expect(res.status).toBe(200);
    expect(res.body.issuesCreated).toBeGreaterThanOrEqual(1);

    const list = await request(app).get("/api/issues").set(authHeader(fixtures.admin));
    expect(list.body.data.length).toBeGreaterThanOrEqual(1);
    expect(list.body.data[0].relatedTicketCount).toBeGreaterThanOrEqual(3);
  });

  it("manually links and unlinks a ticket, preserving audit history", async () => {
    const issue = await prisma.productIssue.create({
      data: { title: "Test issue", description: "desc", productArea: "Technical", firstSeenAt: new Date(), lastSeenAt: new Date() },
    });
    const ticket = await makeTicket();

    const linkRes = await request(app).post(`/api/issues/${issue.id}/link-ticket`).set(authHeader(fixtures.admin)).send({ ticketId: ticket.id });
    expect(linkRes.status).toBe(201);

    const detail = await request(app).get(`/api/issues/${issue.id}`).set(authHeader(fixtures.admin));
    expect(detail.body.relatedTicketCount).toBe(1);

    const unlinkRes = await request(app).post(`/api/issues/${issue.id}/unlink-ticket`).set(authHeader(fixtures.admin)).send({ ticketId: ticket.id });
    expect(unlinkRes.status).toBe(200);
    expect(unlinkRes.body.removedAt).toBeTruthy();

    const detailAfter = await request(app).get(`/api/issues/${issue.id}`).set(authHeader(fixtures.admin));
    expect(detailAfter.body.relatedTicketCount).toBe(0);
    // history preserved
    expect(detailAfter.body.linkHistory.length).toBe(1);
  });

  it("merges two issues, moving all ticket links and preserving history", async () => {
    const source = await prisma.productIssue.create({ data: { title: "Source", description: "d", productArea: "Technical", firstSeenAt: new Date(), lastSeenAt: new Date() } });
    const target = await prisma.productIssue.create({ data: { title: "Target", description: "d", productArea: "Technical", firstSeenAt: new Date(), lastSeenAt: new Date() } });
    const t1 = await makeTicket();
    const t2 = await makeTicket();
    await prisma.issueTicketLink.create({ data: { issueId: source.id, ticketId: t1.id, manual: true } });
    await prisma.issueTicketLink.create({ data: { issueId: source.id, ticketId: t2.id, manual: true } });

    const res = await request(app).post("/api/issues/merge").set(authHeader(fixtures.admin)).send({ sourceIssueId: source.id, targetIssueId: target.id });
    expect(res.status).toBe(200);
    expect(res.body.mergedTicketLinks).toBe(2);

    const targetDetail = await request(app).get(`/api/issues/${target.id}`).set(authHeader(fixtures.admin));
    expect(targetDetail.body.relatedTicketCount).toBe(2);

    const sourceDetail = await request(app).get(`/api/issues/${source.id}`).set(authHeader(fixtures.admin));
    expect(sourceDetail.body.relatedTicketCount).toBe(0);
    expect(sourceDetail.body.linkHistory.length).toBe(2); // history kept, just marked removed
  });

  it("splits selected tickets off an issue into a new issue, preserving associations", async () => {
    const source = await prisma.productIssue.create({ data: { title: "Big cluster", description: "d", productArea: "Technical", firstSeenAt: new Date(), lastSeenAt: new Date() } });
    const t1 = await makeTicket();
    const t2 = await makeTicket();
    const t3 = await makeTicket();
    for (const t of [t1, t2, t3]) {
      await prisma.issueTicketLink.create({ data: { issueId: source.id, ticketId: t.id, manual: true } });
    }

    const res = await request(app)
      .post(`/api/issues/${source.id}/split`)
      .set(authHeader(fixtures.admin))
      .send({ ticketIds: [t1.id, t2.id], newIssue: { title: "Split issue", description: "d", productArea: "Technical" } });

    expect(res.status).toBe(201);
    expect(res.body.movedTickets).toBe(2);

    const sourceDetail = await request(app).get(`/api/issues/${source.id}`).set(authHeader(fixtures.admin));
    expect(sourceDetail.body.relatedTicketCount).toBe(1);

    const newDetail = await request(app).get(`/api/issues/${res.body.newIssue.id}`).set(authHeader(fixtures.admin));
    expect(newDetail.body.relatedTicketCount).toBe(2);
  });

  it("requires a human note when confirming an issue, and enforces the status state machine", async () => {
    const issue = await prisma.productIssue.create({ data: { title: "T", description: "d", productArea: "Technical", status: "UNDER_REVIEW", firstSeenAt: new Date(), lastSeenAt: new Date() } });

    const noNote = await request(app).post(`/api/issues/${issue.id}/transition`).set(authHeader(fixtures.admin)).send({ status: "CONFIRMED" });
    expect(noNote.status).toBe(400);

    const withNote = await request(app).post(`/api/issues/${issue.id}/transition`).set(authHeader(fixtures.admin)).send({ status: "CONFIRMED", note: "Confirmed after review of 5 tickets." });
    expect(withNote.status).toBe(200);
    expect(withNote.body.status).toBe("CONFIRMED");

    // Cannot skip straight to RESOLVED
    const invalid = await request(app).post(`/api/issues/${issue.id}/transition`).set(authHeader(fixtures.admin)).send({ status: "RESOLVED" });
    expect(invalid.status).toBe(400);
  });
});
