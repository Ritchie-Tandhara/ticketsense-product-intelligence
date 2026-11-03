// Work Item status state machine.
// Draft -> Under Review -> Approved -> Backlog -> In Progress -> Released -> Verified
// Rejected / Needs Revision branch back to Draft from Under Review.

import { WorkItemStatus } from "../types/enums";

const TRANSITIONS: Record<WorkItemStatus, WorkItemStatus[]> = {
  DRAFT: ["UNDER_REVIEW"],
  UNDER_REVIEW: ["APPROVED", "REJECTED", "NEEDS_REVISION"],
  NEEDS_REVISION: ["DRAFT"],
  REJECTED: ["DRAFT"],
  APPROVED: ["BACKLOG"],
  BACKLOG: ["IN_PROGRESS"],
  IN_PROGRESS: ["RELEASED"],
  RELEASED: ["VERIFIED"],
  VERIFIED: [],
};

export function isValidWorkItemTransition(from: WorkItemStatus, to: WorkItemStatus): boolean {
  if (from === to) return false;
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function allowedNextWorkItemStatuses(from: WorkItemStatus): WorkItemStatus[] {
  return TRANSITIONS[from] ?? [];
}
