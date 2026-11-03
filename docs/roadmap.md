# TicketSense — Roadmap

> **V2 note:** this file now covers both the original V1 support-ops MVP
> (below) and the four V2 "Product Intelligence" modules (Issue Genome, Fix
> Impact Simulator, Support-to-Roadmap Engine, Resolution Intelligence). See
> `product-intelligence.md` for the formulas/ERD and
> **"V2 — Product Intelligence feature status"** further down for an honest
> Implemented / Interactive Demo / Planned breakdown against the full
> original V2 spec. Most of the original spec is **Planned** — that is
> expected and stated honestly rather than oversold.

## MVP (delivered, this repository)

- Full ticket lifecycle with enforced state machine + controlled reopen.
- Deterministic, keyword/rule-based AI classifier (category, subcategory,
  sentiment, priority, confidence, reasoning) with accept/reject/edit
  review workflow and a clean provider seam for a future real LLM.
- Configurable, ordered assignment rules with four working strategies
  (round robin, least-active, category-based, priority escalation with
  senior-agent/escalation-team routing) and a dry-run preview.
- SLA policies per priority, business-hours-aware (9am-6pm Mon-Fri,
  configurable org timezone) and 24x7 due-date calculation, documented
  reopen clock-reset rule, breach detection sweep.
- Dashboard analytics (KPIs + 6 chart types) computed entirely from stored
  data, filterable by date range/team/agent/category/priority.
- Ticket CRUD, messaging (customer reply / agent reply / internal note),
  full activity timeline, bulk status/assignment actions.
- Knowledge base with publish/unpublish and keyword-overlap suggested
  articles per ticket.
- Role-based access control (4 roles) enforced server-side on every
  protected route, not just hidden in the UI.
- Reports (agent productivity, category bottlenecks, SLA compliance) with
  client-side CSV export and drill-down links into filtered ticket lists.
- Team/category/user administration, audit log.
- Light/dark theme, toasts, confirmation on destructive actions, loading
  /empty/error states on every data view.
- 18 passing automated backend tests covering the scenarios in
  `test-plan-and-traceability.md`.
- Seed script producing ~120 tickets across varied lifecycle stages,
  12 agents, 4 teams, 5 categories, mixed AI-recommendation decisions, and
  SLA-compliant/breached tickets spread over ~60 days.

## Explicitly NOT built in this MVP

- **Automation Studio (visual workflow builder).** The spec's drag-and-drop
  automation canvas is out of scope; assignment rules are configured via a
  simple form instead. No "Automation Studio" nav item exists in the
  shipped app — it is not a placeholder pointing at nothing.
- **Real LLM provider integration.** `server/src/ai/provider.ts` is the
  intended integration point (env-var gated via `AI_PROVIDER` /
  `AI_PROVIDER_API_KEY`), but no actual API call is implemented; it always
  resolves to the deterministic classifier.
- **Frontend automated test suite** (Playwright/Cypress/RTL). Correctness
  was verified via TypeScript strict compilation, a production build, and
  manual smoke testing; no CI UI regression suite exists yet.
- **Duplicate ticket detection**, **optimistic locking for concurrent
  edits**, and **persisted round-robin cursor** (currently in-memory,
  resets on restart) — see the exception-handling matrix in
  `business-rules-and-sla.md` for how each is handled today.

## Phase 2 (near-term)

- Real LLM provider integration behind the existing `ai/provider.ts` seam
  (configurable, with the deterministic engine remaining the zero-cost
  default/fallback).
- Duplicate-ticket detection heuristic (same requester + similar subject
  within a time window) surfaced as a warning at creation time.
- Optimistic locking (a `version` column) on `Ticket` to detect concurrent
  edit conflicts instead of silent last-write-wins.
- Persisted round-robin cursor (on `AssignmentRule` or a dedicated table) so
  fairness survives server restarts and horizontal scaling.
- Frontend E2E test suite (Playwright) covering the four core Gherkin flows
  in `prd-and-user-stories.md`.

## Phase 3 (platform maturity)

- Visual Automation Studio: drag-and-drop condition/action builder that
  compiles down to the same `AssignmentRule` model (and extends it with
  additional trigger types beyond ticket creation).
- Advanced routing: skills-based matching, predictive load balancing,
  working-hours-aware agent availability (not just team membership).
- PostgreSQL migration path: swap the Prisma `datasource` provider,
  reinstate native `enum` types (dropped for SQLite compatibility — see
  `architecture.md` ADR-3), add connection pooling; the Prisma schema and
  migration history make this a mechanical, low-risk change, not a rewrite.
- Customer-facing self-service portal (submit/track tickets directly,
  rather than via internal staff).

## V2 — Product Intelligence feature status

Honest status against the full original "TicketSense V2" master-build spec
(4 flagship USPs + a huge list of supporting detail). Legend:
**Implemented** = real, working, persisted, server-computed. **Interactive
Demo** = genuinely functional end-to-end but deliberately scoped down (e.g.
a formula instead of ML, a template instead of an LLM). **Planned** = not
built in this repository.

