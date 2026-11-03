-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tier" TEXT NOT NULL DEFAULT 'STANDARD',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ProductIssue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "productArea" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DETECTED',
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "ownerId" TEXT,
    "firstSeenAt" DATETIME NOT NULL,
    "lastSeenAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProductIssue_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IssueTicketLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "issueId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "addedBy" TEXT,
    "manual" BOOLEAN NOT NULL DEFAULT false,
    "removedAt" DATETIME,
    "removedBy" TEXT,
    CONSTRAINT "IssueTicketLink_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "ProductIssue" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "IssueTicketLink_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClusteringRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ranAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "algorithm" TEXT NOT NULL,
    "parameters" TEXT NOT NULL,
    "ticketsConsidered" INTEGER NOT NULL,
    "issuesCreated" INTEGER NOT NULL,
    "issuesUpdated" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "ImpactScenario" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "issueId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scenarioType" TEXT NOT NULL,
    "inputs" TEXT NOT NULL,
    "outputs" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ImpactScenario_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "ProductIssue" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ImpactScenario_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorkItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "issueId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "businessProblem" TEXT NOT NULL,
    "productArea" TEXT NOT NULL,
    "problemDescription" TEXT NOT NULL,
    "customerImpact" TEXT NOT NULL,
    "observedSymptoms" TEXT NOT NULL,
    "rootCause" TEXT,
    "rootCauseIsHypothesis" BOOLEAN NOT NULL DEFAULT true,
    "reproductionSteps" TEXT,
    "expectedBehavior" TEXT,
    "actualBehavior" TEXT,
    "proposedSolution" TEXT,
    "userStory" TEXT NOT NULL,
    "acceptanceCriteria" TEXT NOT NULL,
    "edgeCases" TEXT,
    "dependencies" TEXT,
    "priorityRecommendation" TEXT,
    "impactScenarioId" TEXT,
    "assumptions" TEXT,
    "openQuestions" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "ownerId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorkItem_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "ProductIssue" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WorkItem_impactScenarioId_fkey" FOREIGN KEY ("impactScenarioId") REFERENCES "ImpactScenario" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WorkItem_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorkItemVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workItemId" TEXT NOT NULL,
    "snapshot" TEXT NOT NULL,
    "editedById" TEXT,
    "editedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkItemVersion_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "WorkItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WorkItemVersion_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Release" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "releasedAt" DATETIME NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ReleaseIssueLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "releaseId" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "linkedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReleaseIssueLink_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "Release" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ReleaseIssueLink_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "ProductIssue" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ResolutionMeasurement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "issueId" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "preWindowStart" DATETIME NOT NULL,
    "preWindowEnd" DATETIME NOT NULL,
    "postWindowStart" DATETIME NOT NULL,
    "postWindowEnd" DATETIME NOT NULL,
    "preTicketCount" INTEGER NOT NULL,
    "postTicketCount" INTEGER NOT NULL,
    "preAffectedCustomers" INTEGER NOT NULL,
    "postAffectedCustomers" INTEGER NOT NULL,
    "preSupportHours" REAL NOT NULL,
    "postSupportHours" REAL NOT NULL,
    "outcomeClassification" TEXT NOT NULL,
    "computedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedById" TEXT,
    "verifiedAt" DATETIME,
    CONSTRAINT "ResolutionMeasurement_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "ProductIssue" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ResolutionMeasurement_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "Release" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ResolutionMeasurement_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Ticket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticketNumber" INTEGER NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "sentiment" TEXT,
    "requesterName" TEXT NOT NULL,
    "requesterEmail" TEXT NOT NULL,
    "customerId" TEXT,
    "categoryId" TEXT,
    "teamId" TEXT,
    "assignedAgentId" TEXT,
    "createdById" TEXT,
    "reopenCount" INTEGER NOT NULL DEFAULT 0,
    "firstRespondedAt" DATETIME,
    "resolvedAt" DATETIME,
    "closedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Ticket_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Ticket_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "TicketCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Ticket_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Ticket_assignedAgentId_fkey" FOREIGN KEY ("assignedAgentId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Ticket_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Ticket" ("assignedAgentId", "categoryId", "closedAt", "createdAt", "createdById", "description", "firstRespondedAt", "id", "priority", "reopenCount", "requesterEmail", "requesterName", "resolvedAt", "sentiment", "status", "subject", "teamId", "ticketNumber", "updatedAt") SELECT "assignedAgentId", "categoryId", "closedAt", "createdAt", "createdById", "description", "firstRespondedAt", "id", "priority", "reopenCount", "requesterEmail", "requesterName", "resolvedAt", "sentiment", "status", "subject", "teamId", "ticketNumber", "updatedAt" FROM "Ticket";
DROP TABLE "Ticket";
ALTER TABLE "new_Ticket" RENAME TO "Ticket";
CREATE UNIQUE INDEX "Ticket_ticketNumber_key" ON "Ticket"("ticketNumber");
CREATE INDEX "Ticket_status_idx" ON "Ticket"("status");
CREATE INDEX "Ticket_priority_idx" ON "Ticket"("priority");
CREATE INDEX "Ticket_categoryId_idx" ON "Ticket"("categoryId");
CREATE INDEX "Ticket_assignedAgentId_idx" ON "Ticket"("assignedAgentId");
CREATE INDEX "Ticket_teamId_idx" ON "Ticket"("teamId");
CREATE INDEX "Ticket_createdAt_idx" ON "Ticket"("createdAt");
CREATE INDEX "Ticket_customerId_idx" ON "Ticket"("customerId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Customer_email_key" ON "Customer"("email");

-- CreateIndex
CREATE INDEX "ProductIssue_status_idx" ON "ProductIssue"("status");

-- CreateIndex
CREATE INDEX "ProductIssue_productArea_idx" ON "ProductIssue"("productArea");

-- CreateIndex
CREATE INDEX "IssueTicketLink_issueId_idx" ON "IssueTicketLink"("issueId");

-- CreateIndex
CREATE INDEX "IssueTicketLink_ticketId_idx" ON "IssueTicketLink"("ticketId");

-- CreateIndex
CREATE INDEX "ImpactScenario_issueId_idx" ON "ImpactScenario"("issueId");

-- CreateIndex
CREATE INDEX "WorkItem_issueId_idx" ON "WorkItem"("issueId");

-- CreateIndex
CREATE INDEX "WorkItem_status_idx" ON "WorkItem"("status");

-- CreateIndex
CREATE INDEX "WorkItemVersion_workItemId_idx" ON "WorkItemVersion"("workItemId");

-- CreateIndex
CREATE INDEX "ReleaseIssueLink_issueId_idx" ON "ReleaseIssueLink"("issueId");

-- CreateIndex
CREATE UNIQUE INDEX "ReleaseIssueLink_releaseId_issueId_key" ON "ReleaseIssueLink"("releaseId", "issueId");

-- CreateIndex
CREATE INDEX "ResolutionMeasurement_issueId_idx" ON "ResolutionMeasurement"("issueId");

-- CreateIndex
CREATE INDEX "ResolutionMeasurement_releaseId_idx" ON "ResolutionMeasurement"("releaseId");
