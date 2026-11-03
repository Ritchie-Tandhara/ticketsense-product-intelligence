/* eslint-disable no-console */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { classifyTicket } from "../src/ai/deterministicClassifier";
import { addBusinessMinutes, addCalendarMinutes } from "../src/lib/businessHours";
import { generateWorkItemDraft } from "../src/ai/baAssistant";
import { calculateImpact, calculatePrioritizationScore } from "../src/services/impactCalculator";
import { computeMeasurement } from "../src/services/resolutionMeasurementService";

const prisma = new PrismaClient();

function rand<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function daysAgo(days: number, hourJitter = true) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  if (hourJitter) {
    d.setHours(randInt(8, 19), randInt(0, 59), 0, 0);
  }
  return d;
}

const FIRST_NAMES = ["Priya", "Rohan", "Ananya", "Vikram", "Sneha", "Arjun", "Kavya", "Rahul", "Ishita", "Karan", "Meera", "Aditya", "Divya", "Nikhil", "Pooja", "Sahil", "Tanya", "Varun", "Neha", "Yash", "Riya", "Siddharth", "Aisha", "Manish"];
const LAST_NAMES = ["Sharma", "Verma", "Patel", "Gupta", "Mehta", "Iyer", "Kapoor", "Nair", "Reddy", "Joshi", "Chawla", "Malhotra", "Bose", "Khanna", "Rao"];
const DOMAINS = ["acme-corp.com", "brightleaf.io", "nimbuscloud.com", "vertexsystems.net", "clearpath.co", "gmail.com", "outlook.com"];

function randomCustomer() {
  const first = rand(FIRST_NAMES);
  const last = rand(LAST_NAMES);
  return {
    name: `${first} ${last}`,
    email: `${first.toLowerCase()}.${last.toLowerCase()}${randInt(1, 99)}@${rand(DOMAINS)}`,
  };
}

const TICKET_TEMPLATES: { subject: string; description: string }[] = [
  { subject: "Cannot log into my account", description: "I have been trying to log in since this morning but it keeps saying invalid password. I reset it twice already. This is urgent, I cannot access my dashboard." },
  { subject: "Charged twice for the same invoice", description: "I was charged twice for invoice #4521 this month. Please refund the duplicate charge as soon as possible, this is unacceptable." },
  { subject: "App crashes when exporting report", description: "Every time I click export on the reports page the app crashes with an error. This is blocking my entire team from getting data out." },
  { subject: "Feature request: dark mode", description: "It would be great if you could add a dark mode option to the dashboard. Not urgent, just a nice to have suggestion." },
  { subject: "API integration returning 500 errors", description: "Our webhook integration started returning 500 errors in production an hour ago. This is affecting all users downstream, please help urgently." },
  { subject: "How do I change my billing email", description: "Just wondering how I can update the email address used for invoices. Thanks in advance." },
  { subject: "Extremely slow dashboard loading", description: "The dashboard has been painfully slow and laggy for the past two days, timing out frequently. Please investigate the performance issue." },
  { subject: "Please delete my account", description: "I would like to close and deactivate my account permanently. Please confirm once done." },
  { subject: "Thank you for the quick fix", description: "Just wanted to say thank you, your team resolved my previous issue quickly and I really appreciate the excellent support." },
  { subject: "Production outage - system down", description: "Our entire team is blocked, the system is down in production. This is a critical emergency affecting all users and revenue, please escalate immediately." },
  { subject: "Minor UI glitch on settings page", description: "There's a small visual bug where the save button overlaps the text field on the settings page. Not a big deal." },
  { subject: "Request to add new team member", description: "Could you help me understand how to add a new teammate to our workspace? Thanks." },
  { subject: "Payment failed during checkout", description: "My card was declined during checkout even though it has sufficient balance. Tried three times, getting frustrated with this payment error." },
  { subject: "Data sync issue with integration", description: "Our CRM integration sync failed last night and data is now out of sync across the whole company. Please help resolve this broken integration." },
  { subject: "Love the new analytics feature", description: "The new analytics charts are awesome, really love the new look. Great work from the team!" },
  { subject: "Need help understanding SLA policy", description: "Just have a question about how your SLA policy works for enterprise plans. Appreciate any info." },
  { subject: "Two factor authentication locked me out", description: "I am locked out after losing access to my 2FA device. I cannot access my account at all, please help urgently." },
  { subject: "Invoice missing tax breakdown", description: "The latest invoice is missing a line-item tax breakdown that we need for our accounting. Could you send a corrected receipt?" },
  { subject: "Suggestion for bulk edit feature", description: "It would really help if we could bulk edit multiple records at once. Just a suggestion/feature request for a future enhancement." },
  { subject: "Worst experience, nothing works", description: "This is honestly the worst experience, nothing on this platform works and I am furious. Everything is broken and the team seems unresponsive." },
];

