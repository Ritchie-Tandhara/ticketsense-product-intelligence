import { useState } from "react";
import { Link } from "react-router-dom";
import { useFetch } from "../hooks/useFetch";
import { AIRecommendation, PaginatedResponse } from "../types";
import { Card, Loading, ErrorState, EmptyState, Pagination, PriorityBadge } from "../components/ui";

interface Stats {
  total: number;
  accepted: number;
  rejected: number;
  edited: number;
  pending: number;
  acceptanceRate: number;
  avgConfidence: number;
  lowConfidenceCount: number;
}

export function AIIntelligence() {
  const [page, setPage] = useState(1);
  const stats = useFetch<Stats>("/recommendations/stats");
  const recs = useFetch<PaginatedResponse<AIRecommendation>>(`/recommendations?page=${page}&pageSize=15`, [page]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">AI Intelligence</h1>
        <p className="text-slate-500 text-sm">Recommendations produced by the deterministic classifier, with agent accept/reject/edit history.</p>
      </div>

      {stats.loading ? (
        <Loading />
      ) : stats.error || !stats.data ? (
        <ErrorState message={stats.error ?? "No data"} />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4"><div className="text-xs text-slate-500">Total Recommendations</div><div className="text-2xl font-bold">{stats.data.total}</div></Card>
          <Card className="p-4"><div className="text-xs text-slate-500">Acceptance Rate</div><div className="text-2xl font-bold text-emerald-600">{stats.data.acceptanceRate}%</div></Card>
          <Card className="p-4"><div className="text-xs text-slate-500">Avg Confidence</div><div className="text-2xl font-bold">{(stats.data.avgConfidence * 100).toFixed(0)}%</div></Card>
          <Card className="p-4"><div className="text-xs text-slate-500">Low Confidence (&lt;60%)</div><div className="text-2xl font-bold text-amber-600">{stats.data.lowConfidenceCount}</div></Card>
          <Card className="p-4"><div className="text-xs text-slate-500">Accepted</div><div className="text-xl font-semibold text-emerald-600">{stats.data.accepted}</div></Card>
          <Card className="p-4"><div className="text-xs text-slate-500">Rejected</div><div className="text-xl font-semibold text-rose-600">{stats.data.rejected}</div></Card>
          <Card className="p-4"><div className="text-xs text-slate-500">Edited</div><div className="text-xl font-semibold text-amber-600">{stats.data.edited}</div></Card>
          <Card className="p-4"><div className="text-xs text-slate-500">Pending Review</div><div className="text-xl font-semibold">{stats.data.pending}</div></Card>
        </div>
      )}

      <Card className="overflow-hidden">
        {recs.loading ? (
          <Loading />
        ) : recs.error ? (
          <ErrorState message={recs.error} />
        ) : !recs.data || recs.data.data.length === 0 ? (
          <EmptyState label="No AI recommendations yet." />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2">Ticket</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Priority</th>
                <th className="px-3 py-2">Confidence</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Created</th>
              </tr>
            </thead>
            <tbody>
              {recs.data.data.map((r) => (
                <tr key={r.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-3 py-2">
                    <Link to={`/tickets/${r.ticketId}`} className="text-brand-600 hover:underline">
                      #{r.ticket?.ticketNumber ?? r.ticketId.slice(0, 6)}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{r.suggestedCategory} / {r.suggestedSubcategory}</td>
                  <td className="px-3 py-2"><PriorityBadge priority={r.suggestedPriority ?? ""} /></td>
                  <td className="px-3 py-2">{(r.confidence * 100).toFixed(0)}%</td>
                  <td className="px-3 py-2">{r.status}</td>
                  <td className="px-3 py-2 text-slate-500">{new Date(r.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {recs.data && (
          <div className="px-4">
            <Pagination page={recs.data.pagination.page} totalPages={recs.data.pagination.totalPages} onChange={setPage} />
          </div>
        )}
      </Card>
    </div>
  );
}
