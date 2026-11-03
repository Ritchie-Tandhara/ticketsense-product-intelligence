# TicketSense — API Reference

Base URL: `http://localhost:4000/api` (proxied from the client at `/api`).
All endpoints except `/auth/login` and `/health` require
`Authorization: Bearer <JWT>`. Error shape is always:

```json
{ "error": { "code": "BAD_REQUEST", "message": "...", "details": {} } }
```

List endpoints return a pagination envelope:
```json
{ "data": [ ... ], "pagination": { "page": 1, "pageSize": 20, "total": 120, "totalPages": 8 } }
```

## Auth

### `POST /auth/login`
```json
// Request
{ "email": "admin@ticketsense.io", "password": "Password123!" }
// Response 200
{ "token": "<jwt>", "user": { "id": "...", "email": "...", "name": "...", "role": "SUPER_ADMIN", "teamId": "..." } }
```

### `GET /auth/me` — current user from the bearer token.

## Tickets

### `GET /tickets?page=1&pageSize=20&status=OPEN&priority=HIGH&categoryId=&agentId=&teamId=&search=&from=&to=&sortBy=createdAt&sortDir=desc`
Returns a paginated list with `category`, `team`, `assignedAgent`,
`slaInstance` included.

### `GET /tickets/:id`
Full detail: requester info, `messages` (asc), `events` (desc),
`recommendations` (desc), `slaInstance`, and `allowedNextStatuses` (computed
from the current status via the state machine).

### `POST /tickets`
```json
{
  "subject": "Cannot log into my account",
  "description": "...",
  "requesterName": "Priya Sharma",
  "requesterEmail": "priya@example.com",
  "priority": "HIGH",       // optional - if omitted, the deterministic classifier sets it
  "categoryId": "...",      // optional
  "teamId": "..."           // optional
}
```
Response `201` with the created ticket. If `priority` was omitted, an
`AIRecommendation` row is also created and a `TicketEvent` of type
`CREATED` is logged. An `SLAInstance` is always created from the matching
`SLAPolicy`.

### `PATCH /tickets/:id` — partial update of subject/description/priority/categoryId/teamId/assignedAgentId.

### `POST /tickets/:id/status`
```json
{ "status": "OPEN", "comment": "optional note" }
```
Validates the transition against the state machine. Invalid transitions
return `400` with `details.allowedNextStatuses`. Reopen (RESOLVED/CLOSED ->
OPEN) increments `reopenCount` and resets the resolution SLA clock (see
`business-rules-and-sla.md`).

### `POST /tickets/bulk`
```json
{ "ticketIds": ["id1", "id2"], "status": "RESOLVED", "assignedAgentId": "..." }
```
Applies status and/or assignment to each ticket; per-ticket results are
returned so partial failures (e.g. an invalid transition for one ticket)
don't abort the whole batch.

### `POST /tickets/:id/messages`
```json
{ "body": "Thanks for reaching out...", "type": "AGENT_REPLY" }
```
`type` is one of `CUSTOMER_REPLY`, `AGENT_REPLY`, `INTERNAL_NOTE`. An
`AGENT_REPLY` also stops the first-response SLA clock if this is the
ticket's first one.

### `GET /tickets/:id/events` — the audit/activity timeline for one ticket.

### `POST /tickets/:id/ai-analyze`
Runs the deterministic classifier against the ticket's current
subject/description and stores a new `AIRecommendation`.
```json
// Response 201
{
  "suggestedCategory": "Technical",
  "suggestedSubcategory": "Login/Access",
  "suggestedPriority": "HIGH",
  "suggestedSentiment": "NEGATIVE",
  "confidence": 0.71,
  "reasoning": "Matched 2 keyword(s) ... Sentiment keyword score was -2.0 ... Priority score 3.5 ..."
}
```

### `POST /tickets/:id/ai-recommendations/:recId/review`
```json
{ "decision": "EDITED", "editedValue": { "suggestedPriority": "CRITICAL" } }
```
`decision` is `ACCEPTED` | `REJECTED` | `EDITED`. Accepting or editing
applies the resulting priority to the ticket.

### `POST /tickets/:id/auto-assign`
Runs the rule-based assignment engine (see `business-rules-and-sla.md` /
`architecture.md` for strategy details) and returns the updated ticket plus
the chosen rule/agent/reason.

## Assignment Rules

- `GET /assignment-rules`
- `POST /assignment-rules` `{ name, strategy, targetTeamId, conditionPriority?, conditionCategoryId?, isDefault? }`
- `PATCH /assignment-rules/:id`
- `DELETE /assignment-rules/:id`
- `POST /assignment-rules/reorder` `{ orderedIds: [...] }`
- `POST /assignment-rules/dry-run` `{ priority, categoryId? }` — simulates the
  engine against a sample ticket without creating one.

## SLA

- `GET /sla/policies`
- `POST /sla/policies` `{ name, priority, firstResponseTargetMin, resolutionTargetMin, businessHoursOnly }`
- `PATCH /sla/policies/:id`
- `GET /sla/breaches` — all SLAInstance rows with a breach flag set, with ticket details.
- `POST /sla/run-breach-detection` — sweeps all non-resolved/closed tickets and flags new breaches.

