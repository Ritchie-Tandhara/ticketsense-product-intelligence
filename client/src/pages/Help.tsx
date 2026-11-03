import { ReactNode, useState } from "react";
import { ChevronDown, HelpCircle } from "lucide-react";
import { Card } from "../components/ui";

type Section = {
  id: string;
  title: string;
  content: ReactNode;
};

const SECTIONS: Section[] = [
  {
    id: "getting-started",
    title: "Getting Started",
    content: (
      <>
        <p>
          TicketSense is an AI-assisted support and ITSM ticketing platform. After logging in, use the sidebar to move
          between modules. What you can see and do depends on your role:
        </p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li><b>Super Admin</b> — full access, including Settings, Team Management, and Assignment Rules.</li>
          <li><b>Support Manager</b> — manages tickets, SLA policies, assignment rules, and reports.</li>
          <li><b>Support Agent</b> — works tickets assigned to them, replies to customers, reviews AI suggestions.</li>
          <li><b>Readonly Analyst</b> — can view dashboards and reports but cannot create or edit records.</li>
        </ul>
      </>
    ),
  },
  {
    id: "overview",
    title: "Overview Dashboard",
    content: (
      <>
        <p>
          The Overview page shows live KPIs (open/resolved/pending tickets, SLA at-risk and breached counts, average
          first-response and resolution times) and trend charts, all computed from real stored ticket data.
        </p>
        <p className="mt-2">
          Use the filters at the top (date range, team, agent, category, priority) to narrow every card and chart to a
          specific slice. KPI formulas and their exact denominators are documented in{" "}
          <code>docs/test-plan-and-traceability.md</code> in the repo.
        </p>
      </>
    ),
  },
  {
    id: "tickets",
    title: "Tickets",
    content: (
      <>
        <p>Create, search, filter, sort, and paginate tickets from the Tickets list. Select multiple rows to bulk-assign or bulk-change status.</p>
        <p className="mt-2">Open a ticket to see:</p>
        <ul className="list-disc pl-5 mt-1 space-y-1">
          <li>Requester details and full conversation timeline (customer replies, agent replies, internal notes).</li>
          <li>The AI recommendation panel — suggested category, sentiment, and priority with a confidence score and plain-language reasoning. Accept, edit, or reject the suggestion; your decision is recorded.</li>
          <li>SLA countdown indicators for first response and resolution.</li>
          <li>Status controls that only allow valid next steps in the lifecycle: New → Open → In Progress → Pending → Resolved → Closed, with a controlled Reopen back to Open from Resolved/Closed.</li>
        </ul>
      </>
    ),
  },
  {
    id: "ai",
    title: "AI Intelligence",
    content: (
      <>
        <p>
          TicketSense classifies tickets using a deterministic, rule-based engine (keyword and signal matching) rather
          than a hosted LLM by default, so it works with no API key configured. The engine produces a category,
          subcategory, sentiment, and priority recommendation with a confidence score and a human-readable reason —
          never a silent, unexplained action.
        </p>
        <p className="mt-2">
          The AI Intelligence page shows recent recommendations across all tickets and the agent acceptance rate, so
          you can judge how well the classifier is performing. A real LLM provider can be plugged in later via{" "}
          <code>server/src/ai/provider.ts</code> — see <code>docs/roadmap.md</code>.
        </p>
      </>
    ),
  },
  {
    id: "assignment",
    title: "Assignment Rules",
    content: (
      <>
        <p>Configure how new tickets get routed to agents. Rules are evaluated in order; the first matching rule wins, and a default fallback rule always catches anything unmatched. Supported strategies:</p>
        <ul className="list-disc pl-5 mt-1 space-y-1">
          <li><b>Round Robin</b> — cycles evenly across available agents.</li>
          <li><b>Least Active Tickets</b> — picks whoever currently has the smallest open workload.</li>
          <li><b>Category-Based</b> — routes by ticket category to a specific team.</li>
          <li><b>Priority-Based escalation</b> — Critical tickets route to a senior agent or escalation team when no one suitable is free.</li>
        </ul>
        <p className="mt-2">Use "Dry Run" on a rule to preview what it would do against a sample ticket before enabling it.</p>
      </>
    ),
  },
  {
    id: "sla",
    title: "SLA Management",
    content: (
      <>
        <p>
          Each priority level has a first-response and resolution target (configurable per policy). Targets are
          calculated business-hours-aware (Mon–Fri, configured working hours and timezone) or 24×7, depending on the
          policy.
        </p>
        <p className="mt-2">
          <b>Reopen rule:</b> reopening a ticket resets its resolution-due clock but keeps the original first-response
          due date, since the customer was already responded to once.
        </p>
        <p className="mt-2">Run "Detect Breaches" to sweep all open SLA instances and flag any that have passed their due time.</p>
      </>
    ),
  },
  {
    id: "kb",
    title: "Knowledge Base",
    content: (
      <>
        <p>Create, edit, and publish/unpublish internal articles. Published articles can be searched by keyword, and a ticket's detail page can suggest relevant articles based on keyword overlap with its description.</p>
      </>
    ),
  },
  {
    id: "reports",
    title: "Reports",
    content: (
      <>
        <p>Agent productivity, SLA compliance, and category-bottleneck reports, computed from real ticket and event data. Export any report to CSV, or click through a drill-down link to see the exact underlying tickets in a filtered list.</p>
      </>
    ),
  },
  {
    id: "teams",
    title: "Team Management",
    content: <p>Create and edit teams, agents, and ticket categories. Changes here affect which options are available when creating tickets or assignment rules.</p>,
  },
  {
    id: "settings",
    title: "Settings",
    content: <p>View your profile and role, switch between light and dark theme, and (for admins) review the audit log of important system changes.</p>,
  },
  {
    id: "faq",
    title: "FAQ & Troubleshooting",
    content: (
      <>
        <ul className="list-disc pl-5 space-y-2">
          <li><b>I can't see Settings or Team Management.</b> These are restricted to Super Admin and Support Manager roles.</li>
          <li><b>A status option is missing from a ticket.</b> Status changes are restricted to valid next steps in the lifecycle — this is enforced by the backend, not just hidden in the UI.</li>
          <li><b>The AI suggestion seems off.</b> Reject or edit it — your decision is logged and the classifier's reasoning is shown so you can judge it, rather than trusting a black box.</li>
          <li><b>Where do I find default login credentials?</b> See the root <code>README.md</code> in the repository.</li>
        </ul>
      </>
    ),
  },
];

export function Help() {
  const [open, setOpen] = useState<string | null>(SECTIONS[0].id);

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-2 mb-1">
        <HelpCircle className="text-brand-600" size={22} />
        <h1 className="text-xl font-semibold">Help Guide</h1>
      </div>
      <p className="text-sm text-slate-500 mb-5">
        A quick reference for every module in TicketSense. Click a section to expand it.
      </p>

      <div className="space-y-2">
        {SECTIONS.map((s) => {
          const isOpen = open === s.id;
          return (
            <Card key={s.id} className="overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-4 py-3 text-left font-medium text-sm"
                onClick={() => setOpen(isOpen ? null : s.id)}
              >
                {s.title}
                <ChevronDown size={16} className={`transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </button>
              {isOpen && (
                <div className="px-4 pb-4 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  {s.content}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
