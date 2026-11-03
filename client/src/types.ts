export type Role = "SUPER_ADMIN" | "SUPPORT_MANAGER" | "SUPPORT_AGENT" | "READONLY_ANALYST";
export type TicketStatus = "NEW" | "OPEN" | "IN_PROGRESS" | "PENDING" | "RESOLVED" | "CLOSED";
export type TicketPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type Sentiment = "POSITIVE" | "NEUTRAL" | "NEGATIVE" | "FRUSTRATED";
export type MessageType = "CUSTOMER_REPLY" | "AGENT_REPLY" | "INTERNAL_NOTE";
export type RecommendationStatus = "PENDING" | "ACCEPTED" | "REJECTED" | "EDITED";
export type AssignmentStrategy = "ROUND_ROBIN" | "LEAST_ACTIVE" | "CATEGORY_BASED" | "PRIORITY_ESCALATION";

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  teamId?: string | null;
}

export interface Team {
  id: string;
  name: string;
  description?: string | null;
  isEscalation: boolean;
  members?: User[];
}

export interface Category {
  id: string;
  name: string;
  description?: string | null;
}

export interface SLAInstance {
  id: string;
  firstResponseDueAt: string;
  resolutionDueAt: string;
  firstResponseBreached: boolean;
  resolutionBreached: boolean;
  firstResponseMetAt?: string | null;
  resolvedMetAt?: string | null;
}

export interface Ticket {
  id: string;
  ticketNumber: number;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  sentiment?: Sentiment | null;
  requesterName: string;
  requesterEmail: string;
  categoryId?: string | null;
  category?: Category | null;
  teamId?: string | null;
  team?: Team | null;
  assignedAgentId?: string | null;
  assignedAgent?: User | null;
  reopenCount: number;
  firstRespondedAt?: string | null;
  resolvedAt?: string | null;
  closedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  slaInstance?: SLAInstance | null;
  allowedNextStatuses?: TicketStatus[];
  messages?: TicketMessage[];
  events?: TicketEvent[];
  recommendations?: AIRecommendation[];
}

export interface TicketMessage {
  id: string;
  ticketId: string;
  authorId?: string | null;
  author?: User | null;
  type: MessageType;
  body: string;
  createdAt: string;
}

export interface TicketEvent {
  id: string;
  ticketId: string;
  actorId?: string | null;
  actor?: User | null;
  type: string;
  message: string;
  createdAt: string;
}

export interface AIRecommendation {
  id: string;
  ticketId: string;
  ticket?: Ticket;
  suggestedCategory?: string | null;
  suggestedSubcategory?: string | null;
  suggestedPriority?: TicketPriority | null;
  suggestedSentiment?: Sentiment | null;
  confidence: number;
  reasoning: string;
  status: RecommendationStatus;
  reviewedBy?: User | null;
  createdAt: string;
  reviewedAt?: string | null;
}

export interface AssignmentRule {
  id: string;
  name: string;
  order: number;
  isActive: boolean;
  isDefault: boolean;
  conditionPriority?: TicketPriority | null;
  conditionCategoryId?: string | null;
  conditionCategory?: Category | null;
  strategy: AssignmentStrategy;
  targetTeamId?: string | null;
  targetTeam?: Team | null;
}

export interface SLAPolicy {
  id: string;
  name: string;
  priority: TicketPriority;
  firstResponseTargetMin: number;
  resolutionTargetMin: number;
  businessHoursOnly: boolean;
}

