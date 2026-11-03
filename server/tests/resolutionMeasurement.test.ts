import { describe, it, expect } from "vitest";
import { classifyOutcome, OUTCOME_THRESHOLDS } from "../src/services/resolutionMeasurementService";

describe("Resolution outcome classification (documented fixed thresholds)", () => {
  it("classifies a >=40% ticket-volume reduction as Improving", () => {
    expect(classifyOutcome(10, 3)).toBe("IMPROVING"); // -70%
    expect(classifyOutcome(10, 6)).toBe("IMPROVING"); // -40% exactly, threshold is inclusive
  });

  it("classifies a change within +/-15% as No Material Change", () => {
    expect(classifyOutcome(20, 20)).toBe("NO_MATERIAL_CHANGE"); // 0%
    expect(classifyOutcome(20, 22)).toBe("NO_MATERIAL_CHANGE"); // +10%
    expect(classifyOutcome(20, 18)).toBe("NO_MATERIAL_CHANGE"); // -10%
  });

  it("classifies an increase beyond the no-change band as Worsening", () => {
    expect(classifyOutcome(20, 30)).toBe("WORSENING"); // +50%
  });

  it("classifies as Insufficient Data when either window has too few tickets", () => {
    expect(classifyOutcome(1, 1)).toBe("INSUFFICIENT_DATA");
    expect(classifyOutcome(5, 2)).toBe("INSUFFICIENT_DATA");
  });

  it("treats a drop to zero post-release tickets (with real pre-volume) as Improving, not insufficient data", () => {
    expect(classifyOutcome(10, 0)).toBe("IMPROVING");
  });

  it("documents the exact threshold constants used", () => {
    expect(OUTCOME_THRESHOLDS.improvingReductionPct).toBe(40);
    expect(OUTCOME_THRESHOLDS.noChangeBandPct).toBe(15);
    expect(OUTCOME_THRESHOLDS.minTicketsPerWindow).toBe(3);
  });
});
