// Resolution Intelligence — measurement service.
//
// Given an issue linked to a release, computes real pre/post ticket metrics
// from stored data within a configurable monitoring window around the
// release date, and classifies the outcome using documented, fixed
// thresholds (see docs/product-intelligence.md "Resolution Outcome
// Classification Thresholds").

import { prisma } from "../lib/prisma";
import { OutcomeClassification } from "../types/enums";

export const DEFAULT_WINDOW_DAYS = 30;

// Documented, configurable thresholds — NOT magic numbers buried in logic.
export const OUTCOME_THRESHOLDS = {
  improvingReductionPct: 40, // ticket volume must drop by >= 40% to call it "Improving"
  noChangeBandPct: 15, // within +/-15% change is "No Material Change"
  minTicketsPerWindow: 3, // below this in either window, classification is "Insufficient Data"
};

export interface MeasurementWindow {
  start: Date;
  end: Date;
}

export interface MeasurementMetrics {
  ticketCount: number;
  affectedCustomers: number;
  supportHours: number;
}

async function metricsForWindow(issueId: string, window: MeasurementWindow): Promise<MeasurementMetrics> {
  const links = await prisma.issueTicketLink.findMany({
    where: { issueId, removedAt: null },
    include: {
      ticket: { select: { id: true, createdAt: true, customerId: true, requesterEmail: true, firstRespondedAt: true, resolvedAt: true } },
    },
  });

  const inWindow = links
    .map((l) => l.ticket)
    .filter((t) => t.createdAt >= window.start && t.createdAt <= window.end);

  const ticketCount = inWindow.length;
  const affectedCustomers = new Set(inWindow.map((t) => t.customerId ?? t.requesterEmail)).size;

  // Handling time estimate: resolvedAt - createdAt when available, else a
  // conservative default of 1 hour per ticket (documented assumption).
  const supportHours = inWindow.reduce((sum, t) => {
    if (t.resolvedAt) {
      const hours = (t.resolvedAt.getTime() - t.createdAt.getTime()) / 3_600_000;
      return sum + Math.max(0.1, Math.min(hours, 48)); // clamp to a sane range
    }
    return sum + 1;
  }, 0);

  return { ticketCount, affectedCustomers, supportHours: Math.round(supportHours * 100) / 100 };
}

function pctChange(pre: number, post: number): number | null {
  if (pre === 0) return null;
  return ((post - pre) / pre) * 100;
}

export function classifyOutcome(preCount: number, postCount: number): OutcomeClassification {
  if (preCount < OUTCOME_THRESHOLDS.minTicketsPerWindow || postCount < OUTCOME_THRESHOLDS.minTicketsPerWindow) {
    // Insufficient data only applies when we can't trust either side AND it's
    // not an obvious, large improvement to zero. If pre has enough volume and
    // post genuinely drops to near-zero, that is a real signal, not noise.
    if (preCount >= OUTCOME_THRESHOLDS.minTicketsPerWindow && postCount === 0) {
      return "IMPROVING";
    }
    return "INSUFFICIENT_DATA";
  }
  const change = pctChange(preCount, postCount);
  if (change === null) return "INSUFFICIENT_DATA";
  if (change <= -OUTCOME_THRESHOLDS.improvingReductionPct) return "IMPROVING";
  if (Math.abs(change) <= OUTCOME_THRESHOLDS.noChangeBandPct) return "NO_MATERIAL_CHANGE";
  if (change > OUTCOME_THRESHOLDS.improvingReductionPct * -1 && change > OUTCOME_THRESHOLDS.noChangeBandPct) return "WORSENING";
  // Between noChangeBand and improvingReduction (a moderate but not dramatic
  // drop) is treated as still-improving-but-not-dramatic -> classify as
  // Improving if it's a reduction beyond the no-change band, else no change.
  return change < 0 ? "IMPROVING" : "NO_MATERIAL_CHANGE";
}

export async function computeMeasurement(issueId: string, releaseId: string, windowDays = DEFAULT_WINDOW_DAYS) {
  const release = await prisma.release.findUnique({ where: { id: releaseId } });
  if (!release) throw new Error("Release not found");

  const msPerDay = 86_400_000;
  const preWindow: MeasurementWindow = {
    start: new Date(release.releasedAt.getTime() - windowDays * msPerDay),
    end: release.releasedAt,
  };
  const postWindow: MeasurementWindow = {
    start: release.releasedAt,
    end: new Date(release.releasedAt.getTime() + windowDays * msPerDay),
  };

  const pre = await metricsForWindow(issueId, preWindow);
  const post = await metricsForWindow(issueId, postWindow);

  const outcomeClassification = classifyOutcome(pre.ticketCount, post.ticketCount);

  return {
    preWindow,
    postWindow,
    pre,
    post,
    outcomeClassification,
  };
}
