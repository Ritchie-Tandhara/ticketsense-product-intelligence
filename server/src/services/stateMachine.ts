// Ticket status state machine.
// New -> Open -> In Progress -> Pending -> Resolved -> Closed
// Reopen is a controlled transition from Resolved or Closed back to Open.

import { TicketStatus } from "../types/enums";

const TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  NEW: ["OPEN"],
  OPEN: ["IN_PROGRESS", "PENDING", "RESOLVED"],
  IN_PROGRESS: ["PENDING", "RESOLVED", "OPEN"],
  PENDING: ["IN_PROGRESS", "RESOLVED", "OPEN"],
  RESOLVED: ["CLOSED", "OPEN"], // OPEN here represents the "reopen" path
  CLOSED: ["OPEN"], // reopen
};

export function isValidTransition(from: TicketStatus, to: TicketStatus): boolean {
  if (from === to) return false;
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function isReopenTransition(from: TicketStatus, to: TicketStatus): boolean {
  return (from === "RESOLVED" || from === "CLOSED") && to === "OPEN";
}

export function allowedNextStatuses(from: TicketStatus): TicketStatus[] {
  return TRANSITIONS[from] ?? [];
}
