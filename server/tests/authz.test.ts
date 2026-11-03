import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { resetDb, seedBaseFixtures } from "./fixtures";
import { authHeader } from "./helpers";

const app = createApp();

describe("Role-based access control", () => {
  let fixtures: Awaited<ReturnType<typeof seedBaseFixtures>>;

  beforeEach(async () => {
    await resetDb();
    fixtures = await seedBaseFixtures();
  });

  it("blocks a read-only analyst from creating a user (admin-only route) with 403", async () => {
    const res = await request(app)
      .post("/api/admin/users")
      .set(authHeader(fixtures.analyst))
      .send({ name: "New Agent", email: "new-agent@test.io", password: "Password123!", role: "SUPPORT_AGENT" });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("blocks requests with no bearer token with 401", async () => {
    const res = await request(app).get("/api/tickets");
    expect(res.status).toBe(401);
  });

  it("allows a super admin to create a user", async () => {
    const res = await request(app)
      .post("/api/admin/users")
      .set(authHeader(fixtures.admin))
      .send({ name: "New Agent", email: "new-agent@test.io", password: "Password123!", role: "SUPPORT_AGENT" });

    expect(res.status).toBe(201);
    expect(res.body.email).toBe("new-agent@test.io");
    expect(res.body.passwordHash).toBeUndefined();
  });
});
