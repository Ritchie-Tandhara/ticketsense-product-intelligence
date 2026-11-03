import { describe, it, expect } from "vitest";
import { generateWorkItemDraft } from "../src/ai/baAssistant";

describe("AI BA Assistant draft generator (deterministic, evidence-only)", () => {
  it("raises an explicit open question instead of fabricating a root cause when none is evidenced", () => {
    const draft = generateWorkItemDraft({
      title: "Vague recurring complaint",
      productArea: "General",
      severity: "MEDIUM",
      uniqueCustomers: 3,
      tickets: [
        { id: "t1", ticketNumber: 1, subject: "Something is wrong", description: "This doesn't feel right, please look into it.", requesterName: "Alice", priority: "MEDIUM" },
        { id: "t2", ticketNumber: 2, subject: "Something is wrong", description: "This doesn't feel right either, please check.", requesterName: "Bob", priority: "MEDIUM" },
        { id: "t3", ticketNumber: 3, subject: "Something is wrong", description: "Still doesn't feel right, please investigate.", requesterName: "Carol", priority: "MEDIUM" },
      ],
    });

    expect(draft.rootCause).toBeNull();
    expect(draft.rootCauseIsHypothesis).toBe(true);
    expect(draft.openQuestions.toLowerCase()).toContain("root cause");
  });

  it("surfaces a textually-grounded root cause hypothesis (never asserted as confirmed) when evidence is present", () => {
    const draft = generateWorkItemDraft({
      title: "Gateway timeout issue",
      productArea: "Technical",
      severity: "HIGH",
      uniqueCustomers: 3,
      tickets: [
        { id: "t1", ticketNumber: 1, subject: "Request fails", description: "We keep seeing a timeout against the SMS gateway when sending codes.", requesterName: "Alice", priority: "HIGH" },
        { id: "t2", ticketNumber: 2, subject: "Request fails", description: "Our requests timed out again against the gateway today.", requesterName: "Bob", priority: "HIGH" },
        { id: "t3", ticketNumber: 3, subject: "Request fails", description: "Another timeout from the gateway, please fix.", requesterName: "Carol", priority: "HIGH" },
      ],
    });

    expect(draft.rootCause).not.toBeNull();
    expect(draft.rootCauseIsHypothesis).toBe(true); // always a hypothesis, never asserted as confirmed fact
  });

  it("never invents acceptance criteria text that isn't grounded in the Gherkin template + evidence", () => {
    const draft = generateWorkItemDraft({
      title: "Repeat issue",
      productArea: "Technical",
      severity: "LOW",
      uniqueCustomers: 2,
      tickets: [
        { id: "t1", ticketNumber: 1, subject: "Problem", description: "Login is slow for me.", requesterName: "Alice", priority: "LOW" },
        { id: "t2", ticketNumber: 2, subject: "Problem", description: "Login is slow for me too.", requesterName: "Bob", priority: "LOW" },
      ],
    });
    expect(draft.acceptanceCriteria).toContain("Scenario:");
    expect(draft.acceptanceCriteria).toContain("Given");
    expect(draft.acceptanceCriteria).toContain("When");
    expect(draft.acceptanceCriteria).toContain("Then");
  });
});
