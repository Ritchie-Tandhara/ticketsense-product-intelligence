import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { resetDb, seedBaseFixtures } from "./fixtures";
import { authHeader } from "./helpers";

const app = createApp();

describe("Tickets", () => {
  let fixtures: Awaited<ReturnType<typeof seedBaseFixtures>>;

  beforeEach(async () => {
    await resetDb();
    fixtures = await seedBaseFixtures();
  });

  it("creates a ticket and auto-categorizes it via the deterministic classifier", async () => {
    const res = await request(app)
      .post("/api/tickets")
      .set(authHeader(fixtures.admin))
      .send({
        subject: "Cannot log into my account",
        description: "I keep getting invalid password errors and cannot access my dashboard, this is urgent.",
        requesterName: "Test Customer",
        requesterEmail: "customer@example.com",
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.status).toBe("NEW");
    // No explicit priority given -> should be set by the deterministic classifier
    expect(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).toContain(res.body.priority);

    const detail = await request(app).get(`/api/tickets/${res.body.id}`).set(authHeader(fixtures.admin));
    expect(detail.body.recommendations.length).toBeGreaterThan(0);
    expect(detail.body.recommendations[0].suggestedCategory).toBe("Technical");
  });

  it("rejects an invalid priority value with a 400 validation error", async () => {
    const res = await request(app)
      .post("/api/tickets")
      .set(authHeader(fixtures.admin))
      .send({
        subject: "Some ticket",
        description: "Some description",
        requesterName: "Test Customer",
        requesterEmail: "customer@example.com",
        priority: "SUPER_URGENT", // invalid enum value
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects an invalid status transition with a 400 error", async () => {
    const create = await request(app)
      .post("/api/tickets")
      .set(authHeader(fixtures.admin))
      .send({
        subject: "Ticket in NEW state",
        description: "Some description",
        requesterName: "Test Customer",
        requesterEmail: "customer@example.com",
        priority: "LOW",
      });

    // NEW -> RESOLVED is not a valid direct transition
    const res = await request(app)
      .post(`/api/tickets/${create.body.id}/status`)
      .set(authHeader(fixtures.admin))
      .send({ status: "RESOLVED" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("BAD_REQUEST");
    expect(res.body.error.details.allowedNextStatuses).toEqual(["OPEN"]);
  });

  it("allows a valid status transition chain and resets the resolution SLA clock on reopen", async () => {
    const create = await request(app)
      .post("/api/tickets")
      .set(authHeader(fixtures.admin))
      .send({
        subject: "Reopen flow test",
        description: "Some description",
        requesterName: "Test Customer",
        requesterEmail: "customer@example.com",
        priority: "MEDIUM",
      });
    const ticketId = create.body.id;

    await request(app).post(`/api/tickets/${ticketId}/status`).set(authHeader(fixtures.admin)).send({ status: "OPEN" });
    await request(app).post(`/api/tickets/${ticketId}/status`).set(authHeader(fixtures.admin)).send({ status: "RESOLVED" });

    const beforeReopen = await request(app).get(`/api/tickets/${ticketId}`).set(authHeader(fixtures.admin));
    const originalFirstResponseDue = beforeReopen.body.slaInstance.firstResponseDueAt;
    const originalResolutionDue = beforeReopen.body.slaInstance.resolutionDueAt;

    const reopenRes = await request(app)
      .post(`/api/tickets/${ticketId}/status`)
      .set(authHeader(fixtures.admin))
      .send({ status: "OPEN" });
    expect(reopenRes.status).toBe(200);
    expect(reopenRes.body.reopenCount).toBe(1);

    const afterReopen = await request(app).get(`/api/tickets/${ticketId}`).set(authHeader(fixtures.admin));
    // First-response due date is left as-is per the documented reopen rule.
    expect(afterReopen.body.slaInstance.firstResponseDueAt).toBe(originalFirstResponseDue);
    // Resolution due date is reset (recomputed from "now"), so it should differ
    // from the original resolution due date computed at ticket creation.
    expect(afterReopen.body.slaInstance.resolutionDueAt).not.toBe(originalResolutionDue);
    expect(afterReopen.body.slaInstance.resolutionBreached).toBe(false);
  });
});
