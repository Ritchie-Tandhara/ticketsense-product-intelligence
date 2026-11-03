# TicketSense — Test Plan & Traceability

## 1. Test Approach

Backend: vitest + supertest against the real Express app (`createApp()`)
and an isolated SQLite test database (`server/test.db`, created fresh via
`prisma migrate deploy` in `tests/setup.ts`, never the dev database).
Fixtures (`tests/fixtures.ts`) seed a minimal, deterministic set of
teams/users/categories/SLA policies/assignment rules before each test.

Run with: `npm run test` (root) or `npm run test --workspace=server`.
All 18 tests pass as of this writing (see command output in the project
README / final report).

Frontend: no automated UI test suite is included in this MVP (see
`roadmap.md`); correctness was verified via `tsc --noEmit`, a production
`vite build`, and manual end-to-end smoke testing against the real API
(login, ticket list/detail, dashboard KPIs) during development.

## 2. Traceability Matrix

| Requirement | Test file | Test case |
|---|---|---|
| Ticket creation triggers deterministic AI categorization | `tests/tickets.test.ts` | "creates a ticket and auto-categorizes it via the deterministic classifier" |
| Invalid priority value rejected by Zod | `tests/tickets.test.ts` | "rejects an invalid priority value with a 400 validation error" |
| Invalid status transition rejected | `tests/tickets.test.ts` | "rejects an invalid status transition with a 400 error" |
| Reopen resets resolution SLA clock, preserves first-response due date | `tests/tickets.test.ts` | "allows a valid status transition chain and resets the resolution SLA clock on reopen" |
| Round-robin assignment distributes across available agents | `tests/assignment.test.ts` | "distributes tickets round-robin across available agents on the default team" |
| Overloaded agent excluded from assignment | `tests/assignment.test.ts` | "excludes an overloaded agent from round-robin assignment" |
| Critical ticket escalates to a senior agent | `tests/assignment.test.ts` | "escalates a critical ticket to a senior agent when one is available" |
| Critical ticket escalates to escalation team when no senior agent free | `tests/assignment.test.ts` | "escalates a critical ticket to the escalation team when no senior agent on the primary team is free" |
| SLA due date respects business hours / rolls to next business day | `tests/sla.test.ts` | "rolls over to the next business day when a deadline would fall after hours" |
| SLA due date skips weekends | `tests/sla.test.ts` | "skips weekends when computing business-hours due dates" |
| SLA 24x7 (non-business-hours) calculation | `tests/sla.test.ts` | "adds calendar minutes with no business-hours constraint" |
| AI classifier returns confidence + human-readable reasoning | `tests/aiClassifier.test.ts` | "returns a confidence score and human-readable reasoning for a clear-cut ticket" |
| Priority combines urgency/impact keywords, not sentiment alone | `tests/aiClassifier.test.ts` | "combines urgency/impact keywords and category match, not sentiment alone, for priority" |
| Low-confidence case is flagged | `tests/aiClassifier.test.ts` | "flags a low-confidence case when no strong keyword match exists" |
| Unauthorized role blocked from admin-only route (403) | `tests/authz.test.ts` | "blocks a read-only analyst from creating a user (admin-only route) with 403" |
| No token blocked (401) | `tests/authz.test.ts` | "blocks requests with no bearer token with 401" |
| Authorized role allowed | `tests/authz.test.ts` | "allows a super admin to create a user" |
| Dashboard KPI numbers match underlying seeded/created ticket data | `tests/analytics.test.ts` | "computes KPI totals that match the underlying seeded ticket data" |

## 3. KPI Definitions

All KPIs are computed on-demand in `server/src/services/analyticsService.ts`
from live `Ticket`/`SLAInstance` rows filtered by the request's query
params (`from`, `to`, `teamId`, `agentId`, `categoryId`, `priority`) — never
hardcoded or randomly generated.

| KPI | Formula | Denominator | Time window |
|---|---|---|---|
| **Total tickets** | Count of tickets matching filters | — | filter's `from`/`to`, else all time |
| **Open** | Count where `status NOT IN (RESOLVED, CLOSED)` | — | same |
| **Resolved** | Count where `status = RESOLVED` | — | same |
| **Closed** | Count where `status = CLOSED` | — | same |
| **Pending** | Count where `status = PENDING` | — | same |
| **Unassigned** | Count where `assignedAgentId IS NULL` | — | same |
| **Critical** | Count where `priority = CRITICAL` | — | same |
| **SLA At Risk** | Count of non-resolved/closed tickets whose `slaInstance.resolutionDueAt - now` is between 0 and 2 hours | — | "now" at request time |
| **SLA Breached** | Count where `slaInstance.resolutionBreached OR slaInstance.firstResponseBreached` | — | same |
| **Avg First Response (min)** | `sum(firstRespondedAt - createdAt) / count` | tickets with a non-null `firstRespondedAt` | same |
| **Avg Resolution (min)** | `sum(resolvedAt - createdAt) / count` | tickets with a non-null `resolvedAt` | same |
| **FCR Rate (%)** | `count(resolved tickets with reopenCount = 0) / count(resolved tickets) * 100` | resolved tickets (approximation documented below) | same |

**FCR approximation note:** "First Contact Resolution" ideally measures
whether a ticket was resolved without the customer needing to follow up.
In this MVP, it is approximated as *resolved tickets that were never
reopened* (`reopenCount = 0`), since that is the strongest signal available
from stored data without a dedicated "contact count" field. This
approximation is called out explicitly in code comments
(`analyticsService.ts`) and here, rather than presented as a precise
first-contact measurement.

## 4. What Was NOT Automated

- No load/performance testing (out of scope for a demo-scale SQLite app).
- No automated frontend/E2E (Playwright/Cypress) suite — see `roadmap.md`.
- No mutation/property-based testing of the deterministic classifier's
  keyword lexicon (it is a fixed, inspectable ruleset rather than a model,
  so classic unit tests on representative inputs were judged sufficient).