async function main() {
  console.log("Seeding TicketSense...");

  // Reset in dependency order
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

  // ---- Teams ----
  const teamNames = ["Tier 1 Support", "Tier 2 Technical", "Billing Operations", "Escalations"];
  const teams = await Promise.all(
    teamNames.map((name, i) =>
      prisma.team.create({ data: { name, description: `${name} team`, isEscalation: name === "Escalations" } })
    )
  );
  const [tier1, tier2, billing, escalations] = teams;

  // ---- Categories ----
  const categoryDefs = [
    { name: "Technical", description: "Bugs, performance, integrations, login issues" },
    { name: "Billing", description: "Invoices, refunds, payments" },
    { name: "Account", description: "Account setup, deletion, profile" },
    { name: "Feature Request", description: "Enhancement suggestions" },
    { name: "General", description: "General inquiries" },
  ];
  const categories = await Promise.all(categoryDefs.map((c) => prisma.ticketCategory.create({ data: c })));
  const catByName = Object.fromEntries(categories.map((c) => [c.name, c]));

  // ---- Users ----
  const passwordHash = await bcrypt.hash("Password123!", 10);

  const superAdmin = await prisma.user.create({
    data: { name: "Asha Admin", email: "admin@ticketsense.io", passwordHash, role: "SUPER_ADMIN", teamId: tier1.id },
  });
  const manager = await prisma.user.create({
    data: { name: "Manoj Manager", email: "manager@ticketsense.io", passwordHash, role: "SUPPORT_MANAGER", teamId: tier1.id },
  });
  const analyst = await prisma.user.create({
    data: { name: "Reena Analyst", email: "analyst@ticketsense.io", passwordHash, role: "READONLY_ANALYST", teamId: tier1.id },
  });

  const agentDefs = [
    { name: "Agent Aarav Kumar", team: tier1, senior: true },
    { name: "Agent Bhavna Singh", team: tier1, senior: false },
    { name: "Agent Chetan Rao", team: tier1, senior: false },
    { name: "Agent Diya Mehta", team: tier1, senior: false },
    { name: "Agent Esha Nair", team: tier2, senior: true },
    { name: "Agent Farhan Ali", team: tier2, senior: false },
    { name: "Agent Gauri Joshi", team: tier2, senior: false },
    { name: "Agent Harish Patel", team: billing, senior: true },
    { name: "Agent Ira Kapoor", team: billing, senior: false },
    { name: "Agent Jatin Verma", team: billing, senior: false },
    { name: "Agent Kiran Bose", team: escalations, senior: true },
    { name: "Agent Leela Chawla", team: escalations, senior: true },
  ];

  const agents = [];
  for (let i = 0; i < agentDefs.length; i++) {
    const def = agentDefs[i];
    const email = `agent${i + 1}@ticketsense.io`;
    const agent = await prisma.user.create({
      data: {
        name: def.name,
        email,
        passwordHash,
        role: "SUPPORT_AGENT",
        teamId: def.team.id,
        isSeniorAgent: def.senior,
        maxLoad: 12,
      },
    });
    agents.push(agent);
  }

  console.log(`Created ${agents.length} agents, 3 non-agent users, ${teams.length} teams, ${categories.length} categories.`);

  // ---- SLA Policies ----
  const slaDefs = [
    { name: "Low Priority SLA", priority: "LOW", firstResponseTargetMin: 480, resolutionTargetMin: 4320, businessHoursOnly: true },
    { name: "Medium Priority SLA", priority: "MEDIUM", firstResponseTargetMin: 240, resolutionTargetMin: 1440, businessHoursOnly: true },
    { name: "High Priority SLA", priority: "HIGH", firstResponseTargetMin: 60, resolutionTargetMin: 480, businessHoursOnly: true },
    { name: "Critical Priority SLA", priority: "CRITICAL", firstResponseTargetMin: 15, resolutionTargetMin: 240, businessHoursOnly: false },
  ];
  await Promise.all(slaDefs.map((s) => prisma.sLAPolicy.create({ data: s })));

  // ---- Assignment Rules ----
  await prisma.assignmentRule.create({
    data: { name: "Critical -> Escalation / Senior", order: 1, strategy: "PRIORITY_ESCALATION", conditionPriority: "CRITICAL", targetTeamId: tier1.id },
  });
  await prisma.assignmentRule.create({
    data: { name: "Billing category -> Billing Ops (least active)", order: 2, strategy: "LEAST_ACTIVE", conditionCategoryId: catByName["Billing"].id, targetTeamId: billing.id },
  });
  await prisma.assignmentRule.create({
    data: { name: "Technical category -> Tier 2 (category based)", order: 3, strategy: "CATEGORY_BASED", conditionCategoryId: catByName["Technical"].id, targetTeamId: tier2.id },
  });
  await prisma.assignmentRule.create({
    data: { name: "Default -> Tier 1 round robin", order: 99, strategy: "ROUND_ROBIN", isDefault: true, targetTeamId: tier1.id },
  });

  // ---- Knowledge base ----
  const kbDefs = [
    { title: "How to reset your password", body: "Go to the login page and click 'Forgot password'. Follow the emailed link to set a new password. If you do not receive the email within 10 minutes check your spam folder.", tags: "login,password,access,authentication" },
    { title: "Understanding your invoice", body: "Each invoice includes a line-item breakdown of charges, applicable taxes, and payment method used. Refunds for duplicate charges are typically processed within 5-7 business days.", tags: "billing,invoice,refund,payment" },
    { title: "Troubleshooting slow dashboard performance", body: "Clear your browser cache, disable heavy browser extensions, and ensure you are on a supported browser version. If the dashboard is still slow, check our status page for ongoing incidents.", tags: "performance,slow,dashboard,technical" },
    { title: "Setting up API webhooks", body: "Webhooks can be configured under Settings > Integrations. Ensure your endpoint returns a 200 status within 5 seconds, otherwise the webhook will be retried and may eventually fail.", tags: "api,webhook,integration,technical" },
    { title: "How to close or delete your account", body: "Account deletion is permanent. Navigate to Settings > Account > Delete Account. All data is purged within 30 days per our data retention policy.", tags: "account,deletion,delete,close" },
    { title: "Submitting a feature request", body: "We welcome feature requests via the in-app feedback widget or by emailing feedback@ticketsense.io. Popular requests are reviewed quarterly by product.", tags: "feature,request,enhancement,suggestion" },
  ];
  for (const kb of kbDefs) {
    await prisma.knowledgeArticle.create({ data: { ...kb, isPublished: true, authorId: manager.id } });
  }
  await prisma.knowledgeArticle.create({
    data: { title: "DRAFT: Upcoming SSO rollout notes", body: "Internal draft notes about SSO rollout, not ready for publishing yet.", tags: "sso,draft", isPublished: false, authorId: manager.id },
  });

  // ---- Customers (V2: lightweight customer model so "unique affected
  // customers" and "customer tier" are real data, not guessed from free-text
  // requester fields) ----
  const CUSTOMER_TIER_POOL = ["STANDARD", "STANDARD", "STANDARD", "PRO", "PRO", "ENTERPRISE"] as const;
  const customers = [];
  for (let i = 0; i < 70; i++) {
    const c = randomCustomer();
    const tier = rand(CUSTOMER_TIER_POOL);
    const customer = await prisma.customer.create({ data: { name: c.name, email: c.email, tier } });
    customers.push(customer);
  }
  console.log(`Created ${customers.length} customers.`);

  // ---- Tickets (~120, spread over ~60 days) ----
  const allPolicies = await prisma.sLAPolicy.findMany();
  const policyByPriority = Object.fromEntries(allPolicies.map((p) => [p.priority, p]));
  const statusPool: string[] = ["NEW", "OPEN", "OPEN", "IN_PROGRESS", "IN_PROGRESS", "PENDING", "RESOLVED", "RESOLVED", "RESOLVED", "CLOSED", "CLOSED"];

  let ticketNumber = 1001;
  const totalTickets = 120;

  for (let i = 0; i < totalTickets; i++) {
    const template = rand(TICKET_TEMPLATES);
    // ~85% of tickets are tied to a real Customer record (repeat customers);
    // the rest keep only free-text requester fields, same as V1 behavior.
    const linkedCustomer = Math.random() < 0.85 ? rand(customers) : null;
    const customer = linkedCustomer ?? randomCustomer();
    const ageInDays = Math.floor((i / totalTickets) * 60) + randInt(0, 1); // spread across ~60 days
    const createdAt = daysAgo(60 - ageInDays);

    const classification = classifyTicket(template.subject, template.description);
    const category = catByName[classification.category] ?? catByName["General"];

    const status = rand(statusPool) as string;
    const team = rand(teams);
    const agent = Math.random() > 0.08 ? rand(agents.filter((a) => a.teamId === team.id) || agents) : null;
    const assignedAgent = agent ?? (Math.random() > 0.5 ? rand(agents) : null);

    const reopenCount = status === "CLOSED" && Math.random() < 0.15 ? 1 : 0;

    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber: ticketNumber++,
        subject: template.subject,
        description: template.description,
        status,
        priority: classification.priority,
        sentiment: classification.sentiment,
        requesterName: customer.name,
        requesterEmail: customer.email,
        customerId: linkedCustomer?.id,
        categoryId: category.id,
        teamId: team.id,
        assignedAgentId: assignedAgent?.id,
        createdById: manager.id,
        reopenCount,
        createdAt,
        updatedAt: createdAt,
      },
    });

    // SLA instance
    const policy = policyByPriority[classification.priority];
    if (policy) {
      const firstResponseDueAt = policy.businessHoursOnly
        ? addBusinessMinutes(createdAt, policy.firstResponseTargetMin)
        : addCalendarMinutes(createdAt, policy.firstResponseTargetMin);
      const resolutionDueAt = policy.businessHoursOnly
        ? addBusinessMinutes(createdAt, policy.resolutionTargetMin)
        : addCalendarMinutes(createdAt, policy.resolutionTargetMin);

      const isResolved = status === "RESOLVED" || status === "CLOSED";
      // ~30% chance of a breach for realism, more likely for older/critical tickets
      const breachRoll = Math.random();
      const firstResponseBreached = !isResolved ? breachRoll < 0.2 && new Date() > firstResponseDueAt : breachRoll < 0.15;
      const resolutionBreached = isResolved ? breachRoll < 0.25 : breachRoll < 0.2 && new Date() > resolutionDueAt;

      await prisma.sLAInstance.create({
        data: {
          ticketId: ticket.id,
          slaPolicyId: policy.id,
          firstResponseDueAt,
          resolutionDueAt,
          firstResponseBreached,
          resolutionBreached,
          firstResponseMetAt: !firstResponseBreached && Math.random() > 0.3 ? new Date(createdAt.getTime() + randInt(5, 120) * 60000) : null,
          resolvedMetAt: isResolved ? new Date(createdAt.getTime() + randInt(60, 2000) * 60000) : null,
        },
      });
    }

    // first response + resolved/closed timestamps on the ticket itself
    const firstRespondedAt = Math.random() > 0.15 ? new Date(createdAt.getTime() + randInt(5, 180) * 60000) : null;
    const resolvedAt = status === "RESOLVED" || status === "CLOSED" ? new Date(createdAt.getTime() + randInt(60, 4000) * 60000) : null;
    const closedAt = status === "CLOSED" ? new Date((resolvedAt ?? createdAt).getTime() + randInt(60, 500) * 60000) : null;
    await prisma.ticket.update({ where: { id: ticket.id }, data: { firstRespondedAt, resolvedAt, closedAt } });

    // messages
    await prisma.ticketMessage.create({
      data: { ticketId: ticket.id, type: "CUSTOMER_REPLY", body: template.description, createdAt },
    });
    if (firstRespondedAt && assignedAgent) {
      await prisma.ticketMessage.create({
        data: { ticketId: ticket.id, authorId: assignedAgent.id, type: "AGENT_REPLY", body: "Thanks for reaching out, we're looking into this now.", createdAt: firstRespondedAt },
      });
      if (Math.random() > 0.6) {
        await prisma.ticketMessage.create({
          data: { ticketId: ticket.id, authorId: assignedAgent.id, type: "INTERNAL_NOTE", body: "Checked logs, escalating if not resolved by EOD.", createdAt: new Date(firstRespondedAt.getTime() + 30 * 60000) },
        });
      }
    }

    // events
    await prisma.ticketEvent.create({ data: { ticketId: ticket.id, type: "CREATED", message: "Ticket created.", createdAt } });
    if (assignedAgent) {
      await prisma.ticketEvent.create({
        data: { ticketId: ticket.id, type: "ASSIGNMENT", message: `Assigned to ${assignedAgent.name}.`, createdAt: new Date(createdAt.getTime() + 2 * 60000) },
      });
    }
    if (reopenCount > 0) {
      await prisma.ticketEvent.create({
        data: { ticketId: ticket.id, type: "REOPEN", message: "Ticket reopened by customer after closure.", createdAt: new Date((resolvedAt ?? createdAt).getTime() + 100 * 60000) },
      });
    }

    // AI recommendation history, mix of accepted/rejected/edited/pending
    const decisionRoll = Math.random();
    let recStatus = "PENDING";
    let reviewedById: string | null = null;
    let editedValue: string | null = null;
    if (decisionRoll < 0.45) {
      recStatus = "ACCEPTED";
      reviewedById = assignedAgent?.id ?? manager.id;
    } else if (decisionRoll < 0.65) {
      recStatus = "REJECTED";
      reviewedById = assignedAgent?.id ?? manager.id;
    } else if (decisionRoll < 0.85) {
      recStatus = "EDITED";
      reviewedById = assignedAgent?.id ?? manager.id;
      editedValue = JSON.stringify({ suggestedPriority: rand(["LOW", "MEDIUM", "HIGH", "CRITICAL"]) });
    }

    await prisma.aIRecommendation.create({
      data: {
        ticketId: ticket.id,
        suggestedCategory: classification.category,
        suggestedSubcategory: classification.subcategory,
        suggestedPriority: classification.priority,
        suggestedSentiment: classification.sentiment,
        confidence: classification.confidence,
        reasoning: classification.reasoning,
        status: recStatus,
        reviewedById,
        editedValue,
        reviewedAt: recStatus !== "PENDING" ? new Date(createdAt.getTime() + 10 * 60000) : null,
        createdAt,
      },
    });
  }

  console.log(`Created ${totalTickets} tickets with messages, events, SLA instances, and AI recommendations.`);

  // =====================================================================
  // V2 — Issue Genome demo clusters, Impact Simulator, Support-to-Roadmap,
  // Resolution Intelligence: additive seed data on top of the V1 tickets
  // above. Deterministic (no Math.random in the ticket text itself) so the
  // theme/cluster structure is stable run-to-run; only incidental details
  // (customer pick, exact minute offsets) vary.
  // =====================================================================

  async function createClusterTicket(opts: {
    subject: string;
    description: string;
    categoryName: string;
    teamId: string;
    priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    createdAt: Date;
    customer: { id: string; name: string; email: string };
  }) {
    const classification = classifyTicket(opts.subject, opts.description);
    const category = catByName[opts.categoryName] ?? catByName["Technical"];
    const agent = rand(agents.filter((a) => a.teamId === opts.teamId)) ?? rand(agents);

    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber: ticketNumber++,
        subject: opts.subject,
        description: opts.description,
        status: "RESOLVED",
        priority: opts.priority,
        sentiment: classification.sentiment,
        requesterName: opts.customer.name,
        requesterEmail: opts.customer.email,
        customerId: opts.customer.id,
        categoryId: category.id,
        teamId: opts.teamId,
        assignedAgentId: agent?.id,
        createdById: manager.id,
        createdAt: opts.createdAt,
        updatedAt: opts.createdAt,
        firstRespondedAt: new Date(opts.createdAt.getTime() + randInt(10, 90) * 60000),
        resolvedAt: new Date(opts.createdAt.getTime() + randInt(120, 600) * 60000),
      },
    });

    await prisma.ticketMessage.create({
      data: { ticketId: ticket.id, type: "CUSTOMER_REPLY", body: opts.description, createdAt: opts.createdAt },
    });
    await prisma.ticketEvent.create({ data: { ticketId: ticket.id, type: "CREATED", message: "Ticket created.", createdAt: opts.createdAt } });

    await prisma.aIRecommendation.create({
      data: {
        ticketId: ticket.id,
        suggestedCategory: classification.category,
        suggestedSubcategory: classification.subcategory,
        suggestedPriority: classification.priority,
        suggestedSentiment: classification.sentiment,
        confidence: classification.confidence,
        reasoning: classification.reasoning,
        createdAt: opts.createdAt,
      },
    });

    return ticket;
  }

  function daysAgoExact(days: number, hour = 10) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    d.setHours(hour, randInt(0, 59), 0, 0);
    return d;
  }

  // ---- Theme: OTP delivery failures (THE flagship end-to-end journey) ----
  // 10 tickets in the pre-fix window (58-32 days ago), 3 in the post-fix
  // window (25-3 days ago) -> a real, computed ~70% drop in ticket volume.
  const otpDeviceVariants = ["Android phone", "iPhone", "work phone", "personal mobile", "registered mobile number", "backup phone"];
  const otpAttemptVariants = ["two times", "three times", "four times", "several times", "five times", "repeatedly"];
  const otpTickets = [];
  for (let i = 0; i < 10; i++) {
    const customer = rand(customers);
    const t = await createClusterTicket({
      subject: "OTP not received during login",
      description: `I am not receiving the OTP verification code when I try to log in. I requested it ${otpAttemptVariants[i % otpAttemptVariants.length]} but the SMS never arrives on my ${otpDeviceVariants[i % otpDeviceVariants.length]}. This is blocking me from accessing my account and it is urgent.`,
      categoryName: "Technical",
      teamId: tier2.id,
      priority: i % 4 === 0 ? "CRITICAL" : "HIGH",
      createdAt: daysAgoExact(58 - i * 2, 9 + i),
      customer,
    });
    otpTickets.push(t);
  }
  for (let i = 0; i < 3; i++) {
    const customer = rand(customers);
    const t = await createClusterTicket({
      subject: "OTP not received during login",
      description: `I am not receiving the OTP verification code when I try to log in. I requested it ${otpAttemptVariants[i % otpAttemptVariants.length]} but the SMS never arrives on my ${otpDeviceVariants[i % otpDeviceVariants.length]}. This is blocking me from accessing my account and it is urgent.`,
      categoryName: "Technical",
      teamId: tier2.id,
      priority: "MEDIUM",
      createdAt: daysAgoExact(25 - i * 8, 11 + i),
      customer,
    });
    otpTickets.push(t);
  }

  const otpIssue = await prisma.productIssue.create({
    data: {
      title: "OTP delivery failures during login",
      description: "Customers across multiple carriers intermittently do not receive the login OTP SMS, blocking access to their account. Traced to a timeout against the upstream SMS gateway under load.",
      productArea: "Authentication",
      status: "MONITORING",
      severity: "HIGH",
      ownerId: agents.find((a) => a.isSeniorAgent && a.teamId === tier2.id)?.id ?? manager.id,
      firstSeenAt: otpTickets[0].createdAt,
      lastSeenAt: otpTickets[otpTickets.length - 1].createdAt,
    },
  });
  for (const t of otpTickets) {
    await prisma.issueTicketLink.create({ data: { issueId: otpIssue.id, ticketId: t.id, addedBy: manager.id, manual: true } });
  }

  // Impact Simulator: 3 scenarios for the flagship issue, computed server-side
  // via the exact same calculateImpact() function the API uses.
  const otpUniqueCustomers = new Set(otpTickets.map((t) => t.customerId)).size;
  // Volumes below represent a 12-month forward projection for this recurring
  // issue across the full customer base (not just the 13 historically linked
  // tickets) -- deliberately chosen so the three scenarios span a realistic
  // range from "might not pay off" (Conservative) to "clearly worth it"
  // (Optimistic), rather than three rosy numbers.
  const scenarioDefs: { name: string; scenarioType: "CONSERVATIVE" | "EXPECTED" | "OPTIMISTIC"; inputs: Parameters<typeof calculateImpact>[0] }[] = [
    {
      name: "Conservative",
      scenarioType: "CONSERVATIVE",
      inputs: { relatedTicketCount: otpTickets.length, uniqueCustomers: otpUniqueCustomers, avgHandlingTimeMinutes: 25, supportCostPerHour: 22, projectedFutureTicketVolume: 150, estimatedFixEffectivenessPct: 50, engineeringCost: 1200, customerTier: "PRO" },
    },
    {
      name: "Expected",
      scenarioType: "EXPECTED",
      inputs: { relatedTicketCount: otpTickets.length, uniqueCustomers: otpUniqueCustomers, avgHandlingTimeMinutes: 25, supportCostPerHour: 22, projectedFutureTicketVolume: 250, estimatedFixEffectivenessPct: 75, engineeringCost: 1200, customerTier: "PRO" },
    },
    {
      name: "Optimistic",
      scenarioType: "OPTIMISTIC",
      inputs: { relatedTicketCount: otpTickets.length, uniqueCustomers: otpUniqueCustomers, avgHandlingTimeMinutes: 25, supportCostPerHour: 22, projectedFutureTicketVolume: 400, estimatedFixEffectivenessPct: 90, engineeringCost: 1200, customerTier: "PRO" },
    },
  ];
  let expectedScenarioId = "";
  for (const def of scenarioDefs) {
    const outputs = calculateImpact(def.inputs);
    const prioritization = calculatePrioritizationScore({
      uniqueCustomers: def.inputs.uniqueCustomers,
      relatedTicketCount: def.inputs.relatedTicketCount,
      historicalSupportCost: outputs.historicalSupportCost,
      severity: otpIssue.severity,
      dominantCustomerTier: def.inputs.customerTier,
      engineeringCost: def.inputs.engineeringCost,
    });
    const scenario = await prisma.impactScenario.create({
      data: {
        issueId: otpIssue.id,
        name: def.name,
        scenarioType: def.scenarioType,
        inputs: JSON.stringify(def.inputs),
        outputs: JSON.stringify({ ...outputs, prioritization }),
        createdById: manager.id,
      },
    });
    if (def.scenarioType === "EXPECTED") expectedScenarioId = scenario.id;
  }

  // Support-to-Roadmap: AI-BA-assistant draft, then approved through the full
  // work item state machine (Draft -> Under Review -> Approved).
  const otpDraft = generateWorkItemDraft({
    title: otpIssue.title,
    productArea: otpIssue.productArea,
    severity: otpIssue.severity,
    uniqueCustomers: otpUniqueCustomers,
    tickets: otpTickets.map((t) => ({ id: t.id, ticketNumber: t.ticketNumber, subject: t.subject, description: t.description, requesterName: t.requesterName, priority: t.priority })),
  });
  const otpWorkItem = await prisma.workItem.create({
    data: {
      issueId: otpIssue.id,
      title: `Fix: ${otpIssue.title}`,
      businessProblem: otpDraft.businessProblem,
      productArea: otpIssue.productArea,
      problemDescription: otpDraft.problemDescription,
      customerImpact: otpDraft.customerImpact,
      observedSymptoms: otpDraft.observedSymptoms,
      rootCause: otpDraft.rootCause,
      rootCauseIsHypothesis: otpDraft.rootCauseIsHypothesis,
      reproductionSteps: otpDraft.reproductionSteps,
      expectedBehavior: otpDraft.expectedBehavior,
      actualBehavior: otpDraft.actualBehavior,
      proposedSolution: otpDraft.proposedSolution,
      userStory: otpDraft.userStory,
      acceptanceCriteria: otpDraft.acceptanceCriteria,
      edgeCases: otpDraft.edgeCases,
      priorityRecommendation: "HIGH",
      impactScenarioId: expectedScenarioId,
      assumptions: otpDraft.assumptions,
      openQuestions: otpDraft.openQuestions,
      status: "APPROVED",
      ownerId: manager.id,
    },
  });
  await prisma.workItemVersion.create({
    data: { workItemId: otpWorkItem.id, snapshot: JSON.stringify(otpWorkItem), editedById: manager.id },
  });

  // Resolution Intelligence: link a real release, then compute the
  // before/after measurement from the actual seeded ticket timestamps above
  // (via the same computeMeasurement() the API uses) -> "Improving".
  const otpRelease = await prisma.release.create({
    data: {
      name: "OTP Reliability Fix",
      version: "v2.3.0",
      releasedAt: daysAgoExact(30, 12),
      description: "Added retry-with-backoff and a secondary SMS gateway failover for OTP delivery to address the recurring login-blocking issue.",
    },
  });
  await prisma.releaseIssueLink.create({ data: { releaseId: otpRelease.id, issueId: otpIssue.id } });

  const measurement = await computeMeasurement(otpIssue.id, otpRelease.id, 30);
  await prisma.resolutionMeasurement.create({
    data: {
      issueId: otpIssue.id,
      releaseId: otpRelease.id,
      preWindowStart: measurement.preWindow.start,
      preWindowEnd: measurement.preWindow.end,
      postWindowStart: measurement.postWindow.start,
      postWindowEnd: measurement.postWindow.end,
      preTicketCount: measurement.pre.ticketCount,
      postTicketCount: measurement.post.ticketCount,
      preAffectedCustomers: measurement.pre.affectedCustomers,
      postAffectedCustomers: measurement.post.affectedCustomers,
      preSupportHours: measurement.pre.supportHours,
      postSupportHours: measurement.post.supportHours,
      outcomeClassification: measurement.outcomeClassification,
    },
  });

  console.log(`Flagship journey seeded: issue "${otpIssue.title}" (${otpIssue.id}), release "${otpRelease.name} ${otpRelease.version}", measurement outcome: ${measurement.outcomeClassification} (pre=${measurement.pre.ticketCount} tickets, post=${measurement.post.ticketCount} tickets).`);

  // ---- 2 more CONFIRMED issues, already clustered (manual links) ----
  const paymentActivationVariants = ["credit card", "debit card", "UPI", "net banking", "wallet balance", "saved card", "new card"];
  const paymentTickets = [];
  for (let i = 0; i < 8; i++) {
    const customer = rand(customers);
    const t = await createClusterTicket({
      subject: "Payment succeeded but plan not activated",
      description: `My payment went through using ${paymentActivationVariants[i % paymentActivationVariants.length]} but my subscription plan was not activated afterward. I was still charged. Please activate my plan or refund me, this is urgent.`,
      categoryName: "Billing",
      teamId: billing.id,
      priority: i % 3 === 0 ? "CRITICAL" : "HIGH",
      createdAt: daysAgoExact(randInt(5, 50), 9 + i),
      customer,
    });
    paymentTickets.push(t);
  }
  const paymentIssue = await prisma.productIssue.create({
    data: {
      title: "Failed payment activation after successful charge",
      description: "Subscription activation does not fire reliably after a successful payment capture, leaving customers charged without access. Confirmed after review of 8 linked tickets.",
      productArea: "Billing",
      status: "CONFIRMED",
      severity: "HIGH",
      ownerId: agents.find((a) => a.isSeniorAgent && a.teamId === billing.id)?.id ?? manager.id,
      firstSeenAt: paymentTickets[0].createdAt,
      lastSeenAt: paymentTickets[paymentTickets.length - 1].createdAt,
    },
  });
  for (const t of paymentTickets) {
    await prisma.issueTicketLink.create({ data: { issueId: paymentIssue.id, ticketId: t.id, addedBy: manager.id, manual: true } });
  }

  const notificationDelayVariants = ["order confirmation", "shipping update", "password reset", "invoice", "renewal reminder", "weekly digest"];
  const notificationTickets = [];
  for (let i = 0; i < 7; i++) {
    const customer = rand(customers);
    const t = await createClusterTicket({
      subject: "Notification emails arriving very late",
      description: `The ${notificationDelayVariants[i % notificationDelayVariants.length]} notification email arrived more than a day late. This delay is causing confusion and missed deadlines for my team.`,
      categoryName: "Technical",
      teamId: tier1.id,
      priority: "MEDIUM",
      createdAt: daysAgoExact(randInt(5, 50), 9 + i),
      customer,
    });
    notificationTickets.push(t);
  }
  const notificationIssue = await prisma.productIssue.create({
    data: {
      title: "Delayed outbound notification emails",
      description: "Transactional email notifications are being delivered with multi-hour to multi-day delay. Confirmed after review of 7 linked tickets; likely a queue backlog in the notification worker.",
      productArea: "Notifications",
      status: "CONFIRMED",
      severity: "MEDIUM",
      ownerId: manager.id,
      firstSeenAt: notificationTickets[0].createdAt,
      lastSeenAt: notificationTickets[notificationTickets.length - 1].createdAt,
    },
  });
  for (const t of notificationTickets) {
    await prisma.issueTicketLink.create({ data: { issueId: notificationIssue.id, ticketId: t.id, addedBy: manager.id, manual: true } });
  }

  // ---- 5 more recurring-problem themes, left UNLINKED so the "Detect
  // emerging issues" clustering endpoint has real work to do in the live demo ----
  const unlinkedThemes: { subject: string; descriptionTemplate: string; fillers: string[]; categoryName: string; teamId: string; priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"; count: number }[] = [
    {
      subject: "Dashboard fails to load with a blank screen",
      descriptionTemplate: "The main dashboard fails to load and shows a blank {screen} screen. I have tried refreshing and clearing cache {n} times with no luck. This is blocking my daily work.",
      fillers: ["white", "grey", "loading", "empty", "broken", "frozen"],
      categoryName: "Technical",
      teamId: tier1.id,
      priority: "HIGH",
      count: 6,
    },
    {
      subject: "Invoice shows incorrect total amount",
      descriptionTemplate: "My latest invoice shows an incorrect total that does not match my {plan} plan pricing. The tax and discount lines look wrong by about {n} as well. Please correct and resend.",
      fillers: ["monthly", "annual", "team", "enterprise", "starter", "pro"],
      categoryName: "Billing",
      teamId: billing.id,
      priority: "MEDIUM",
      count: 6,
    },
    {
      subject: "API requests failing with authentication error",
      descriptionTemplate: "Our integration's API requests started failing with an authentication error using the {token} token. Nothing changed on our side. This is breaking our {n} integration in production.",
      fillers: ["API key", "OAuth", "bearer", "service account", "refresh", "client secret"],
      categoryName: "Technical",
      teamId: tier2.id,
      priority: "CRITICAL",
      count: 6,
    },
    {
      subject: "Subscription upgrade fails midway through checkout",
      descriptionTemplate: "Trying to upgrade my subscription to the {plan} tier fails midway through checkout with an error. I've tried this {n} times from different browsers.",
      fillers: ["Pro", "Enterprise", "Team", "Growth", "Premium", "Business"],
      categoryName: "Billing",
      teamId: billing.id,
      priority: "HIGH",
      count: 6,
    },
    {
      subject: "Duplicate customer record created in account",
      descriptionTemplate: "A duplicate customer record was created under my account after {n} using the {method} signup flow. Now I have two profiles and my data is split between them.",
      fillers: ["SSO login", "email signup", "Google signup", "an invite link", "a password reset", "a merge request"],
      categoryName: "Account",
      teamId: tier1.id,
      priority: "MEDIUM",
      count: 6,
    },
  ];

  for (const theme of unlinkedThemes) {
    for (let i = 0; i < theme.count; i++) {
      const customer = rand(customers);
      const description = theme.descriptionTemplate.replace("{n}", String(i + 2)).replace(/\{[a-z]+\}/, theme.fillers[i % theme.fillers.length]);
      await createClusterTicket({
        subject: theme.subject,
        description,
        categoryName: theme.categoryName,
        teamId: theme.teamId,
        priority: theme.priority,
        createdAt: daysAgoExact(randInt(2, 45), 9 + i),
        customer,
      });
    }
  }
  console.log(`Seeded ${unlinkedThemes.reduce((s, t) => s + t.count, 0)} additional unlinked clusterable tickets across ${unlinkedThemes.length} themes for the live "detect emerging issues" demo.`);

  // ---- Audit log sample entries ----
  await prisma.auditLog.create({ data: { actorId: superAdmin.id, action: "LOGIN", entity: "User", entityId: superAdmin.id } });
  await prisma.auditLog.create({ data: { actorId: manager.id, action: "CREATE", entity: "AssignmentRule", details: JSON.stringify({ name: "Critical escalation rule" }) } });
  await prisma.auditLog.create({ data: { actorId: manager.id, action: "UPDATE", entity: "SLAPolicy", details: JSON.stringify({ priority: "CRITICAL" }) } });

  console.log("Seed complete.");
  console.log("\nLogin credentials (password for all: Password123!):");
  console.log("  Super Admin:      admin@ticketsense.io");
  console.log("  Support Manager:  manager@ticketsense.io");
  console.log("  Support Agent:    agent1@ticketsense.io");
  console.log("  Readonly Analyst: analyst@ticketsense.io");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
