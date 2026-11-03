import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { resetDb, seedBaseFixtures } from "./fixtures";
import { authHeader } from "./helpers";
import { prisma } from "../src/lib/prisma";

const app = createApp();

describe("Resolution Intelligence", () => {
  let fixtures: Awaited<ReturnType<typeof seedBaseFixtures>>;

  beforeEach(async () => {
    await resetDb();
    fixtures = await seedBaseFixtures();
  });

  async function makeTicket(createdAt: Date, email: string) {
    const n = Math.floor(Math.random() * 1_000_000);
    return prisma.ticket.create({
      data: {
        ticketNumber: 7000 + n,
        subject: "Recurring issue",
        description: "Recurring problem description.",
        requesterName: "Customer",
        requesterEmail: email,
        status: "RESOLVED",
        createdAt,
        updatedAt: createdAt,
        resolvedAt: new Date(createdAt.getTime() + 3_600_000),
      },
    });
  }

  it("links an issue to a release", async () => {
    const issue = await prisma.productIssue.create({ data: { title: "Issue", description: "d", productArea: "Technical", firstSeenAt: new Date(), lastSeenAt: new Date() } });
    const release = await request(app).post("/api/releases").set(authHeader(fixtures.admin)).send({ name: "Fix Release", version: "1.0.0", releasedAt: new Date().toISOString() });
    expect(release.status).toBe(201);

    const link = await request(app).post(`/api/releases/${release.body.id}/link-issue`).set(authHeader(fixtures.admin)).send({ issueId: issue.id });
    expect(link.status).toBe(201);
  });

  it("classifies a resolution measurement as Improving from real pre/post ticket data", async () => {
    const issue = await prisma.productIssue.create({ data: { title: "Issue", description: "d", productArea: "Technical", firstSeenAt: new Date(), lastSeenAt: new Date() } });
    const releasedAt = new Date();
    const release = await prisma.release.create({ data: { name: "Fix", version: "1.0.0", releasedAt } });
    await prisma.releaseIssueLink.create({ data: { releaseId: release.id, issueId: issue.id } });

    // 10 tickets before release (within 30-day pre window), 2 after (big drop)
    for (let i = 0; i < 10; i++) {
      const t = await makeTicket(new Date(releasedAt.getTime() - (i + 1) * 86400000), `pre${i}@example.com`);
      await prisma.issueTicketLink.create({ data: { issueId: issue.id, ticketId: t.id, manual: true } });
    }
    for (let i = 0; i < 3; i++) {
      const t = await makeTicket(new Date(releasedAt.getTime() + (i + 1) * 86400000), `post${i}@example.com`);
      await prisma.issueTicketLink.create({ data: { issueId: issue.id, ticketId: t.id, manual: true } });
    }

    const res = await request(app).post(`/api/releases/${release.id}/measure`).set(authHeader(fixtures.admin)).send({ issueId: issue.id, windowDays: 30 });
    expect(res.status).toBe(201);
    expect(res.body.outcomeClassification).toBe("IMPROVING");
    expect(res.body.preTicketCount).toBe(10);
  });

  it("classifies a resolution measurement as No Material Change when volume barely moves", async () => {
    const issue = await prisma.productIssue.create({ data: { title: "Issue", description: "d", productArea: "Technical", firstSeenAt: new Date(), lastSeenAt: new Date() } });
    const releasedAt = new Date();
    const release = await prisma.release.create({ data: { name: "Fix", version: "1.0.0", releasedAt } });

    for (let i = 0; i < 10; i++) {
      const t = await makeTicket(new Date(releasedAt.getTime() - (i + 1) * 86400000), `pre${i}@example.com`);
      await prisma.issueTicketLink.create({ data: { issueId: issue.id, ticketId: t.id, manual: true } });
    }
    for (let i = 0; i < 9; i++) {
      const t = await makeTicket(new Date(releasedAt.getTime() + (i + 1) * 86400000), `post${i}@example.com`);
      await prisma.issueTicketLink.create({ data: { issueId: issue.id, ticketId: t.id, manual: true } });
    }

    const res = await request(app).post(`/api/releases/${release.id}/measure`).set(authHeader(fixtures.admin)).send({ issueId: issue.id, windowDays: 30 });
    expect(res.status).toBe(201);
    expect(res.body.outcomeClassification).toBe("NO_MATERIAL_CHANGE");
  });

  it("reopens an issue after a measurement shows a bad outcome", async () => {
    const issue = await prisma.productIssue.create({ data: { title: "Issue", description: "d", productArea: "Technical", status: "MONITORING", firstSeenAt: new Date(), lastSeenAt: new Date() } });
    const release = await prisma.release.create({ data: { name: "Fix", version: "1.0.0", releasedAt: new Date() } });
    const measurement = await prisma.resolutionMeasurement.create({
      data: {
        issueId: issue.id,
        releaseId: release.id,
        preWindowStart: new Date(),
        preWindowEnd: new Date(),
        postWindowStart: new Date(),
        postWindowEnd: new Date(),
        preTicketCount: 10,
        postTicketCount: 15,
        preAffectedCustomers: 8,
        postAffectedCustomers: 12,
        preSupportHours: 20,
        postSupportHours: 30,
        outcomeClassification: "WORSENING",
      },
    });

    const res = await request(app).post(`/api/measurements/${measurement.id}/reopen-issue`).set(authHeader(fixtures.admin));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("REOPENED");
  });

  it("verifying an Improving measurement resolves the issue", async () => {
    const issue = await prisma.productIssue.create({ data: { title: "Issue", description: "d", productArea: "Technical", status: "MONITORING", firstSeenAt: new Date(), lastSeenAt: new Date() } });
    const release = await prisma.release.create({ data: { name: "Fix", version: "1.0.0", releasedAt: new Date() } });
    const measurement = await prisma.resolutionMeasurement.create({
      data: {
        issueId: issue.id,
        releaseId: release.id,
        preWindowStart: new Date(),
        preWindowEnd: new Date(),
        postWindowStart: new Date(),
        postWindowEnd: new Date(),
        preTicketCount: 10,
        postTicketCount: 2,
        preAffectedCustomers: 8,
        postAffectedCustomers: 2,
        preSupportHours: 20,
        postSupportHours: 4,
        outcomeClassification: "IMPROVING",
      },
    });

    const res = await request(app).post(`/api/measurements/${measurement.id}/verify`).set(authHeader(fixtures.admin));
    expect(res.status).toBe(200);
    expect(res.body.verifiedAt).toBeTruthy();

    const updatedIssue = await prisma.productIssue.findUnique({ where: { id: issue.id } });
    expect(updatedIssue?.status).toBe("RESOLVED");
  });
});
