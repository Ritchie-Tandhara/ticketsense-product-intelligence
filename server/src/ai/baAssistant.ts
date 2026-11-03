// "AI BA Assistant" — deterministic, template/rule-based work-item draft
// generator. This is NOT a real LLM call (see server/src/ai/provider.ts for
// the actual AI seam used elsewhere in the app). It only uses evidence that
// is actually present in the issue + its linked tickets' text. Whenever a
// required fact isn't evidenced (e.g. a root cause), it generates an
// explicit open question instead of inventing one. The UI must label this
// output "AI-drafted — review before approving."

import { commonSymptoms, tokenize } from "./similarity";

export interface TicketEvidence {
  id: string;
  ticketNumber: number;
  subject: string;
  description: string;
  requesterName: string;
  priority: string;
}

export interface IssueEvidence {
  title: string;
  productArea: string;
  severity: string;
  tickets: TicketEvidence[];
  uniqueCustomers: number;
}

export interface WorkItemDraft {
  businessProblem: string;
  problemDescription: string;
  customerImpact: string;
  observedSymptoms: string;
  rootCause: string | null;
  rootCauseIsHypothesis: boolean;
  reproductionSteps: string | null;
  expectedBehavior: string | null;
  actualBehavior: string | null;
  proposedSolution: string | null;
  userStory: string;
  acceptanceCriteria: string;
  edgeCases: string;
  assumptions: string;
  openQuestions: string;
}

// Keyword cues the generator is allowed to point to as "evidence" — it never
// invents a mechanism that isn't textually present.
const ROOT_CAUSE_CUES = [
  { cue: "timeout", label: "a timeout in a downstream dependency" },
  { cue: "timed out", label: "a timeout in a downstream dependency" },
  { cue: "sms gateway", label: "an upstream SMS/OTP gateway failure" },
  { cue: "gateway", label: "an upstream gateway failure" },
  { cue: "duplicate", label: "a deduplication / idempotency gap" },
  { cue: "race condition", label: "a race condition" },
  { cue: "null", label: "an unhandled null/empty value" },
  { cue: "500 error", label: "an unhandled server error (HTTP 500)" },
  { cue: "rate limit", label: "a rate-limiting misconfiguration" },
  { cue: "cache", label: "stale/invalid cache data" },
  { cue: "expired token", label: "token/session expiry handled incorrectly" },
  { cue: "webhook", label: "a webhook delivery/retry failure" },
];

function findRootCauseHypothesis(texts: string[]): string | null {
  const joined = texts.join(" ").toLowerCase();
  for (const { cue, label } of ROOT_CAUSE_CUES) {
    if (joined.includes(cue)) return label;
  }
  return null;
}

function extractReproductionCue(texts: string[]): string | null {
  const joined = texts.join(" ").toLowerCase();
  const actionCues = ["when i", "every time i", "after i", "each time"];
  for (const t of texts) {
    const lower = t.toLowerCase();
    for (const cue of actionCues) {
      const idx = lower.indexOf(cue);
      if (idx >= 0) {
        return t.slice(idx, idx + 160).trim();
      }
    }
  }
  return joined.length > 0 ? null : null;
}

