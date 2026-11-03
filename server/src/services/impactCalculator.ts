// Fix Impact Simulator — pure calculation service.
//
// All formulas are deliberately simple and fully documented (see
// docs/product-intelligence.md "Impact Calculation Formulas"). Server-side
// only: the client never computes these numbers itself, it only displays
// what this function returns, so a user editing inputs client-side cannot
// spoof the math.
//
//   Historical Support Cost = (relatedTicketCount * avgHandlingTimeMinutes / 60) * supportCostPerHour
//   Avoided Tickets         = projectedFutureTicketVolume * (estimatedFixEffectivenessPct / 100)
//   Time Saved (hours)      = avoidedTickets * (avgHandlingTimeMinutes / 60)
//   Cost Savings            = timeSavedHours * supportCostPerHour
//   Net Benefit             = costSavings - engineeringCost
//   ROI %                   = engineeringCost > 0 ? (netBenefit / engineeringCost) * 100 : null
//
// ROI is explicitly null (never a fabricated number, never a divide-by-zero
// crash) when engineeringCost is 0 — the UI must render "N/A" in that case.

export interface ImpactScenarioInputs {
  relatedTicketCount: number;
  uniqueCustomers: number;
  avgHandlingTimeMinutes: number;
  supportCostPerHour: number;
  projectedFutureTicketVolume: number;
  estimatedFixEffectivenessPct: number; // 0-100
  engineeringCost: number;
  customerTier?: string;
}

export interface ImpactScenarioOutputs {
  historicalSupportCost: number;
  historicalSupportHours: number;
  avoidedTickets: number;
  timeSavedHours: number;
  costSavings: number;
  netBenefit: number;
  roiPct: number | null;
}

export function calculateImpact(inputs: ImpactScenarioInputs): ImpactScenarioOutputs {
  const {
    relatedTicketCount,
    avgHandlingTimeMinutes,
    supportCostPerHour,
    projectedFutureTicketVolume,
    estimatedFixEffectivenessPct,
    engineeringCost,
  } = inputs;

  const historicalSupportHours = (relatedTicketCount * avgHandlingTimeMinutes) / 60;
  const historicalSupportCost = historicalSupportHours * supportCostPerHour;

  const avoidedTickets = projectedFutureTicketVolume * (estimatedFixEffectivenessPct / 100);
  const timeSavedHours = avoidedTickets * (avgHandlingTimeMinutes / 60);
  const costSavings = timeSavedHours * supportCostPerHour;

  const netBenefit = costSavings - engineeringCost;
  const roiPct = engineeringCost > 0 ? (netBenefit / engineeringCost) * 100 : null;

  return {
    historicalSupportCost: round2(historicalSupportCost),
    historicalSupportHours: round2(historicalSupportHours),
    avoidedTickets: round2(avoidedTickets),
    timeSavedHours: round2(timeSavedHours),
    costSavings: round2(costSavings),
    netBenefit: round2(netBenefit),
    roiPct: roiPct === null ? null : round2(roiPct),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---- Prioritization score ----
// A transparent, weighted-factor score — not a black-box single number. Each
// factor is normalized to 0-100 before weighting, and the breakdown is always
// returned alongside the total so the UI can show "why" this score exists.

export const PRIORITIZATION_WEIGHTS = {
  customerImpact: 0.25, // unique affected customers (scaled)
  recurrence: 0.2, // related ticket count (scaled)
  supportCost: 0.2, // historical support cost (scaled)
  severity: 0.15, // issue severity (LOW..CRITICAL -> 25/50/75/100)
  strategicRelevance: 0.1, // customer tier weighting (STANDARD/PRO/ENTERPRISE)
  effort: 0.1, // inverse of engineering cost (lower cost = higher score); 0 weight contribution if unknown
} as const;

const SEVERITY_SCORE: Record<string, number> = { LOW: 25, MEDIUM: 50, HIGH: 75, CRITICAL: 100 };
const TIER_SCORE: Record<string, number> = { STANDARD: 30, PRO: 65, ENTERPRISE: 100 };

export interface PrioritizationInputs {
  uniqueCustomers: number;
  relatedTicketCount: number;
  historicalSupportCost: number;
  severity: string;
  dominantCustomerTier?: string;
  engineeringCost?: number;
}

export interface PrioritizationBreakdown {
  factor: string;
  weight: number;
  rawValue: number | string;
  normalizedScore: number; // 0-100
  weightedContribution: number; // normalizedScore * weight
}

export interface PrioritizationResult {
  score: number; // 0-100
  breakdown: PrioritizationBreakdown[];
}

/** Simple saturating scale: value/cap, capped at 100. */
function scaleCap(value: number, cap: number): number {
  if (cap <= 0) return 0;
  return Math.min(100, round2((value / cap) * 100));
}

export function calculatePrioritizationScore(input: PrioritizationInputs): PrioritizationResult {
  const customerImpactScore = scaleCap(input.uniqueCustomers, 25); // 25+ unique customers = max score
  const recurrenceScore = scaleCap(input.relatedTicketCount, 40); // 40+ tickets = max score
  const supportCostScore = scaleCap(input.historicalSupportCost, 20000); // $20k+ historical cost = max score
  const severityScore = SEVERITY_SCORE[input.severity] ?? 50;
  const strategicScore = TIER_SCORE[input.dominantCustomerTier ?? "STANDARD"] ?? 30;
  const effortScore = input.engineeringCost && input.engineeringCost > 0 ? Math.max(0, 100 - scaleCap(input.engineeringCost, 100000)) : 50;

  const breakdown: PrioritizationBreakdown[] = [
    { factor: "Customer impact", weight: PRIORITIZATION_WEIGHTS.customerImpact, rawValue: input.uniqueCustomers, normalizedScore: customerImpactScore, weightedContribution: round2(customerImpactScore * PRIORITIZATION_WEIGHTS.customerImpact) },
    { factor: "Recurrence", weight: PRIORITIZATION_WEIGHTS.recurrence, rawValue: input.relatedTicketCount, normalizedScore: recurrenceScore, weightedContribution: round2(recurrenceScore * PRIORITIZATION_WEIGHTS.recurrence) },
    { factor: "Support cost", weight: PRIORITIZATION_WEIGHTS.supportCost, rawValue: input.historicalSupportCost, normalizedScore: supportCostScore, weightedContribution: round2(supportCostScore * PRIORITIZATION_WEIGHTS.supportCost) },
    { factor: "Severity", weight: PRIORITIZATION_WEIGHTS.severity, rawValue: input.severity, normalizedScore: severityScore, weightedContribution: round2(severityScore * PRIORITIZATION_WEIGHTS.severity) },
    { factor: "Strategic relevance", weight: PRIORITIZATION_WEIGHTS.strategicRelevance, rawValue: input.dominantCustomerTier ?? "STANDARD", normalizedScore: strategicScore, weightedContribution: round2(strategicScore * PRIORITIZATION_WEIGHTS.strategicRelevance) },
    { factor: "Effort (inverse cost)", weight: PRIORITIZATION_WEIGHTS.effort, rawValue: input.engineeringCost ?? "unknown", normalizedScore: effortScore, weightedContribution: round2(effortScore * PRIORITIZATION_WEIGHTS.effort) },
  ];

  const score = round2(breakdown.reduce((s, b) => s + b.weightedContribution, 0));
  return { score, breakdown };
}
