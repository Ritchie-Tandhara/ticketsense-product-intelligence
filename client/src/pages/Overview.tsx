import { useState } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { useFetch } from "../hooks/useFetch";
import { Card, Loading, ErrorState, Select } from "../components/ui";
import { KpiResponse, Team, Category, User } from "../types";

const COLORS = ["#4f46e5", "#0ea5e9", "#f59e0b", "#ef4444", "#10b981", "#8b5cf6"];

function buildQuery(filters: Record<string, string>) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v) params.set(k, v);
  });
  return params.toString();
}

export function Overview() {
  const [filters, setFilters] = useState({ teamId: "", agentId: "", categoryId: "", priority: "", from: "", to: "" });
  const qs = buildQuery(filters);

  const kpis = useFetch<KpiResponse>(`/analytics/kpis?${qs}`, [qs]);
  const volume = useFetch<{ data: { date: string; count: number }[] }>(`/analytics/volume-trend?${qs}`, [qs]);
  const byPriority = useFetch<{ data: { priority: string; count: number }[] }>(`/analytics/by-priority?${qs}`, [qs]);
  const byCategory = useFetch<{ data: { category: string; count: number }[] }>(`/analytics/by-category?${qs}`, [qs]);
  const slaTrend = useFetch<{ data: { date: string; compliancePct: number }[] }>(`/analytics/sla-compliance-trend?${qs}`, [qs]);
  const backlog = useFetch<{ data: { bucket: string; count: number }[] }>(`/analytics/backlog-aging?${qs}`, [qs]);

  const teams = useFetch<{ data: Team[] }>("/admin/teams");
  const categories = useFetch<{ data: Category[] }>("/admin/categories");
  const agents = useFetch<{ data: User[] }>("/admin/users");

  if (kpis.loading) return <Loading label="Loading dashboard..." />;
  if (kpis.error || !kpis.data) return <ErrorState message={kpis.error ?? "No data"} />;

  const k = kpis.data;

  const cards: { label: string; value: string | number; tone?: string }[] = [
    { label: "Total Tickets", value: k.total },
    { label: "Open", value: k.open },
    { label: "Resolved", value: k.resolved },
    { label: "Pending", value: k.pending },
    { label: "Unassigned", value: k.unassigned, tone: k.unassigned > 0 ? "text-amber-600" : undefined },
    { label: "Critical", value: k.critical, tone: k.critical > 0 ? "text-rose-600" : undefined },
    { label: "SLA At Risk", value: k.slaAtRisk, tone: k.slaAtRisk > 0 ? "text-amber-600" : undefined },
    { label: "SLA Breached", value: k.slaBreached, tone: k.slaBreached > 0 ? "text-rose-600" : undefined },
    { label: "Avg First Response", value: `${k.avgFirstResponseMin}m` },
    { label: "Avg Resolution", value: `${k.avgResolutionMin}m` },
    { label: "FCR Rate", value: `${k.fcrRate}%` },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Overview</h1>
        <p className="text-slate-500 text-sm">
          Real-time support-ops KPIs computed from stored ticket &amp; SLA data — the operational foundation beneath
          the Issue Genome / Impact Simulator / Product Roadmap / Resolution Intelligence product-intelligence layer.
        </p>
      </div>

      <Card className="p-4 flex flex-wrap gap-3 items-center">
        <Select value={filters.teamId} onChange={(v) => setFilters((f) => ({ ...f, teamId: v }))}>
          <option value="">All Teams</option>
          {teams.data?.data.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
        <Select value={filters.agentId} onChange={(v) => setFilters((f) => ({ ...f, agentId: v }))}>
          <option value="">All Agents</option>
          {agents.data?.data.filter((a) => a.role === "SUPPORT_AGENT").map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
        <Select value={filters.categoryId} onChange={(v) => setFilters((f) => ({ ...f, categoryId: v }))}>
          <option value="">All Categories</option>
          {categories.data?.data.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select value={filters.priority} onChange={(v) => setFilters((f) => ({ ...f, priority: v }))}>
          <option value="">All Priorities</option>
          {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
        <input
          type="date"
          value={filters.from}
          onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
          className="border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-2.5 py-1.5 text-sm"
        />
        <span className="text-slate-400 text-sm">to</span>
        <input
          type="date"
          value={filters.to}
          onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
          className="border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-2.5 py-1.5 text-sm"
        />
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {cards.map((c) => (
          <Card key={c.label} className="p-4">
            <div className="text-xs text-slate-500">{c.label}</div>
            <div className={`text-2xl font-bold mt-1 ${c.tone ?? ""}`}>{c.value}</div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-4">
          <div className="font-semibold mb-3 text-sm">Ticket Volume Trend</div>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={volume.data?.data ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="count" stroke={COLORS[0]} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-4">
          <div className="font-semibold mb-3 text-sm">SLA Compliance Trend</div>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={slaTrend.data?.data ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
              <Tooltip />
              <Line type="monotone" dataKey="compliancePct" stroke={COLORS[4]} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-4">
          <div className="font-semibold mb-3 text-sm">Tickets by Priority</div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={byPriority.data?.data ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="priority" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill={COLORS[1]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-4">
          <div className="font-semibold mb-3 text-sm">Tickets by Category</div>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={byCategory.data?.data ?? []} dataKey="count" nameKey="category" outerRadius={90} label>
                {(byCategory.data?.data ?? []).map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-4 lg:col-span-2">
          <div className="font-semibold mb-3 text-sm">Backlog Aging (Open Tickets)</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={backlog.data?.data ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="bucket" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill={COLORS[3]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
}
