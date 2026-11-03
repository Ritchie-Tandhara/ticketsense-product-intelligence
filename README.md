# TicketSense V2 — AI-Powered Support-to-Product Intelligence Platform

**A support-ops ticketing platform (V1) extended with four product-
intelligence modules (V2).** A portfolio project demonstrating full-stack
engineering + senior-technical-BA rigor on a single, real, buildable
codebase — no mocked data, no fake buttons, and an honest written
breakdown of what's fully built vs. a deliberately scoped demo vs. not
built at all.

V1 answers "how do we run support well" (ticketing, SLAs, assignment,
a deterministic AI classifier, analytics). **V2 answers the harder question
support leaders actually get asked: *what is support telling us about the
product, and what should we do about it?*** It turns recurring tickets into
a traceable pipeline: **detect a recurring problem → quantify the cost of
not fixing it → turn it into an engineering-ready work item → measure
whether the fix actually worked.**

## Business problem & solution

Mid-market support teams triage tickets manually, discover SLA breaches
reactively (usually from an angry customer), and assign work ad hoc. 
TicketSense replaces that with:

- A **deterministic, keyword/rule-based AI classifier** that suggests
  category, subcategory, sentiment, and priority with a confidence score
  and human-readable reasoning — no external API key required, ever.
- A **configurable, ordered assignment engine** (round robin / least-active
  / category-based / priority escalation to senior agents or an escalation
  team).
- A **business-hours-aware SLA clock** with automatic due-date calculation
  and a breach-detection sweep.
- A **real analytics dashboard** computed from stored ticket/SLA data, not
  hardcoded numbers.

See `docs/product-vision-and-brd.md` for the full business case and
personas.

## Target users

Support Agent, Support Manager, Super Admin, Readonly Analyst — see
`docs/product-vision-and-brd.md` §2 for persona detail.

## What's implemented (MVP) vs planned

This is a scoped MVP, not the full enormous original spec. Everything
listed below is real and working end-to-end; anything not listed is
explicitly deferred — see `docs/roadmap.md` for the complete breakdown
(including what was deliberately **not** built, like the visual Automation
Studio and real LLM integration).

**Implemented:**
- Ticket CRUD with an enforced state machine (New → Open → In Progress →
  Pending → Resolved → Closed, plus controlled Reopen) and bulk actions.
- Deterministic AI classification + accept/reject/edit review workflow.
- Rule-based assignment engine with a dry-run preview.
- SLA policies, business-hours-aware due dates, breach detection.
- Dashboard with 11 KPIs and 6 charts, all filterable, all real.
- Knowledge base with keyword-overlap suggested articles.
- Reports (agent productivity, category bottlenecks, SLA compliance) with
  CSV export and drill-down.
- Role-based access control enforced server-side on every protected route.
- Light/dark theme, toasts, confirmation modals, loading/empty/error states.
- **52 passing automated backend tests** (18 original V1 + 34 new V2 tests).

**Implemented — V2 Product Intelligence (see `docs/product-intelligence.md` for formulas and the worked flagship walkthrough):**
- **Issue Genome** — deterministic Jaccard-bigram ticket clustering into
  recurring `ProductIssue`s, with manual link/unlink (audited), merge,
  split, a confirm-with-required-note step, and a full status state
  machine (Detected → ... → Resolved, with Reopened).
- **Fix Impact Simulator** — server-computed cost/benefit (historical
  support cost, avoided tickets, time saved, cost savings, net benefit,
  ROI%), explicitly returning `null`/"N/A" ROI rather than a fake number
  when engineering cost is zero, plus a transparent weighted prioritization
  score with a visible per-factor breakdown.
