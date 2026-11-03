import { useState, FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Plus, Search } from "lucide-react";
import { useFetch } from "../hooks/useFetch";
import { api, ApiRequestError } from "../lib/api";
import { useToast } from "../context/ToastContext";
import { Category, PaginatedResponse, Team, Ticket, TicketPriority, TicketStatus, User } from "../types";
import { Button, Card, EmptyState, ErrorState, Input, Loading, Modal, Pagination, PriorityBadge, Select, StatusBadge, Textarea } from "../components/ui";

const STATUSES: TicketStatus[] = ["NEW", "OPEN", "IN_PROGRESS", "PENDING", "RESOLVED", "CLOSED"];
const PRIORITIES: TicketPriority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

export function Tickets() {
  const { show } = useToast();
  const [searchParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    status: searchParams.get("status") ?? "",
    priority: searchParams.get("priority") ?? "",
    categoryId: searchParams.get("categoryId") ?? "",
    agentId: searchParams.get("agentId") ?? "",
    search: "",
  });
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortDir, setSortDir] = useState("desc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showCreate, setShowCreate] = useState(false);

  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", "15");
  params.set("sortBy", sortBy);
  params.set("sortDir", sortDir);
  Object.entries(filters).forEach(([k, v]) => v && params.set(k, v));

  const tickets = useFetch<PaginatedResponse<Ticket>>(`/tickets?${params.toString()}`, [params.toString(), page]);
  const categories = useFetch<{ data: Category[] }>("/admin/categories");
  const agents = useFetch<{ data: User[] }>("/admin/users");

  function toggleSelect(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulkAction(status?: string, assignedAgentId?: string) {
    if (selected.size === 0) return;
    try {
      const res = await api.post<{ results: { ok: boolean }[] }>("/tickets/bulk", {
        ticketIds: Array.from(selected),
        status,
        assignedAgentId,
      });
      const failed = res.results.filter((r) => !r.ok).length;
      show(failed > 0 ? `${res.results.length - failed} succeeded, ${failed} failed` : "Bulk action completed", failed > 0 ? "error" : "success");
      setSelected(new Set());
      tickets.refetch();
    } catch (err) {
      show(err instanceof ApiRequestError ? err.message : "Bulk action failed", "error");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tickets</h1>
          <p className="text-slate-500 text-sm">Filter, search, bulk-manage, and open individual tickets.</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus size={16} /> New Ticket
        </Button>
      </div>

      <Card className="p-4 flex flex-wrap gap-3 items-center">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
          <input
            placeholder="Search subject / requester..."
            value={filters.search}
            onChange={(e) => {
              setPage(1);
              setFilters((f) => ({ ...f, search: e.target.value }));
            }}
            className="pl-8 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-2.5 py-1.5 text-sm w-64"
          />
        </div>
        <Select value={filters.status} onChange={(v) => { setPage(1); setFilters((f) => ({ ...f, status: v })); }}>
          <option value="">All Statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </Select>
        <Select value={filters.priority} onChange={(v) => { setPage(1); setFilters((f) => ({ ...f, priority: v })); }}>
          <option value="">All Priorities</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </Select>
        <Select value={filters.categoryId} onChange={(v) => { setPage(1); setFilters((f) => ({ ...f, categoryId: v })); }}>
          <option value="">All Categories</option>
          {categories.data?.data.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
        <Select value={filters.agentId} onChange={(v) => { setPage(1); setFilters((f) => ({ ...f, agentId: v })); }}>
          <option value="">All Agents</option>
          {agents.data?.data.filter((a) => a.role === "SUPPORT_AGENT").map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </Select>
        <Select value={sortBy} onChange={setSortBy}>
          <option value="createdAt">Sort: Created</option>
          <option value="priority">Sort: Priority</option>
          <option value="status">Sort: Status</option>
          <option value="ticketNumber">Sort: Ticket #</option>
        </Select>
        <Select value={sortDir} onChange={setSortDir}>
          <option value="desc">Descending</option>
          <option value="asc">Ascending</option>
        </Select>
      </Card>

      {selected.size > 0 && (
        <Card className="p-3 flex items-center gap-3 bg-brand-50 dark:bg-brand-500/10 border-brand-200">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <Select value="" onChange={(v) => v && bulkAction(v)} className="w-auto">
            <option value="">Bulk status change...</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </Select>
          <Select value="" onChange={(v) => v && bulkAction(undefined, v)} className="w-auto">
            <option value="">Bulk assign to...</option>
            {agents.data?.data.filter((a) => a.role === "SUPPORT_AGENT").map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </Select>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Clear</Button>
        </Card>
      )}

      <Card className="overflow-hidden">
        {tickets.loading ? (
          <Loading />
        ) : tickets.error ? (
          <ErrorState message={tickets.error} />
        ) : !tickets.data || tickets.data.data.length === 0 ? (
          <EmptyState label="No tickets match your filters." />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2"></th>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Subject</th>
                <th className="px-3 py-2">Requester</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Priority</th>
                <th className="px-3 py-2">Agent</th>
                <th className="px-3 py-2">Created</th>
              </tr>
            </thead>
            <tbody>
              {tickets.data.data.map((t) => (
                <tr key={t.id} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="px-3 py-2">
                    <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggleSelect(t.id)} />
                  </td>
                  <td className="px-3 py-2">
                    <Link to={`/tickets/${t.id}`} className="text-brand-600 font-medium hover:underline">
                      #{t.ticketNumber}
                    </Link>
                  </td>
                  <td className="px-3 py-2 max-w-xs truncate">{t.subject}</td>
                  <td className="px-3 py-2">{t.requesterName}</td>
                  <td className="px-3 py-2"><StatusBadge status={t.status} /></td>
                  <td className="px-3 py-2"><PriorityBadge priority={t.priority} /></td>
                  <td className="px-3 py-2">{t.assignedAgent?.name ?? <span className="text-slate-400">Unassigned</span>}</td>
                  <td className="px-3 py-2 text-slate-500">{new Date(t.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tickets.data && (
          <div className="px-4">
            <Pagination page={tickets.data.pagination.page} totalPages={tickets.data.pagination.totalPages} onChange={setPage} />
          </div>
        )}
      </Card>

      <CreateTicketModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => {
          setShowCreate(false);
          tickets.refetch();
        }}
      />
    </div>
  );
}

function CreateTicketModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { show } = useToast();
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [requesterName, setRequesterName] = useState("");
  const [requesterEmail, setRequesterEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/tickets", { subject, description, requesterName, requesterEmail });
      show("Ticket created and auto-classified", "success");
      setSubject("");
      setDescription("");
      setRequesterName("");
      setRequesterEmail("");
      onCreated();
    } catch (err) {
      show(err instanceof ApiRequestError ? err.message : "Failed to create ticket", "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New Ticket">
      <form onSubmit={handleSubmit} className="space-y-3">
        <Input placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} required />
        <Textarea placeholder="Description" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} required />
        <Input placeholder="Requester name" value={requesterName} onChange={(e) => setRequesterName(e.target.value)} required />
        <Input placeholder="Requester email" type="email" value={requesterEmail} onChange={(e) => setRequesterEmail(e.target.value)} required />
        <p className="text-xs text-slate-500">Priority and category will be auto-suggested by the deterministic AI classifier.</p>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={submitting}>{submitting ? "Creating..." : "Create Ticket"}</Button>
        </div>
      </form>
    </Modal>
  );
}
