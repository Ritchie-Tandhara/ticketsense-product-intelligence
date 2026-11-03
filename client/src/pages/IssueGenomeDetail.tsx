import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useFetch } from "../hooks/useFetch";
import { api, ApiRequestError } from "../lib/api";
import { ProductIssue, PaginatedResponse, Ticket } from "../types";
import { Card, Button, Loading, ErrorState, Input, Textarea, Modal, Select } from "../components/ui";
import { useToast } from "../context/ToastContext";
import { ArrowLeft, GitMerge, Scissors, Link2, Unlink, CheckCircle2, Sparkles } from "lucide-react";

export function IssueGenomeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const issue = useFetch<ProductIssue>(`/issues/${id}`);
  const otherIssues = useFetch<PaginatedResponse<ProductIssue>>("/issues?pageSize=100");
  const allTickets = useFetch<PaginatedResponse<Ticket>>("/tickets?pageSize=100");

  const [note, setNote] = useState("");
  const [linkModal, setLinkModal] = useState(false);
  const [mergeModal, setMergeModal] = useState(false);
  const [splitModal, setSplitModal] = useState(false);
  const [linkTicketId, setLinkTicketId] = useState("");
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [splitTicketIds, setSplitTicketIds] = useState<string[]>([]);
  const [splitTitle, setSplitTitle] = useState("");
  const [busy, setBusy] = useState(false);

  if (issue.loading) return <Loading />;
  if (issue.error || !issue.data) return <ErrorState message={issue.error ?? "Issue not found"} />;
  const data = issue.data;

  async function transition(status: string) {
    setBusy(true);
    try {
      await api.post(`/issues/${id}/transition`, { status, note: note || undefined });
      toast.show(`Issue moved to ${status.replace("_", " ")}.`, "success");
      setNote("");
      issue.refetch();
    } catch (e) {
      toast.show(e instanceof ApiRequestError ? e.message : "Transition failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function linkTicket() {
    if (!linkTicketId) return;
    try {
      await api.post(`/issues/${id}/link-ticket`, { ticketId: linkTicketId });
      toast.show("Ticket linked.", "success");
      setLinkModal(false);
      setLinkTicketId("");
      issue.refetch();
    } catch (e) {
      toast.show(e instanceof ApiRequestError ? e.message : "Link failed", "error");
    }
  }

  async function unlinkTicket(ticketId: string) {
    try {
      await api.post(`/issues/${id}/unlink-ticket`, { ticketId });
      toast.show("Ticket unlinked.", "success");
      issue.refetch();
    } catch (e) {
      toast.show(e instanceof ApiRequestError ? e.message : "Unlink failed", "error");
    }
  }

  async function merge() {
    if (!mergeTargetId) return;
    try {
      await api.post("/issues/merge", { sourceIssueId: id, targetIssueId: mergeTargetId });
      toast.show("Issue merged.", "success");
      navigate(`/issue-genome/${mergeTargetId}`);
    } catch (e) {
      toast.show(e instanceof ApiRequestError ? e.message : "Merge failed", "error");
    }
  }

  async function split() {
    if (splitTicketIds.length === 0 || !splitTitle) return;
    try {
      const res = await api.post<{ newIssue: ProductIssue }>(`/issues/${id}/split`, {
        ticketIds: splitTicketIds,
        newIssue: { title: splitTitle, description: `Split off from "${data.title}".`, productArea: data.productArea },
      });
      toast.show("Issue split created.", "success");
      setSplitModal(false);
      navigate(`/issue-genome/${res.newIssue.id}`);
    } catch (e) {
      toast.show(e instanceof ApiRequestError ? e.message : "Split failed", "error");
    }
  }

  async function generateDraft() {
    try {
      const res = await api.post<{ id: string }>(`/issues/${id}/work-items/generate-draft`);
      toast.show("Draft work item generated — review before approving.", "success");
      navigate(`/product-roadmap/${res.id}`);
    } catch (e) {
      toast.show(e instanceof ApiRequestError ? e.message : "Could not generate draft", "error");
    }
  }

  const linkedTicketIds = new Set((data.supportingTickets ?? []).map((t) => t.id));
  const linkableTickets = (allTickets.data?.data ?? []).filter((t) => !linkedTicketIds.has(t.id));

  return (
    <div className="space-y-6">
      <Link to="/issue-genome" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
        <ArrowLeft size={14} /> Back to Issue Genome
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{data.title}</h1>
          <p className="text-slate-500 text-sm mt-1">{data.description}</p>
          <div className="flex gap-2 mt-2 text-xs">
            <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800">{data.productArea}</span>
            <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800">{data.severity}</span>
            <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800">{data.status.replace("_", " ")}</span>
          </div>
        </div>
        <div className="flex flex-col gap-2 items-end">
          <Link to={`/impact-simulator/${id}`}><Button size="sm" variant="secondary">Fix Impact Simulator</Button></Link>
          <Button size="sm" onClick={generateDraft}><Sparkles size={14} /> Generate work item draft</Button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card className="p-4"><div className="text-xs text-slate-500">Related tickets</div><div className="text-2xl font-bold">{data.relatedTicketCount}</div></Card>
        <Card className="p-4"><div className="text-xs text-slate-500">Unique customers</div><div className="text-2xl font-bold">{data.uniqueCustomers}</div></Card>
        <Card className="p-4"><div className="text-xs text-slate-500">First seen</div><div className="text-sm font-medium">{new Date(data.firstSeenAt).toLocaleDateString()}</div></Card>
        <Card className="p-4"><div className="text-xs text-slate-500">Last seen</div><div className="text-sm font-medium">{new Date(data.lastSeenAt).toLocaleDateString()}</div></Card>
      </div>

      <Card className="p-4">
        <h3 className="font-semibold mb-2">AI analysis: similarity grouping</h3>
        <p className="text-sm text-slate-500">{data.similarityExplanation}</p>
        {data.commonSymptoms && data.commonSymptoms.length > 0 && (
          <div className="mt-3">
            <div className="text-xs text-slate-500 mb-1">Common symptoms (extracted from ticket text)</div>
            <div className="flex flex-wrap gap-1.5">
              {data.commonSymptoms.map((s) => (
                <span key={s} className="px-2 py-0.5 rounded-full text-xs bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400">{s}</span>
              ))}
            </div>
          </div>
        )}
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Status workflow</h3>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setLinkModal(true)}><Link2 size={14} /> Link ticket</Button>
            <Button size="sm" variant="secondary" onClick={() => setMergeModal(true)}><GitMerge size={14} /> Merge</Button>
            <Button size="sm" variant="secondary" onClick={() => setSplitModal(true)}><Scissors size={14} /> Split</Button>
          </div>
        </div>
        {(data.allowedNextStatuses ?? []).includes("CONFIRMED") && (
          <div className="mb-2">
            <Textarea placeholder="Required note when confirming (e.g. why this is a real, recurring issue)..." value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>
        )}
        <div className="flex gap-2 flex-wrap">
          {(data.allowedNextStatuses ?? []).map((s) => (
            <Button key={s} size="sm" disabled={busy} onClick={() => transition(s)}>
              <CheckCircle2 size={14} /> Move to {s.replace("_", " ")}
            </Button>
          ))}
          {(data.allowedNextStatuses ?? []).length === 0 && <span className="text-sm text-slate-400">No further transitions.</span>}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 font-semibold text-sm">Supporting tickets ({data.supportingTickets?.length ?? 0})</div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/50 text-left text-xs text-slate-500">
            <tr><th className="px-3 py-2">Ticket</th><th className="px-3 py-2">Requester</th><th className="px-3 py-2">Priority</th><th className="px-3 py-2">Created</th><th className="px-3 py-2"></th></tr>
          </thead>
          <tbody>
            {(data.supportingTickets ?? []).map((t) => (
              <tr key={t.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-3 py-2"><Link to={`/tickets/${t.id}`} className="text-brand-600 hover:underline">#{t.ticketNumber} {t.subject}</Link></td>
                <td className="px-3 py-2 text-slate-500">{t.requesterName}</td>
                <td className="px-3 py-2">{t.priority}</td>
                <td className="px-3 py-2 text-slate-500">{new Date(t.createdAt).toLocaleDateString()}</td>
                <td className="px-3 py-2"><button onClick={() => unlinkTicket(t.id)} title="Unlink" className="text-slate-400 hover:text-rose-600"><Unlink size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {data.workItems && data.workItems.length > 0 && (
        <Card className="p-4">
          <h3 className="font-semibold mb-2">Linked work items</h3>
          <div className="flex flex-col gap-1">
            {data.workItems.map((wi) => (
              <Link key={wi.id} to={`/product-roadmap/${wi.id}`} className="text-brand-600 hover:underline text-sm">{wi.title} — {wi.status.replace("_", " ")}</Link>
            ))}
          </div>
        </Card>
      )}

      <Modal open={linkModal} onClose={() => setLinkModal(false)} title="Link a ticket to this issue" footer={<><Button variant="secondary" onClick={() => setLinkModal(false)}>Cancel</Button><Button onClick={linkTicket}>Link</Button></>}>
        <Select value={linkTicketId} onChange={setLinkTicketId}>
          <option value="">Select a ticket...</option>
          {linkableTickets.map((t) => <option key={t.id} value={t.id}>#{t.ticketNumber} {t.subject}</option>)}
        </Select>
      </Modal>

      <Modal open={mergeModal} onClose={() => setMergeModal(false)} title="Merge this issue into another" footer={<><Button variant="secondary" onClick={() => setMergeModal(false)}>Cancel</Button><Button onClick={merge}>Merge</Button></>}>
        <p className="text-sm text-slate-500 mb-2">All ticket links will move to the target issue. History is preserved on both sides.</p>
        <Select value={mergeTargetId} onChange={setMergeTargetId}>
          <option value="">Select target issue...</option>
          {(otherIssues.data?.data ?? []).filter((i) => i.id !== id).map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}
        </Select>
      </Modal>

      <Modal open={splitModal} onClose={() => setSplitModal(false)} title="Split tickets into a new issue" footer={<><Button variant="secondary" onClick={() => setSplitModal(false)}>Cancel</Button><Button onClick={split}>Create split</Button></>}>
        <div className="space-y-3">
          <Input placeholder="New issue title" value={splitTitle} onChange={(e) => setSplitTitle(e.target.value)} />
          <div className="max-h-48 overflow-y-auto space-y-1">
            {(data.supportingTickets ?? []).map((t) => (
              <label key={t.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={splitTicketIds.includes(t.id)}
                  onChange={(e) =>
                    setSplitTicketIds((prev) => (e.target.checked ? [...prev, t.id] : prev.filter((x) => x !== t.id)))
                  }
                />
                #{t.ticketNumber} {t.subject}
              </label>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  );
}
