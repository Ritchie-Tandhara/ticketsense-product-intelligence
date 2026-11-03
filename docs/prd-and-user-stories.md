# TicketSense — PRD & User Stories

## 1. Product Requirements Summary

TicketSense is a ticketing platform with four core engines: ticket
lifecycle (state machine), AI classification (deterministic), assignment
(rule-based), and SLA (business-hours clock + breach detection). All data
is real and persisted via Prisma/SQLite; there is no mocked state in the
frontend.

Functional requirements are organized around the four core user flows
below, each with Gherkin acceptance criteria that map directly to the
implemented API endpoints and automated tests in `/server/tests`.

## 2. User Story: Ticket Creation + AI Classification

**As a** support agent logging a new ticket on behalf of a customer,
**I want** the system to suggest a category, priority, and sentiment,
**so that** I don't have to manually triage every ticket from scratch.

```gherkin
Feature: Ticket creation with AI classification

  Scenario: Creating a ticket without an explicit priority triggers classification
    Given I am authenticated as a Support Agent
    When I POST /api/tickets with a subject, description, requester name/email,
      and no "priority" field
    Then the ticket is created with status NEW
    And an AIRecommendation row is created with a suggested category,
      subcategory, sentiment, priority, confidence score, and reasoning
    And the ticket's priority is set to the classifier's suggested priority

  Scenario: Agent reviews and accepts the AI suggestion
    Given a ticket has a PENDING AIRecommendation
    When I POST /api/tickets/:id/ai-recommendations/:recId/review with
      decision "ACCEPTED"
    Then the recommendation status becomes ACCEPTED
    And a TicketEvent of type AI_REVIEW is recorded

  Scenario: Agent edits the AI suggestion
    Given a ticket has a PENDING AIRecommendation
    When I POST a review with decision "EDITED" and an editedValue payload
    Then the recommendation status becomes EDITED
    And the ticket's priority is updated to the edited value, not the
      original suggestion

  Scenario: Low-confidence classification is flagged
    Given a ticket's subject/description have no strong keyword matches
    When the deterministic classifier runs
    Then the confidence score is below 0.6
    And the reasoning text explicitly recommends manual review
```

## 3. User Story: Assignment

**As a** support manager,
**I want** tickets automatically routed to the right team/agent based on
configurable rules,
**so that** load is balanced and nothing sits unassigned.

```gherkin
Feature: Rule-based ticket assignment

  Scenario: Default round-robin assignment
    Given no assignment rule's condition matches the ticket's priority/category
    When POST /api/tickets/:id/auto-assign is called
    Then the default rule (isDefault = true) is used
    And an agent on the default rule's target team is selected via round robin
    And a TicketEvent of type ASSIGNMENT records the rule name and reason

  Scenario: Overloaded agents are excluded
    Given an agent's active (non-resolved/closed) ticket count equals or
      exceeds their maxLoad
    When the assignment engine evaluates candidates for that team
    Then that agent is excluded from selection

  Scenario: Critical ticket escalation
    Given a ticket's priority is CRITICAL and a PRIORITY_ESCALATION rule
      matches it
    When auto-assign runs
    Then a senior agent (isSeniorAgent = true) on the rule's target team is
      preferred
    And if no senior agent is available, the ticket is routed to the team
      flagged isEscalation = true
```

## 4. User Story: SLA Breach Escalation

**As a** support manager,
**I want** SLA due dates computed automatically and breaches flagged,
**so that** I can intervene before — or immediately after — a miss.

```gherkin
Feature: SLA due-date calculation and breach detection

  Scenario: Business-hours SLA due date calculation
    Given a ticket is created at a timestamp outside business hours
      (before 09:00, after 18:00, or on a weekend, org-local time)
    When its SLAInstance due dates are computed under a business-hours-only
      policy
    Then the due dates are calculated using only Mon-Fri 09:00-18:00
      org-local time, skipping nights and weekends entirely

  Scenario: Breach detection sweep
    Given a ticket is not RESOLVED or CLOSED and "now" is past its
      resolutionDueAt or firstResponseDueAt
    When POST /api/sla/run-breach-detection is called
    Then the SLAInstance's corresponding breached flag is set to true
    And a TicketEvent of type SLA_BREACH is recorded
```

## 5. User Story: Reopen Flow

**As a** customer whose issue recurs after being marked Resolved,
**I want** my ticket reopened with a fresh resolution clock,
**so that** the team is re-engaged with an accurate due date.

```gherkin
Feature: Reopen a resolved/closed ticket

  Scenario: Reopening resets the resolution SLA clock only
    Given a ticket is RESOLVED or CLOSED with an existing SLAInstance
    When POST /api/tickets/:id/status is called with status "OPEN"
    Then the transition is accepted (reopen is an explicitly allowed path)
    And the ticket's reopenCount is incremented
    And the SLAInstance's resolutionDueAt is recomputed from "now" using the
      same policy's resolution target
    And the SLAInstance's firstResponseDueAt is left unchanged
    And resolutionBreached is reset to false

  Scenario: Reopening from a non-terminal status is rejected
    Given a ticket's status is OPEN, IN_PROGRESS, or PENDING
    When a client attempts to transition it to OPEN again
    Then the request is rejected with 400, since OPEN is not reachable from
      itself and reopen is only defined from RESOLVED/CLOSED
```

## 6. Non-functional requirements

- All protected routes require a valid JWT; role checks are enforced
  server-side (not just hidden in the UI) — see `middleware/auth.ts`.
- All list endpoints return a pagination envelope `{ data, pagination }`.
- All write endpoints validate request bodies with Zod and return a
  consistent `{ error: { code, message, details } }` shape on failure.
- The app must function with zero external API keys (deterministic AI
  fallback is the default, not a degraded mode).