- **Support-to-Roadmap Engine** — an "AI BA Assistant" (deterministic
  template generator, clearly labeled "AI-drafted — review before
  approving," not a real LLM call) drafts a problem statement, user story,
  Gherkin acceptance criteria, and edge cases from actual linked-ticket
  text, raising an explicit open question instead of inventing a root
  cause when one isn't evidenced. Draft → Approved work-item state machine
  with version history and JSON/CSV export.
- **Resolution Intelligence** — before/after ticket-volume measurement from
  real ticket data around a release date, classified against fixed,
  documented thresholds (≥40% drop = Improving, ±15% = No Material Change),
  with human verify/reopen actions.
- A lightweight `Customer` model (name/email/tier) so "unique affected
  customers" and "customer tier" are real joined data, not guessed from
  free-text requester fields.

**Interactive Demo (V2, functional but deliberately scoped down — not oversold):** the AI BA Assistant is rule-based, not an LLM; the Jira/Azure
DevOps "integration" is the export-shape seam only, no real third-party API
call; prioritization/impact scenarios are fixed point-estimates, not a
statistical forecast. Full honest Implemented/Interactive-Demo/Planned
labeling for every item in the original V2 spec is in
`docs/roadmap.md` ("V2 — Product Intelligence feature status").

**Planned (not built here):** real LLM provider integration, visual
automation/workflow builder, advanced ML-based routing, PostgreSQL
migration, SSO, mobile apps, duplicate-ticket detection, optimistic
locking. Full detail in `docs/roadmap.md`.

## Architecture

```mermaid
flowchart LR
    Client[React + Vite + TS<br/>port 5173] -->|"/api proxy"| Server[Express + TS<br/>port 4000]
    Server --> Prisma[Prisma Client]
    Prisma --> DB[(SQLite)]
    Server --> AI[Deterministic AI classifier]
```

Full architecture, ERD, and ADRs (why SQLite+Prisma, why a deterministic
classifier is the default, etc.) in `docs/architecture.md`.

## Tech stack

- **Server:** Node.js, TypeScript, Express, Prisma ORM, SQLite, Zod, JWT (jsonwebtoken), bcryptjs.
- **Client:** React, TypeScript, Vite, Tailwind CSS, lucide-react, Recharts, React Router.
- **Testing:** Vitest + Supertest against an isolated SQLite test database.
- **Monorepo:** npm workspaces (`server`, `client`).

## Install & run

Requires Node.js 18+.

```bash
# from the repo root
npm install              # installs both workspaces
npm run seed              # resets & seeds the SQLite dev database (~178 tickets, incl. V2 clusters)
npm run dev                # runs server (:4000) and client (:5173) together
```

Then open **http://localhost:5173**. The Vite dev server proxies `/api/*`
to the Express server, so you only need to open the client URL.

Other useful root scripts:
```bash
npm run build              # type-checks and builds both server and client
npm run test                # runs the backend test suite (vitest)
npm run migrate            # runs Prisma migrations (server workspace)
```

### Environment variables

Copy `server/.env.example` to `server/.env` (already done in this
checkout) and adjust if needed. Nothing is required to run the app:

| Variable | Required? | Default behavior |
|---|---|---|
| `PORT` | No | `4000` |
| `DATABASE_URL` | No | `file:./dev.db` (SQLite) |
| `JWT_SECRET` | No (but set your own for anything beyond local demo use) | dev default |
| `ORG_TIMEZONE` | No | `Asia/Kolkata` — used for business-hours SLA math |
| `AI_PROVIDER` / `AI_PROVIDER_API_KEY` | No, never | Deterministic classifier is always the working path; these are an unused seam for a future real LLM integration (see `docs/architecture.md` ADR-2) |

### Default login credentials (after `npm run seed`)

Password for every account: `Password123!`

| Role | Email |
|---|---|
| Super Admin | `admin@ticketsense.io` |
| Support Manager | `manager@ticketsense.io` |
| Support Agent | `agent1@ticketsense.io` (through `agent12@ticketsense.io`) |
| Readonly Analyst | `analyst@ticketsense.io` |

## Demo workflow walkthrough

1. **Log in** as `admin@ticketsense.io`.
2. **Overview** — see real KPI cards and charts computed from the ~178
   seeded tickets; try the team/agent/category/priority/date filters.
3. **Tickets → New Ticket** — create a ticket without specifying a
   priority. Open it and see the AI Recommendation panel: suggested
   category/subcategory/priority/sentiment with a confidence score and
   plain-English reasoning. Accept, reject, or edit it.
4. On the same ticket, click **Auto-Assign** to watch the rule-based
   engine pick a team/agent and log the reasoning to the activity
   timeline.
5. Try an invalid status change (e.g. New → Resolved) — it's rejected
   with the actual allowed next statuses. Walk it through New → Open →
   In Progress → Resolved → Closed, then **Reopen** it and note in the
   SLA panel that the resolution countdown restarts while the
   first-response due date stays put (the documented reopen rule).
6. **SLA Management** — see the breach list and compliance trend, and
   trigger "Run Breach Detection" manually.
7. **Assignment Rules** — inspect the seeded rules (critical escalation,
   billing → billing ops, technical → tier 2, default round robin), try
   the **Dry Run** preview.
8. **AI Intelligence** — see the acceptance-rate stats across all
   historical AI recommendations.
9. **Reports** — export agent productivity or category bottlenecks to
   CSV; drill into a filtered ticket list from either report.

### V2 — the flagship product-intelligence journey

The fully worked walkthrough with real seeded numbers is in
`docs/product-intelligence.md` §5. Short version, in the running app:

10. **Issue Genome** — open the issue **"OTP delivery failures during
    login"** (13 linked tickets, MONITORING). Read its similarity
    explanation and common-symptom tokens. Click **"Detect emerging
    issues"** on the list page to watch clustering find 5 more *unlinked*
    recurring themes live (dashboard load errors, incorrect invoicing, API
    auth errors, subscription upgrade failures, duplicate customer records).
11. **Fix Impact Simulator** — from that issue, open the simulator and see
    three real pre-computed scenarios (Conservative ROI -42.7%, Expected
    +43.2%, Optimistic +175%) — edit any input and watch the numbers
    recalculate server-side, live.
12. **Product Roadmap** — open the linked, AI-BA-Assistant-drafted work
    item **"Fix: OTP delivery failures during login"** (status Approved).
    Note its `openQuestions` honestly flags that root cause isn't evidenced
    in the ticket text, rather than inventing one.
13. **Resolution Intelligence** — open release **"OTP Reliability Fix
    v2.3.0"**; its linked issue shows a computed measurement: 10 tickets
    pre-release vs. 3 post-release (a real 70% drop), classified
    **Improving**. Click **Verify outcome** to resolve the issue, or (on a
    different, worse-outcome measurement) **Reopen issue** to see that
    branch.

## Key business rules

- **State machine:** New → Open → In Progress → Pending → Resolved →
  Closed, with Reopen only from Resolved/Closed back to Open. Enforced
  server-side; invalid transitions return HTTP 400.
- **Reopen & SLA:** reopening resets the *resolution* due date (recomputed
  from "now") but leaves the *first-response* due date untouched, since the
  customer already got an initial response in the original lifecycle.
  Full detail in `docs/business-rules-and-sla.md`.
- **Assignment:** rules are evaluated in order; the first matching
  non-default rule wins, with a mandatory default fallback. Overloaded or
  inactive agents are excluded from every strategy.
- **AI confidence:** below 0.6, the classifier's reasoning text explicitly
  flags the suggestion for manual review rather than silently applying it.

## BA contributions summary

This project's business-analysis artifacts (all in `/docs`) include: a
BRD with personas and an explicit in/out-of-scope boundary
(`product-vision-and-brd.md`); a PRD with Gherkin-style acceptance criteria
for the four core flows (`prd-and-user-stories.md`); a documented state
machine, SLA calculation rules, and an exception-handling matrix covering
8 real failure modes (`business-rules-and-sla.md`); a requirements
traceability matrix mapping every listed test scenario to its requirement
and KPI formulas with exact denominators (`test-plan-and-traceability.md`);
a V2 product-intelligence spec covering the extended ERD, the similarity/
impact/resolution-threshold formulas, and a worked end-to-end flagship
journey with real seeded numbers (`product-intelligence.md`); and a
roadmap that is explicit about what was *not* built, rather than quietly
omitting it (`roadmap.md`, including an honest per-feature V2
Implemented/Interactive-Demo/Planned breakdown).

## Screenshots

Not included in this repository — there's no way to capture a live browser
session in the environment this was built in. To generate your own: run
`npm install && npm run seed && npm run dev`, open
`http://localhost:5173`, log in, and capture the Overview, Ticket Detail,
and SLA Management pages (dark mode included via the theme toggle).

## Roadmap

See `docs/roadmap.md` for the full MVP-delivered vs Phase 2/3/4 breakdown.
