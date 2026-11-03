// Enum-like string literal unions. SQLite's Prisma connector has no native
// enum support, so these are the single source of truth for valid values,
// enforced at the application layer by Zod schemas in the route files.

export const ROLES = ["SUPER_ADMIN", "SUPPORT_MANAGER", "SUPPORT_AGENT", "READONLY_ANALYST"] as const;
export type Role = (typeof ROLES)[number];

export const TICKET_STATUSES = ["NEW", "OPEN", "IN_PROGRESS", "PENDING", "RESOLVED", "CLOSED"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const SENTIMENTS = ["POSITIVE", "NEUTRAL", "NEGATIVE", "FRUSTRATED"] as const;
export type Sentiment = (typeof SENTIMENTS)[number];

export const MESSAGE_TYPES = ["CUSTOMER_REPLY", "AGENT_REPLY", "INTERNAL_NOTE"] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

export const RECOMMENDATION_STATUSES = ["PENDING", "ACCEPTED", "REJECTED", "EDITED"] as const;
export type RecommendationStatus = (typeof RECOMMENDATION_STATUSES)[number];

export const ASSIGNMENT_STRATEGIES = ["ROUND_ROBIN", "LEAST_ACTIVE", "CATEGORY_BASED", "PRIORITY_ESCALATION"] as const;
export type AssignmentStrategy = (typeof ASSIGNMENT_STRATEGIES)[number];

// ---- V2: Product Intelligence enums ----

export const CUSTOMER_TIERS = ["STANDARD", "PRO", "ENTERPRISE"] as const;
export type CustomerTier = (typeof CUSTOMER_TIERS)[number];

export const ISSUE_STATUSES = [
  "DETECTED",
  "UNDER_REVIEW",
  "CONFIRMED",
  "PLANNED",
  "IN_DEVELOPMENT",
  "RELEASED",
  "MONITORING",
  "RESOLVED",
  "REOPENED",
] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

export const ISSUE_SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type IssueSeverity = (typeof ISSUE_SEVERITIES)[number];

export const SCENARIO_TYPES = ["CONSERVATIVE", "EXPECTED", "OPTIMISTIC"] as const;
export type ScenarioType = (typeof SCENARIO_TYPES)[number];

export const WORK_ITEM_STATUSES = [
  "DRAFT",
  "UNDER_REVIEW",
  "APPROVED",
  "BACKLOG",
  "IN_PROGRESS",
  "RELEASED",
  "VERIFIED",
  "REJECTED",
  "NEEDS_REVISION",
] as const;
export type WorkItemStatus = (typeof WORK_ITEM_STATUSES)[number];

export const OUTCOME_CLASSIFICATIONS = ["IMPROVING", "NO_MATERIAL_CHANGE", "WORSENING", "INSUFFICIENT_DATA"] as const;
export type OutcomeClassification = (typeof OUTCOME_CLASSIFICATIONS)[number];
