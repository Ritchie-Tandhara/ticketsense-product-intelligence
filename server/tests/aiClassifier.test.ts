import { describe, it, expect } from "vitest";
import { classifyTicket } from "../src/ai/deterministicClassifier";

describe("Deterministic AI classifier", () => {
  it("returns a confidence score and human-readable reasoning for a clear-cut ticket", () => {
    const result = classifyTicket(
      "Production crash - system broken",
      "Our entire team is blocked, the system keeps crashing with an error in production. This is a critical emergency affecting all users and revenue."
    );
    expect(result.category).toBe("Technical");
    expect(result.priority).toBe("CRITICAL");
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(result.reasoning.length).toBeGreaterThan(10);
  });

  it("combines urgency/impact keywords and category match, not sentiment alone, for priority", () => {
    // Positive sentiment but mentions urgent + widespread impact -> should still be elevated priority.
    const result = classifyTicket(
      "Thanks but urgent widespread issue",
      "Thank you for everything, but this is urgent and affects all users across the entire company immediately."
    );
    expect(["HIGH", "CRITICAL"]).toContain(result.priority);
  });

  it("flags a low-confidence case when no strong keyword match exists", () => {
    const result = classifyTicket("Hi", "Hello there");
    expect(result.confidence).toBeLessThan(0.6);
    expect(result.reasoning.toLowerCase()).toContain("low");
  });
});