### Issue Genome — Implemented
- Jaccard-bigram similarity scoring + greedy union-find clustering, with a
  documented threshold and minimum cluster size (`docs/product-intelligence.md`).
- `ProductIssue` / `IssueTicketLink` (soft-unlink, audit history) /
  `ClusteringRun` models; detect/list/get, manual link/unlink, merge, split,
  confirm-with-required-note, full status state machine, owner assignment.
- Common-symptom extraction, ticket-volume trend, unique-affected-customer
  count (from the new `Customer` model, not guessed from email strings).

### Issue Genome — Interactive Demo (scoped down)
- "AI analysis explanation" on the issue detail page is the plain-language
  similarity formula, explicitly *not* described as ML confidence.
- No embeddings/vector search, no semantic similarity beyond bigram overlap
  — by design, to stay deterministic and dependency-free.

### Fix Impact Simulator — Implemented
- Exact formulas in `impactCalculator.ts`, unit-tested including the
  zero-engineering-cost → `null` ROI case; recompute always re-derives
  server-side from posted inputs.
- Transparent, weighted prioritization score with a visible per-factor
  breakdown (never a single opaque number).
- 3-scenario (Conservative/Expected/Optimistic) comparison, CSV export.

### Fix Impact Simulator — Interactive Demo (scoped down)
- Plain number inputs rather than literal UI sliders (functionally
  equivalent, explicitly allowed by the brief).
- No Monte-Carlo/statistical confidence intervals — scenarios are three
  fixed point-estimates, not a probability distribution.

### Support-to-Roadmap Engine — Implemented
- `WorkItem` / `WorkItemVersion` models with full field set (business
  problem, root cause + `isHypothesis` flag, Gherkin acceptance criteria,
  edge cases, assumptions, open questions, etc.).
- Draft → Under Review → Approved → Backlog → In Progress → Released →
  Verified state machine with Rejected/Needs-Revision branches, enforced
  server-side and unit-tested for invalid transitions.
- Edit history via `WorkItemVersion` snapshots on every PATCH.
- JSON/CSV export shaped like a generic issue-tracker import payload.

### Support-to-Roadmap Engine — Interactive Demo (scoped down)
- "AI BA Assistant" (`server/src/ai/baAssistant.ts`) is a **deterministic,
  rule/template-based generator**, explicitly labeled "AI-drafted — review
  before approving" in the UI. It is not a real LLM call (TicketSense's one
  real AI seam, `server/src/ai/provider.ts`, is unrelated and still unused
  by design — see V1 roadmap above). It only asserts facts it can point to
  in ticket text; otherwise it raises an explicit open question instead of
  inventing a root cause, reproduction step, or quote (unit-tested).
- **Jira/Azure DevOps adapter** = the JSON/CSV export seam only. No real
  third-party API integration exists.

### Resolution Intelligence — Implemented
- `Release` / `ReleaseIssueLink` / `ResolutionMeasurement` models.
- Measurement service queries **real** pre/post ticket counts, unique
  customers, and support hours from stored ticket data in a configurable
  window around the release date; classifies the outcome against fixed,
  documented thresholds (40% / 15% / minimum 3 tickets), unit- and
  integration-tested for Improving and No-Material-Change cases.
- Human "Verify outcome" and "Reopen issue" actions, wired to the
  `ProductIssue` state machine.

### Resolution Intelligence — Interactive Demo (scoped down)
- No normalized-rate-per-exposure metric (would require real usage/traffic
  data this app does not model) — raw counts and a documented reduction %
  are used instead, which the thresholds doc calls out explicitly.
- Before/after chart is a simple grouped bar chart (Recharts), not a
  time-series trend line per day.

### Explicitly Planned (not built anywhere in this repository)
Everything else in the original V2 master-build spec, including but not
limited to: a real LLM-backed BA assistant; a visual Automation Studio;
true ML/embedding-based ticket similarity; a customer-facing self-service
portal; the full 28-document BA artifact set (this repo ships a condensed
~9-document set instead); SSO/multi-tenancy/mobile apps (unchanged from the
V1 roadmap below); a real Jira/Azure DevOps API integration (only the
export-shape seam exists); Monte-Carlo impact forecasting; usage-normalized
resolution metrics; a frontend E2E test suite for the V2 modules (V1's gap
here is also unresolved — see "Explicitly NOT built in this MVP" above).

## Phase 4 (enterprise)

- SSO / enterprise identity (SAML/OIDC) integration, replacing standalone
  JWT login.
- Multi-tenancy (organization-scoped data isolation).
- Native mobile apps (agent and customer).
- SLA policies with pause/resume on customer-waiting states (the schema
  already has an `SLAInstance.pausedMinutes` field reserved for this; it is
  not yet wired into the due-date calculation in this MVP).