## Analytics (all accept `?from=&to=&teamId=&agentId=&categoryId=&priority=`)

- `GET /analytics/kpis` → totals, SLA at-risk/breached counts, avg first
  response/resolution minutes, FCR rate.
- `GET /analytics/volume-trend` → `[{ date, count }]`
- `GET /analytics/by-priority` → `[{ priority, count }]`
- `GET /analytics/by-category` → `[{ category, count }]`
- `GET /analytics/sla-compliance-trend` → `[{ date, compliancePct }]`
- `GET /analytics/agent-performance` → `[{ agentId, name, total, resolved, breached }]`
- `GET /analytics/backlog-aging` → `[{ bucket: "0-1d"|"1-3d"|"3-7d"|"7d+", count }]`

## Knowledge Base

- `GET /knowledge?search=&published=true`
- `POST /knowledge` `{ title, body, tags, isPublished? }`
- `PATCH /knowledge/:id`
- `DELETE /knowledge/:id`
- `GET /knowledge/suggest/:ticketId` — keyword-overlap suggested articles for a ticket.

## Admin

- `GET/POST/PATCH /admin/users` (`DELETE` not exposed; deactivate via `PATCH isActive:false`)
- `GET/POST/PATCH/DELETE /admin/teams`
- `GET/POST/PATCH/DELETE /admin/categories`
- `GET /admin/audit-log`

## Recommendations (AI Intelligence page)

- `GET /recommendations` — paginated, most recent first, across all tickets.
- `GET /recommendations/stats` → `{ total, accepted, rejected, edited, pending, acceptanceRate, avgConfidence, lowConfidenceCount }`

## Health

- `GET /health` — `{ status: "ok", timestamp }`, unauthenticated.

## V2 — Issue Genome

Full formulas in `product-intelligence.md`.

- `GET /issues?page=&pageSize=&status=&productArea=` — paginated, each row
  includes `relatedTicketCount` / `uniqueCustomers` computed live.
- `GET /issues/:id` — full detail: `supportingTickets`, `commonSymptoms`,
  `volumeTrend` (12-week bucket counts), `linkHistory` (including removed
  links, for audit), `similarityExplanation`, `allowedNextStatuses`.
- `POST /issues/detect-clustering` — runs clustering over tickets not yet
  linked to any issue; creates `ProductIssue` rows + a `ClusteringRun` audit
  record. Manager/Admin only.
- `GET /issues/clustering-runs/history`
- `POST /issues` — manual issue creation.
- `POST /issues/:id/link-ticket` / `POST /issues/:id/unlink-ticket` —
  `{ ticketId }`; unlink is a soft-delete (`removedAt`/`removedBy`), history
  is kept.
- `POST /issues/merge` — `{ sourceIssueId, targetIssueId }`.
- `POST /issues/:id/split` — `{ ticketIds, newIssue: { title, description, productArea } }`.
- `POST /issues/:id/transition` — `{ status, note? }`; `note` is **required**
  when transitioning to `CONFIRMED`.
- `POST /issues/:id/assign-owner` — `{ ownerId }`.

## V2 — Fix Impact Simulator

- `GET /issues/:issueId/impact-scenarios` / `GET /impact-scenarios/:id`
- `POST /issues/:issueId/impact-scenarios` — `{ name, scenarioType, inputs }`;
  `outputs` (incl. `prioritization`) are always computed server-side.
- `POST /issues/:issueId/impact-scenarios/preview` — same `inputs` shape,
  **not persisted**; used by the UI for live recalculation while editing.
- `POST /impact-scenarios/:id/recompute` — re-derives outputs from posted
  (or stored) inputs; never trusts client-sent output numbers.
- `GET /issues/:issueId/impact-scenarios/compare` — latest scenario per type.

## V2 — Support-to-Roadmap Engine

- `POST /issues/:issueId/work-items/generate-draft` — AI-BA-Assistant draft
  (deterministic template, not an LLM); 400 if the issue has no linked
  tickets.
- `GET /work-items?status=&issueId=` / `GET /work-items/:id` (includes
  `allowedNextStatuses`, `versions`).
- `PATCH /work-items/:id` — any field; creates a `WorkItemVersion` snapshot
  of the prior state first.
- `POST /work-items/:id/transition` — `{ status, note? }`, enforced by the
  Draft→...→Verified state machine (Rejected/Needs-Revision branch back to
  Draft).
- `GET /work-items/:id/export?format=json|csv` — generic issue-tracker
  import shape (the "Jira/Azure DevOps adapter" integration seam).

## V2 — Resolution Intelligence

- `GET /releases` / `POST /releases` / `GET /releases/:id`
- `POST /releases/:id/link-issue` — `{ issueId }`.
- `POST /releases/:id/measure` — `{ issueId, windowDays? }` (default 30);
  computes real pre/post ticket metrics and classifies the outcome.
- `GET /measurements?issueId=&releaseId=` — includes `thresholds`.
- `POST /measurements/:id/verify` — sets `verifiedBy`/`verifiedAt`; also
  auto-resolves the issue if the outcome was Improving.
- `POST /measurements/:id/reopen-issue` — transitions the `ProductIssue` to
  `REOPENED`.
