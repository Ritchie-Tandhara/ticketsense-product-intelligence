import { useState } from "react";
import { Link } from "react-router-dom";
import { useFetch } from "../hooks/useFetch";
import { api, ApiRequestError } from "../lib/api";
import { ProductIssue, PaginatedResponse } from "../types";
import { Card, Button, Loading, ErrorState, EmptyState, Pagination } from "../components/ui";
import { Dna, Users, Ticket as TicketIcon } from "lucide-react";
import { useToast } from "../context/ToastContext";

const SEVERITY_COLORS: Record<string, string> = {
  LOW: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  MEDIUM: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  HIGH: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  CRITICAL: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
};

const STATUS_COLORS: Record<string, string> = {
  DETECTED: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  UNDER_REVIEW: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
  CONFIRMED: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  PLANNED: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  IN_DEVELOPMENT: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  RELEASED: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
  MONITORING: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300",
  RESOLVED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  REOPENED: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
};

export function IssueGenome() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [running, setRunning] = useState(false);
  const toast = useToast();

  const issues = useFetch<PaginatedResponse<ProductIssue>>(
    `/issues?page=${page}&pageSize=20${statusFilter ? `&status=${statusFilter}` : ""}`,
    [page, statusFilter]
  );

  async function runClustering() {
    setRunning(true);
    try {
      const res = await api.post<{ issuesCreated: number; ticketsConsidered?: number }>("/issues/detect-clustering");
      toast.show(`Clustering run complete: ${res.issuesCreated} new issue(s) detected.`, "success");
      issues.refetch();
    } catch (e) {
      toast.show(e instanceof ApiRequestError ? e.message : "Clustering run failed", "error");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Dna size={24} className="text-brand-600" /> Issue Genome
          </h1>
          <p className="text-slate-500 text-sm">
            Recurring-problem detection: tickets are grouped by a deterministic text-similarity score (Jaccard over word
            bigrams), not an AI "confidence" score. See the Help Guide / docs for the exact formula.
          </p>
        </div>
        <Button onClick={runClustering} disabled={running}>
          {running ? "Running..." : "Detect emerging issues"}
        </Button>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <span className="text-slate-500">Status:</span>
        {["", "DETECTED", "UNDER_REVIEW", "CONFIRMED", "PLANNED", "IN_DEVELOPMENT", "RELEASED", "MONITORING", "RESOLVED", "REOPENED"].map((s) => (
          <button
            key={s}
            onClick={() => {
              setStatusFilter(s);
              setPage(1);
            }}
            className={`px-2.5 py-1 rounded-full text-xs font-medium ${
              statusFilter === s ? "bg-brand-600 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
            }`}
          >
            {s === "" ? "All" : s.replace("_", " ")}
          </button>
        ))}
      </div>

      <Card className="overflow-hidden">
        {issues.loading ? (
          <Loading />
        ) : issues.error ? (
          <ErrorState message={issues.error} />
        ) : !issues.data || issues.data.data.length === 0 ? (
          <EmptyState label='No issues yet — click "Detect emerging issues" to run clustering over unlinked tickets.' />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2">Title</th>
                <th className="px-3 py-2">Product Area</th>
                <th className="px-3 py-2">Severity</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Tickets</th>
                <th className="px-3 py-2">Customers</th>
                <th className="px-3 py-2">Last Seen</th>
              </tr>
            </thead>
            <tbody>
              {issues.data.data.map((issue) => (
                <tr key={issue.id} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="px-3 py-2">
                    <Link to={`/issue-genome/${issue.id}`} className="text-brand-600 hover:underline font-medium">
                      {issue.title}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-slate-500">{issue.productArea}</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${SEVERITY_COLORS[issue.severity]}`}>{issue.severity}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[issue.status]}`}>{issue.status.replace("_", " ")}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1"><TicketIcon size={14} />{issue.relatedTicketCount ?? 0}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1"><Users size={14} />{issue.uniqueCustomers ?? 0}</span>
                  </td>
                  <td className="px-3 py-2 text-slate-500">{new Date(issue.lastSeenAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {issues.data && (
          <div className="px-4">
            <Pagination page={issues.data.pagination.page} totalPages={issues.data.pagination.totalPages} onChange={setPage} />
          </div>
        )}
      </Card>
    </div>
  );
}
