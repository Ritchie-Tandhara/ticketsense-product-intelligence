# TicketSense — Product Vision & Business Requirements

## 1. Business Problem

Mid-market B2B SaaS and IT-services companies handle customer/employee support
through a mix of email, spreadsheets, and under-configured helpdesk tools.
This creates three recurring business problems:

1. **Inconsistent triage.** Tickets are categorized and prioritized manually,
   by whichever agent happens to read them first, leading to inconsistent
   SLA treatment and misrouted critical issues.
2. **No visibility into SLA risk until it's too late.** Without an automated
   due-date clock and breach detection, managers find out about an SLA miss
   from an angry customer, not from their dashboard.
3. **Assignment is ad hoc.** Tickets pile up on whichever agent is most
   responsive, while others are under-loaded; critical issues don't reliably
   reach a senior responder.

TicketSense addresses this with a ticketing platform that pairs a
transparent, auditable **rule-based AI classifier** with a **configurable
assignment engine** and a **business-hours-aware SLA clock**, so triage,
routing, and escalation happen consistently and automatically — without
requiring a black-box ML service or ongoing LLM API spend.

## 2. Target Users / Personas

| Persona | Goals | Pain today |
|---|---|---|
| **Support Agent** (e.g. Aarav) | Resolve tickets quickly, know what's assigned to them, trust the SLA countdown | Manually guesses priority/category; no visibility into due dates |
| **Support Manager** (e.g. Manoj) | Balance team load, catch SLA breaches early, tune routing rules | No dashboard; finds breaches reactively |
| **Super Admin** (e.g. Asha) | Configure teams, SLA policies, assignment rules, users | Manual spreadsheet-based configuration |
| **Readonly Analyst** (e.g. Reena) | Pull reports on agent productivity, SLA compliance, category trends | No reporting tooling; relies on exports from agents |

## 3. Business Case

- Reduce average first-response and resolution time by giving agents an
  AI-suggested category/priority/sentiment at ticket creation, removing the
  "what is this and how urgent is it" step.
- Reduce SLA breaches via automatic due-date computation (business-hours
  aware) and a breach-detection sweep that surfaces at-risk tickets before
  they lapse.
- Improve routing fairness and speed via a rule-driven assignment engine
  (round robin / least-active / category-based / priority escalation),
  configurable without a code change.
- Provide managers and analysts with real, derived KPIs (not vanity metrics)
  to run team reviews and justify staffing/process changes.

## 4. Scope: In vs Out (MVP)

### In scope (implemented, see `roadmap.md` for exact status)
- Ticket lifecycle management with an enforced state machine and reopen flow.
- Deterministic, keyword/rule-based AI classification (category, subcategory,
  sentiment, priority, confidence, reasoning) with accept/reject/edit review.
- Configurable, ordered assignment rules with four working strategies.
- SLA policies per priority, business-hours-aware due-date calculation,
  breach detection.
- Dashboard analytics computed from real stored data (no mocked numbers).
- Knowledge base with keyword-overlap article suggestions.
- Role-based access control (4 roles) enforced server-side.
- Reports with CSV export and drill-down to filtered ticket lists.

### Out of scope for this MVP (see `roadmap.md`)
- Real LLM-provider integration (a seam exists; not called by default).
- Visual drag-and-drop automation/workflow builder ("Automation Studio").
- Advanced ML-based routing (skills-based matching, load prediction).
- PostgreSQL / multi-tenant production deployment.
- SSO / enterprise identity integration.
- Native mobile apps.
- Customer-facing self-service portal (tickets are created by internal
  staff on the customer's behalf in this MVP, consistent with an internal
  ITSM/support-desk tool).
