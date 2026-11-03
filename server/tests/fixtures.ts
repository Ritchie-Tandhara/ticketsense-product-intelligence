import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";

export async function resetDb() {
  await prisma.workItemVersion.deleteMany();
  await prisma.workItem.deleteMany();
  await prisma.resolutionMeasurement.deleteMany();
  await prisma.releaseIssueLink.deleteMany();
  await prisma.release.deleteMany();
  await prisma.impactScenario.deleteMany();
  await prisma.issueTicketLink.deleteMany();
  await prisma.clusteringRun.deleteMany();
  await prisma.productIssue.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.aIRecommendation.deleteMany();
  await prisma.ticketEvent.deleteMany();
  await prisma.ticketMessage.deleteMany();
  await prisma.sLAInstance.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.assignmentRule.deleteMany();
  await prisma.sLAPolicy.deleteMany();
  await prisma.knowledgeArticle.deleteMany();
  await prisma.ticketCategory.deleteMany();
  await prisma.user.deleteMany();
  await prisma.team.deleteMany();
}

export async function seedBaseFixtures() {
  const passwordHash = await bcrypt.hash("Password123!", 10);

  const team = await prisma.team.create({ data: { name: "Tier 1 Support" } });
  const escalationTeam = await prisma.team.create({ data: { name: "Escalations", isEscalation: true } });

  const admin = await prisma.user.create({
    data: { name: "Test Admin", email: "test-admin@ticketsense.io", passwordHash, role: "SUPER_ADMIN", teamId: team.id },
  });
  const agent1 = await prisma.user.create({
    data: { name: "Agent One", email: "agent1@test.io", passwordHash, role: "SUPPORT_AGENT", teamId: team.id, maxLoad: 2 },
  });
  const agent2 = await prisma.user.create({
    data: { name: "Agent Two", email: "agent2@test.io", passwordHash, role: "SUPPORT_AGENT", teamId: team.id, maxLoad: 2 },
  });
  const seniorAgent = await prisma.user.create({
    data: { name: "Senior Agent", email: "senior@test.io", passwordHash, role: "SUPPORT_AGENT", teamId: team.id, isSeniorAgent: true, maxLoad: 5 },
  });
  const escalationAgent = await prisma.user.create({
    data: { name: "Escalation Agent", email: "escalation@test.io", passwordHash, role: "SUPPORT_AGENT", teamId: escalationTeam.id, isSeniorAgent: true, maxLoad: 5 },
  });
  const analyst = await prisma.user.create({
    data: { name: "Readonly Analyst", email: "analyst@test.io", passwordHash, role: "READONLY_ANALYST", teamId: team.id },
  });

  const category = await prisma.ticketCategory.create({ data: { name: "Technical" } });

  await prisma.sLAPolicy.create({ data: { name: "Low", priority: "LOW", firstResponseTargetMin: 480, resolutionTargetMin: 4320, businessHoursOnly: true } });
  await prisma.sLAPolicy.create({ data: { name: "Medium", priority: "MEDIUM", firstResponseTargetMin: 240, resolutionTargetMin: 1440, businessHoursOnly: true } });
  await prisma.sLAPolicy.create({ data: { name: "High", priority: "HIGH", firstResponseTargetMin: 60, resolutionTargetMin: 480, businessHoursOnly: true } });
  await prisma.sLAPolicy.create({ data: { name: "Critical", priority: "CRITICAL", firstResponseTargetMin: 15, resolutionTargetMin: 240, businessHoursOnly: false } });

  await prisma.assignmentRule.create({
    data: { name: "Critical escalation", order: 1, strategy: "PRIORITY_ESCALATION", conditionPriority: "CRITICAL", targetTeamId: team.id },
  });
  await prisma.assignmentRule.create({
    data: { name: "Default round robin", order: 99, isDefault: true, strategy: "ROUND_ROBIN", targetTeamId: team.id },
  });

  return { team, escalationTeam, admin, agent1, agent2, seniorAgent, escalationAgent, analyst, category };
}