export function generateWorkItemDraft(issue: IssueEvidence): WorkItemDraft {
  const texts = issue.tickets.map((t) => `${t.subject}. ${t.description}`);
  const symptoms = commonSymptoms(texts, 8);
  const sampleCustomers = [...new Set(issue.tickets.map((t) => t.requesterName))].slice(0, 3);
  const criticalOrHighCount = issue.tickets.filter((t) => t.priority === "HIGH" || t.priority === "CRITICAL").length;

  const businessProblem = `${issue.tickets.length} support tickets in the "${issue.productArea}" area describe the same recurring problem ("${issue.title}"), affecting ${issue.uniqueCustomers} distinct customer(s)${
    criticalOrHighCount > 0 ? ` (${criticalOrHighCount} flagged HIGH/CRITICAL priority)` : ""
  }. This is a recurring pattern, not an isolated incident, so a point fix for a single ticket will not prevent recurrence.`;

  const problemDescription =
    symptoms.length > 0
      ? `Across linked tickets, customers consistently report: ${symptoms.join(", ")}. Representative subjects: ${issue.tickets
          .slice(0, 3)
          .map((t) => `#${t.ticketNumber} "${t.subject}"`)
          .join("; ")}.`
      : `Linked tickets reference the "${issue.title}" theme, but no single dominant symptom phrase could be extracted automatically from the ticket text. Manual review of the linked tickets is recommended before finalizing scope.`;

  const customerImpact = `${issue.uniqueCustomers} unique customer(s) affected across ${issue.tickets.length} ticket(s)${
    sampleCustomers.length > 0 ? ` (e.g. ${sampleCustomers.join(", ")})` : ""
  }. ${criticalOrHighCount > 0 ? `${criticalOrHighCount} ticket(s) were classified HIGH or CRITICAL priority.` : "No tickets in this cluster were classified above MEDIUM priority."}`;

  const observedSymptoms = symptoms.length > 0 ? symptoms.join(", ") : "No consistent symptom keywords found in common across linked tickets — review manually.";

  const rootCauseHypothesis = findRootCauseHypothesis(texts);
  const rootCause = rootCauseHypothesis;
  const rootCauseIsHypothesis = true; // the generator NEVER asserts a confirmed root cause, only a hypothesis

  const reproCue = extractReproductionCue(texts);
  const reproductionSteps = reproCue ? `Derived from ticket text: "${reproCue}". Engineering should confirm exact repro steps.` : null;

  const expectedBehavior = `The action described in the linked tickets should complete successfully without the reported symptom (${observedSymptoms.split(",")[0]?.trim() || "the reported failure"}).`;
  const actualBehavior = symptoms.length > 0 ? `Customers instead experience: ${symptoms.slice(0, 3).join(", ")}.` : null;

  const proposedSolution = rootCauseHypothesis
    ? `Investigate and address ${rootCauseHypothesis}, since it is the most textually-supported hypothesis across the linked tickets. Confirm with engineering before committing to a fix approach.`
    : null;

  const userStory = `As a customer experiencing "${issue.title.toLowerCase()}", I want this issue resolved so that I can complete my task without repeated support tickets.`;

  const acceptanceCriteria = [
    `Scenario: Customer no longer experiences the reported symptom`,
    `  Given a customer performs the action described in issue "${issue.title}"`,
    `  When the fix for this issue has been deployed`,
    `  Then the customer should not experience: ${observedSymptoms}`,
    `  And no new support ticket matching this cluster's similarity signature should be created for this customer within the monitoring window`,
    ``,
    `Scenario: Existing affected customers are made whole`,
    `  Given a customer was affected by one of the ${issue.tickets.length} linked tickets`,
    `  When support follow-up is performed after the fix ships`,
    `  Then the customer's ticket should be eligible for closure confirmation`,
  ].join("\n");

  const edgeCases = [
    "Confirm behavior for customers on the ENTERPRISE tier with custom configuration, if applicable.",
    "Confirm whether this issue reproduces for new customers (post-signup) as well as existing ones.",
    rootCauseHypothesis ? `Confirm whether ${rootCauseHypothesis} affects other product areas beyond "${issue.productArea}".` : "Root cause is unconfirmed — edge cases cannot be fully enumerated until it is identified.",
  ].join(" ");

  const openQuestions: string[] = [];
  if (!rootCauseHypothesis) {
    openQuestions.push("Root cause is not evidenced in the linked ticket text — engineering investigation is required before this can move past Draft.");
  }
  if (symptoms.length === 0) {
    openQuestions.push("No consistent symptom could be extracted automatically; confirm the common thread across linked tickets manually.");
  }
  if (issue.uniqueCustomers < 2) {
    openQuestions.push("Only one unique customer is represented in this cluster so far — confirm this is genuinely a recurring, multi-customer problem before prioritizing.");
  }
  if (openQuestions.length === 0) {
    openQuestions.push("None identified from available evidence — re-review if new tickets are linked to this issue.");
  }

  const assumptions = `Drafted automatically from ${issue.tickets.length} linked ticket(s) as of now. Assumes ticket text accurately reflects the customer-reported symptom. Does not assume a confirmed root cause (see rootCauseIsHypothesis).`;

  return {
    businessProblem,
    problemDescription,
    customerImpact,
    observedSymptoms,
    rootCause,
    rootCauseIsHypothesis,
    reproductionSteps,
    expectedBehavior,
    actualBehavior,
    proposedSolution,
    userStory,
    acceptanceCriteria,
    edgeCases,
    assumptions,
    openQuestions: openQuestions.join(" "),
  };
}

export { tokenize };
