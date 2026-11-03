import { useState } from "react";
import { Link } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useFetch } from "../hooks/useFetch";
import { api, ApiRequestError } from "../lib/api";
import { useToast } from "../context/ToastContext";
import { SLAPolicy, SLAInstance, Ticket } from "../types";
import { Button, Card, EmptyState, ErrorState, Loading, PriorityBadge } from "../components/ui";

export function SLAManagement() {
  const { show } = useToast();
  const policies = useFetch<{ data: SLAPolicy[] }>("/sla/policies");
  const breaches = useFetch<{ data: (SLAInstance & { ticket: Ticket })[] }>("/sla/breaches");
  const trend = useFetch<{ data: { date: string; compliancePct: number }[] }>("/analytics/sla-compliance-trend");
  const [running, setRunning] = useState(false);

  async function runBreachDetection() {
    setRunning(true);
    try {
      const res = await api.post<{ updated: number }>("/sla/run-breach-detection");
      show(`Breach detection run: ${res.updated} instance(s) updated`, "success");
      breaches.refetch();
    } catch (err) {
      show(err instanceof ApiRequestError ? err.message : "Failed to run breach detection", "error");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">SLA Management</h1>
          <p className="text-slate-500 text-sm">Policies, breach detection, and compliance trend.</p>
        </div>
        <Button onClick={runBreachDetection} disabled={running}>{running ? "Running..." : "Run Breach Detection"}</Button>
      </div>

      <Card className="p-4">
        <div className="font-semibold mb-3 text-sm">SLA Compliance Trend</div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={trend.data?.data ?? []}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
            <Tooltip />
            <Bar dataKey="compliancePct" fill="#10b981" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card className="overflow-hidden">
        <div className="px-4 py-3 font-semibold text-sm border-b border-slate-200 dark:border-slate-800">SLA Policies</div>
        {policies.loading ? (
          <Loading />
        ) : policies.error ? (
          <ErrorState message={policies.error} />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2">Priority</th>
                <th className="px-3 py-2">First Response Target</th>
                <th className="px-3 py-2">Resolution Target</th>
                <th className="px-3 py-2">Business Hours Only</th>
              </tr>
            </thead>
            <tbody>
              {policies.data?.data.map((p) => (
                <tr key={p.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-3 py-2"><PriorityBadge priority={p.priority} /></td>
                  <td className="px-3 py-2">{p.firstResponseTargetMin} min</td>
                  <td className="px-3 py-2">{p.resolutionTargetMin} min</td>
                  <td className="px-3 py-2">{p.businessHoursOnly ? "Yes (9am-6pm Mon-Fri)" : "No (24x7)"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="px-4 py-3 font-semibold text-sm border-b border-slate-200 dark:border-slate-800">Breached Tickets</div>
        {breaches.loading ? (
          <Loading />
        ) : breaches.error ? (
          <ErrorState message={breaches.error} />
        ) : !breaches.data || breaches.data.data.length === 0 ? (
          <EmptyState label="No SLA breaches." />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2">Ticket</th>
                <th className="px-3 py-2">Priority</th>
                <th className="px-3 py-2">First Response Breached</th>
                <th className="px-3 py-2">Resolution Breached</th>
                <th className="px-3 py-2">Resolution Due</th>
              </tr>
            </thead>
            <tbody>
              {breaches.data.data.map((b) => (
                <tr key={b.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-3 py-2">
                    <Link to={`/tickets/${b.ticket.id}`} className="text-brand-600 hover:underline">#{b.ticket.ticketNumber} {b.ticket.subject}</Link>
                  </td>
                  <td className="px-3 py-2"><PriorityBadge priority={b.ticket.priority} /></td>
                  <td className="px-3 py-2">{b.firstResponseBreached ? "Yes" : "No"}</td>
                  <td className="px-3 py-2">{b.resolutionBreached ? "Yes" : "No"}</td>
                  <td className="px-3 py-2 text-slate-500">{new Date(b.resolutionDueAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