export interface KnowledgeArticle {
  id: string;
  title: string;
  body: string;
  tags: string;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface KpiResponse {
  total: number;
  open: number;
  resolved: number;
  closed: number;
  pending: number;
  unassigned: number;
  critical: number;
  slaAtRisk: number;
  slaBreached: number;
  avgFirstResponseMin: number;
  avgResolutionMin: number;
  fcrRate: number;
}

// ---- V2: Product Intelligence types ----

export type IssueStatus = "DETECTED" | "UNDER_REVIEW" | "CONFIRMED" | "PLANNED" | "IN_DEVELOPMENT" | "RELEASED" | "MONITORING" | "RESOLVED" | "REOPENED";
export type IssueSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type ScenarioType = "CONSERVATIVE" | "EXPECTED" | "OPTIMISTIC";
export type WorkItemStatus = "DRAFT" | "UNDER_REVIEW" | "APPROVED" | "BACKLOG" | "IN_PROGRESS" | "RELEASED" | "VERIFIED" | "REJECTED" | "NEEDS_REVISION";
export type OutcomeClassification = "IMPROVING" | "NO_MATERIAL_CHANGE" | "WORSENING" | "INSUFFICIENT_DATA";

export interface Customer {
  id: string;
  name: string;
  email: string;
  tier: "STANDARD" | "PRO" | "ENTERPRISE";
}

export interface ProductIssue {
  id: string;
  title: string;
  description: string;
  productArea: string;
  status: IssueStatus;
  severity: IssueSeverity;
  ownerId?: string | null;
  owner?: User | null;
  firstSeenAt: string;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
  relatedTicketCount?: number;
  uniqueCustomers?: number;
  allowedNextStatuses?: IssueStatus[];
  commonSymptoms?: string[];
  supportingTickets?: Ticket[];
  linkHistory?: IssueTicketLink[];
  volumeTrend?: { weekStart: string; count: number }[];
  similarityExplanation?: string;
  impactScenarios?: ImpactScenario[];
  workItems?: WorkItem[];
  releaseLinks?: { release: Release }[];
  measurements?: ResolutionMeasurement[];
}

export interface IssueTicketLink {
  id: string;
  issueId: string;
  ticketId: string;
  ticket?: Ticket & { customer?: Customer | null };
  addedAt: string;
  addedBy?: string | null;
  manual: boolean;
  removedAt?: string | null;
  removedBy?: string | null;
}

export interface ImpactScenarioInputs {
  relatedTicketCount: number;
  uniqueCustomers: number;
  avgHandlingTimeMinutes: number;
  supportCostPerHour: number;
  projectedFutureTicketVolume: number;
  estimatedFixEffectivenessPct: number;
  engineeringCost: number;
  customerTier?: string;
}

export interface PrioritizationBreakdown {
  factor: string;
  weight: number;
  rawValue: number | string;
  normalizedScore: number;
  weightedContribution: number;
}

export interface ImpactScenarioOutputs {
  historicalSupportCost: number;
  historicalSupportHours: number;
  avoidedTickets: number;
  timeSavedHours: number;
  costSavings: number;
  netBenefit: number;
  roiPct: number | null;
  prioritization: { score: number; breakdown: PrioritizationBreakdown[] };
}

export interface ImpactScenario {
  id: string;
  issueId: string;
  name: string;
  scenarioType: ScenarioType;
  inputs: ImpactScenarioInputs;
  outputs: ImpactScenarioOutputs;
  createdBy?: User | null;
  createdAt: string;
}

export interface WorkItem {
  id: string;
  issueId: string;
  issue?: ProductIssue;
  title: string;
  businessProblem: string;
  productArea: string;
  problemDescription: string;
  customerImpact: string;
  observedSymptoms: string;
  rootCause?: string | null;
  rootCauseIsHypothesis: boolean;
  reproductionSteps?: string | null;
  expectedBehavior?: string | null;
  actualBehavior?: string | null;
  proposedSolution?: string | null;
  userStory: string;
  acceptanceCriteria: string;
  edgeCases?: string | null;
  dependencies?: string | null;
  priorityRecommendation?: string | null;
  impactScenarioId?: string | null;
  impactScenario?: ImpactScenario | null;
  assumptions?: string | null;
  openQuestions?: string | null;
  status: WorkItemStatus;
  ownerId?: string | null;
  owner?: User | null;
  createdAt: string;
  updatedAt: string;
  allowedNextStatuses?: WorkItemStatus[];
  versions?: WorkItemVersion[];
  aiGenerated?: boolean;
  aiDisclaimer?: string;
}

export interface WorkItemVersion {
  id: string;
  workItemId: string;
  snapshot: string;
  editedBy?: User | null;
  editedAt: string;
}

export interface Release {
  id: string;
  name: string;
  version: string;
  releasedAt: string;
  description?: string | null;
  createdAt: string;
  issueLinks?: { issue: ProductIssue }[];
  measurements?: ResolutionMeasurement[];
}

export interface ResolutionMeasurement {
  id: string;
  issueId: string;
  issue?: ProductIssue;
  releaseId: string;
  release?: Release;
  preWindowStart: string;
  preWindowEnd: string;
  postWindowStart: string;
  postWindowEnd: string;
  preTicketCount: number;
  postTicketCount: number;
  preAffectedCustomers: number;
  postAffectedCustomers: number;
  preSupportHours: number;
  postSupportHours: number;
  outcomeClassification: OutcomeClassification;
  computedAt: string;
  verifiedBy?: User | null;
  verifiedAt?: string | null;
}

export interface AuditLogEntry {
  id: string;
  actor?: User | null;
  action: string;
  entity: string;
  entityId?: string | null;
  details?: string | null;
  createdAt: string;
}
