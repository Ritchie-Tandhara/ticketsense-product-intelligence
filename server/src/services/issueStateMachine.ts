// Product Issue status state machine.
// Detected -> Under Review -> Confirmed -> Planned -> In Development -> Released -> Monitoring -> Resolved
// Reopened is a controlled transition from Resolved or Monitoring back into the flow.

import { IssueStatus } from "../types/enums";

const TRANSITIONS: Record<IssueStatus, IssueStatus[]> = {
  DETECTED: ["UNDER_REVIEW"],
  UNDER_REVIEW: ["CONFIRMED", "DETECTED"],
  CONFIRMED: ["PLANNED"],
  PLANNED: ["IN_DEVELOPMENT"],
  IN_DEVELOPMENT: ["RELEASED"],
  RELEASED: ["MONITORING"],
  MONITORING: ["RESOLVED", "REOPENED"],
  RESOLVED: ["REOPENED"],
  REOPENED: ["UNDER_REVIEW", "CONFIRMED"],
};

export function isValidIssueTransition(from: IssueStatus, to: IssueStatus): boolean {
  if (from === to) return false;
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function allowedNextIssueStatuses(from: IssueStatus): IssueStatus[] {
  return TRANSITIONS[from] ?? [];
}
