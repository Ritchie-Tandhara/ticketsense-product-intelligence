import { prisma } from "../lib/prisma";
import { Ticket } from "@prisma/client";

// In-memory round-robin cursor per team (resets on server restart; acceptable for demo scope).
const roundRobinCursor: Record<string, number> = {};

interface AssignmentResult {
  agentId: string | null;
  teamId: string | null;
  reason: string;
}

async function getActiveAgentsForTeam(teamId: string) {
  return prisma.user.findMany({
    where: { teamId, role: "SUPPORT_AGENT", isActive: true },
    orderBy: { id: "asc" },
  });
}

async function activeTicketCount(agentId: string) {
  return prisma.ticket.count({
    where: { assignedAgentId: agentId, status: { notIn: ["RESOLVED", "CLOSED"] } },
  });
}

async function roundRobinAssign(teamId: string): Promise<AssignmentResult> {
  const agents = await getActiveAgentsForTeam(teamId);
  const available = [];
  for (const a of agents) {
    const load = await activeTicketCount(a.id);
    if (load < a.maxLoad) available.push(a);
  }
  if (available.length === 0) {
    return { agentId: null, teamId, reason: "No available (non-overloaded) agents found on team for round-robin." };
  }
  const cursor = (roundRobinCursor[teamId] ?? 0) % available.length;
  const agent = available[cursor];
  roundRobinCursor[teamId] = cursor + 1;
  return { agentId: agent.id, teamId, reason: `Round-robin selected ${agent.name} (position ${cursor + 1} of ${available.length} available agents).` };
}

async function leastActiveAssign(teamId: string): Promise<AssignmentResult> {
  const agents = await getActiveAgentsForTeam(teamId);
  let best: { id: string; name: string; load: number } | null = null;
  for (const a of agents) {
    const load = await activeTicketCount(a.id);
    if (load >= a.maxLoad) continue; // excluded: overloaded
    if (!best || load < best.load) best = { id: a.id, name: a.name, load };
  }
  if (!best) {
    return { agentId: null, teamId, reason: "All agents on team are at or over max load; none available." };
  }
  return { agentId: best.id, teamId, reason: `Least-active strategy selected ${best.name} with ${best.load} active tickets.` };
}

async function categoryBasedAssign(teamId: string): Promise<AssignmentResult> {
  // Category-based routing resolves to the team via AssignmentRule; agent pick
  // within the team falls back to least-active so load stays balanced.
  return leastActiveAssign(teamId);
}

async function priorityEscalationAssign(teamId: string, escalationTeamId: string | null): Promise<AssignmentResult> {
  const agents = await getActiveAgentsForTeam(teamId);
  const seniorAgents = agents.filter((a) => a.isSeniorAgent);
  for (const a of seniorAgents) {
    const load = await activeTicketCount(a.id);
    if (load < a.maxLoad) {
      return { agentId: a.id, teamId, reason: `Critical ticket routed to senior agent ${a.name}.` };
    }
  }
  if (escalationTeamId) {
    const result = await leastActiveAssign(escalationTeamId);
    return { ...result, reason: `No available senior agent on primary team; escalated to configured escalation team. ${result.reason}` };
  }
  return { agentId: null, teamId, reason: "No senior agent available and no escalation team configured." };
}

/**
 * Evaluates AssignmentRule rows in order (by `order` field) looking for the
 * first active rule whose condition matches the ticket's category/priority.
 * Falls back to the rule flagged isDefault if none match.
 */
export async function evaluateAssignment(ticket: Ticket): Promise<AssignmentResult & { ruleName: string }> {
  const rules = await prisma.assignmentRule.findMany({
    where: { isActive: true },
    orderBy: { order: "asc" },
  });

  const escalationTeam = await prisma.team.findFirst({ where: { isEscalation: true } });

  let matched = rules.find(
    (r) =>
      !r.isDefault &&
      (r.conditionPriority ? r.conditionPriority === ticket.priority : true) &&
      (r.conditionCategoryId ? r.conditionCategoryId === ticket.categoryId : true) &&
      (r.conditionPriority || r.conditionCategoryId) // must have at least one real condition
  );

  if (!matched) {
    matched = rules.find((r) => r.isDefault);
  }

  if (!matched || !matched.targetTeamId) {
    return { agentId: null, teamId: null, reason: "No matching assignment rule with a target team found.", ruleName: matched?.name ?? "none" };
  }

  let result: AssignmentResult;
  switch (matched.strategy) {
    case "ROUND_ROBIN":
      result = await roundRobinAssign(matched.targetTeamId);
      break;
    case "LEAST_ACTIVE":
      result = await leastActiveAssign(matched.targetTeamId);
      break;
    case "CATEGORY_BASED":
      result = await categoryBasedAssign(matched.targetTeamId);
      break;
    case "PRIORITY_ESCALATION":
      result = await priorityEscalationAssign(matched.targetTeamId, escalationTeam?.id ?? null);
      break;
    default:
      result = { agentId: null, teamId: matched.targetTeamId, reason: "Unknown strategy." };
  }

  return { ...result, ruleName: matched.name };
}
