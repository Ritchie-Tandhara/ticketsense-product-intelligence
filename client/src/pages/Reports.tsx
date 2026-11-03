import { Link } from "react-router-dom";
import { Download } from "lucide-react";
import { useFetch } from "../hooks/useFetch";
import { downloadCsv } from "../lib/csv";
import { Button, Card, EmptyState, ErrorState, Loading } from "../components/ui";

interface AgentPerf {
  agentId: string;
  name: string;
  total: number;
  resolved: number;
  breached: number;
}
interface CategoryAgg {
  category: string;
  count: number;
}

export function Reports() {
  const agentPerf = useFetch<{ data: AgentPerf[] }>("/analytics/agent-performance");
  const byCategory = useFetch<{ data: CategoryAgg[] }>("/analytics/by-category");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="text-slate-500 text-sm">Computed from real stored ticket data, with CSV export and drill-down links.</p>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Agent Productivity</h2>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => agentPerf.data && downloadCsv("agent-productivity.csv", agentPerf.data.data as any)}
          >
            <Download size={14} /> Export CSV
          </Button>
        </div>
        <Card className="overflow-hidden">
          {agentPerf.loading ? (
            <Loading />
          ) : agentPerf.error ? (
            <ErrorState message={agentPerf.error} />
          ) : !agentPerf.data || agentPerf.data.data.length === 0 ? (
            <EmptyState label="No agent activity yet." />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2">Agent</th>
                  <th className="px-3 py-2">Total Tickets</th>
                  <th className="px-3 py-2">Resolved</th>
                  <th className="px-3 py-2">SLA Breaches</th>
                  <th className="px-3 py-2">Drill down</th>
                </tr>
              </thead>
              <tbody>
                {agentPerf.data.data.map((a) => (
                  <tr key={a.agentId} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-3 py-2">{a.name}</td>
                    <td className="px-3 py-2">{a.total}</td>
                    <td className="px-3 py-2">{a.resolved}</td>
                    <td className="px-3 py-2">{a.breached}</td>
                    <td className="px-3 py-2">
                      <Link to={`/tickets?agentId=${a.agentId}`} className="text-brand-600 hover:underline text-xs">
                        View tickets →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Category Bottlenecks</h2>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => byCategory.data && downloadCsv("category-bottlenecks.csv", byCategory.data.data as any)}
          >
            <Download size={14} /> Export CSV
          </Button>
        </div>
        <Card className="overflow-hidden">
          {byCategory.loading ? (
            <Loading />
          ) : byCategory.error ? (
            <ErrorState message={byCategory.error} />
          ) : !byCategory.data || byCategory.data.data.length === 0 ? (
            <EmptyState label="No category data yet." />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">Ticket Count</th>
                  <th className="px-3 py-2">Drill down</th>
                </tr>
              </thead>
              <tbody>
                {byCategory.data.data.map((c) => (
                  <tr key={c.category} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-3 py-2">{c.category}</td>
                    <td className="px-3 py-2">{c.count}</td>
                    <td className="px-3 py-2">
                      <Link to="/tickets" className="text-brand-600 hover:underline text-xs">
                        View tickets →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">SLA Compliance</h2>
        <p className="text-sm text-slate-500">See the full breach list and trend chart under <Link to="/sla" className="text-brand-600 hover:underline">SLA Management</Link>.</p>
      </section>
    </div>
  );
}
