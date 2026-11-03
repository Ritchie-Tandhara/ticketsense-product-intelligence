import { describe, it, expect } from "vitest";
import { calculateImpact, calculatePrioritizationScore } from "../src/services/impactCalculator";

describe("Fix Impact Simulator calculations", () => {
  it("computes historical cost, avoided tickets, savings and ROI for a normal scenario", () => {
    const result = calculateImpact({
      relatedTicketCount: 20,
      uniqueCustomers: 15,
      avgHandlingTimeMinutes: 30,
      supportCostPerHour: 25,
      projectedFutureTicketVolume: 50,
      estimatedFixEffectivenessPct: 80,
      engineeringCost: 5000,
    });

    // Historical support cost = (20 * 30 / 60) * 25 = 250
    expect(result.historicalSupportCost).toBe(250);
    // Avoided tickets = 50 * 0.8 = 40
    expect(result.avoidedTickets).toBe(40);
    // Time saved = 40 * (30/60) = 20 hours
    expect(result.timeSavedHours).toBe(20);
    // Cost savings = 20 * 25 = 500
    expect(result.costSavings).toBe(500);
    // Net benefit = 500 - 5000 = -4500
    expect(result.netBenefit).toBe(-4500);
    // ROI% = -4500 / 5000 * 100 = -90
    expect(result.roiPct).toBe(-90);
  });

  it("returns null ROI (never a crash, never a fake %) when engineering cost is zero", () => {
    const result = calculateImpact({
      relatedTicketCount: 10,
      uniqueCustomers: 5,
      avgHandlingTimeMinutes: 20,
      supportCostPerHour: 20,
      projectedFutureTicketVolume: 30,
      estimatedFixEffectivenessPct: 60,
      engineeringCost: 0,
    });
    expect(result.roiPct).toBeNull();
    expect(result.netBenefit).toBeGreaterThan(0); // savings still computed correctly
    expect(Number.isFinite(result.costSavings)).toBe(true);
  });

  it("produces a positive ROI when cost savings exceed engineering cost", () => {
    const result = calculateImpact({
      relatedTicketCount: 100,
      uniqueCustomers: 60,
      avgHandlingTimeMinutes: 25,
      supportCostPerHour: 22,
      projectedFutureTicketVolume: 300,
      estimatedFixEffectivenessPct: 90,
      engineeringCost: 1000,
    });
    expect(result.roiPct).not.toBeNull();
    expect(result.roiPct as number).toBeGreaterThan(0);
  });

  it("prioritization score returns a transparent per-factor breakdown that sums to the total", () => {
    const { score, breakdown } = calculatePrioritizationScore({
      uniqueCustomers: 10,
      relatedTicketCount: 15,
      historicalSupportCost: 4000,
      severity: "HIGH",
      dominantCustomerTier: "ENTERPRISE",
      engineeringCost: 5000,
    });
    const sumOfContributions = breakdown.reduce((s, b) => s + b.weightedContribution, 0);
    expect(Math.round(sumOfContributions * 100) / 100).toBe(score);
    expect(breakdown.length).toBe(6);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});
