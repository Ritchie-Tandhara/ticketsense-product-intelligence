import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Clock, Sparkles, CheckCircle2, XCircle, Pencil, UserPlus } from "lucide-react";
import { useFetch } from "../hooks/useFetch";
import { api, ApiRequestError } from "../lib/api";
import { useToast } from "../context/ToastContext";
import { Ticket, AIRecommendation } from "../types";
import { Button, Card, Loading, ErrorState, PriorityBadge, StatusBadge, Select, Textarea } from "../components/ui";

function timeLeft(dueAt: string, breached: boolean) {
  const ms = new Date(dueAt).getTime() - Date.now();
  if (breached) return { text: "Breached", tone: "text-rose-600" };
  if (ms < 0) return { text: "Overdue", tone: "text-rose-600" };
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const mins = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  const tone = ms < 2 * 60 * 60 * 1000 ? "text-amber-600" : "text-emerald-600";
  return { text: `${hours}h ${mins}m left`, tone };
}

export function TicketDetail() {
  const { id } = useParams<{ id: string }>();
  const { show } = useToast();
  const ticket = useFetch<Ticket>(`/tickets/${id}`);
  const [newMessage, setNewMessage] = useState("");
  const [messageType, setMessageType] = useState<"AGENT_REPLY" | "INTERNAL_NOTE">("AGENT_REPLY");
  const [analyzing, setAnalyzing] = useState(false);
  const [assigning, setAssigning] = useState(false);

  if (ticket.loading) return <Loading label="Loading ticket..." />;
  if (ticket.error || !ticket.data) return <ErrorState message={ticket.error ?? "Ticket not found"} />;
  const t = ticket.data;

  async function sendMessage() {
    if (!newMessage.trim()) return;
    try {
      await api.post(`/tickets/${id}/messages`, { body: newMessage, type: messageType });
      setNewMessage("");
      show("Message added", "success");
      ticket.refetch();
    } catch (err) {
      show(err instanceof ApiRequestError ? err.message : "Failed to add message", "error");
    }
  }

  async function changeStatus(status: string) {
    try {
      await api.post(`/tickets/${id}/status`, { status });
      show(`Status changed to ${status}`, "success");
      ticket.refetch();
    } catch (err) {
      show(err instanceof ApiRequestError ? err.message : "Invalid status transition", "error");
    }
  }

  async function runAiAnalysis() {
    setAnalyzing(true);
    try {
      await api.post(`/tickets/${id}/ai-analyze`);
      show("AI analysis complete", "success");
      ticket.refetch();
    } catch (err) {
      show(err instanceof ApiRequestError ? err.message : "AI analysis failed", "error");
    } finally {
      setAnalyzing(false);
    }
  }

  async function autoAssign() {
    setAssigning(true);
    try {
      const res = await api.post<{ reason: string }>(`/tickets/${id}/auto-assign`);
      show(res.reason, "success");
      ticket.refetch();
    } catch (err) {
      show(err instanceof ApiRequestError ? err.message : "Auto-assign failed", "error");
    } finally {
      setAssigning(false);
    }
  }

  async function reviewRecommendation(recId: string, decision: "ACCEPTED" | "REJECTED" | "EDITED", editedValue?: Record<string, unknown>) {
    try {
      await api.post(`/tickets/${id}/ai-recommendations/${recId}/review`, { decision, editedValue });
      show(`Recommendation ${decision.toLowerCase()}`, "success");
      ticket.refetch();
    } catch (err) {
      show(err instanceof ApiRequestError ? err.message : "Review failed", "error");
    }
  }

  const latestRec: AIRecommendation | undefined = t.recommendations?.[0];

  return (
    <div className="space-y-4">
      <Link to="/tickets" className="text-sm text-brand-600 hover:underline">← Back to tickets</Link>

      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-bold">#{t.ticketNumber} — {t.subject}</h1>
          <div className="flex items-center gap-2 mt-2">
            <StatusBadge status={t.status} />
            <PriorityBadge priority={t.priority} />
            {t.sentiment && <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800">{t.sentiment}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value="" onChange={(v) => v && changeStatus(v)} className="w-auto">
            <option value="">Change status...</option>
            {(t.allowedNextStatuses ?? []).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </Select>
          <Button variant="secondary" onClick={autoAssign} disabled={assigning}>
            <UserPlus size={16} /> {assigning ? "Assigning..." : "Auto-Assign"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Card className="p-4">
            <div className="text-xs text-slate-500 mb-1">Requester</div>
            <div className="font-medium">{t.requesterName}</div>
            <div className="text-sm text-slate-500">{t.requesterEmail}</div>
            <div className="text-xs text-slate-500 mt-3 mb-1">Description</div>
            <p className="text-sm">{t.description}</p>
          </Card>

          <Card className="p-4">
            <div className="font-semibold mb-3 text-sm">Conversation</div>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {(t.messages ?? []).length === 0 && <p className="text-sm text-slate-400">No messages yet.</p>}
              {t.messages?.map((m) => (
                <div
                  key={m.id}
                  className={`rounded-lg p-3 text-sm ${
                    m.type === "INTERNAL_NOTE"
                      ? "bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800"
                      : m.type === "CUSTOMER_REPLY"
                        ? "bg-slate-50 dark:bg-slate-800/60"
                        : "bg-brand-50 dark:bg-brand-900/20"
                  }`}
                >
                  <div className="flex justify-between text-xs text-slate-500 mb-1">
                    <span className="font-medium">
                      {m.type === "CUSTOMER_REPLY" ? t.requesterName : m.author?.name ?? "Agent"}
                      {m.type === "INTERNAL_NOTE" && " (internal note)"}
                    </span>
                    <span>{new Date(m.createdAt).toLocaleString()}</span>
                  </div>
                  <p>{m.body}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <Select value={messageType} onChange={(v) => setMessageType(v as "AGENT_REPLY" | "INTERNAL_NOTE")} className="w-auto">
                <option value="AGENT_REPLY">Reply to customer</option>
                <option value="INTERNAL_NOTE">Internal note</option>
              </Select>
            </div>
            <Textarea
              className="mt-2"
              rows={3}
              placeholder="Write a message..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
            />
            <div className="flex justify-end mt-2">
              <Button onClick={sendMessage}>Send</Button>
            </div>
          </Card>

          <Card className="p-4">
            <div className="font-semibold mb-3 text-sm">Activity Timeline</div>
            <ul className="space-y-2 max-h-72 overflow-y-auto">
              {t.events?.map((ev) => (
                <li key={ev.id} className="text-xs text-slate-500 border-l-2 border-slate-200 dark:border-slate-700 pl-3 py-0.5">
                  <span className="font-medium text-slate-700 dark:text-slate-300">{ev.type}</span> — {ev.message}
                  <div>{new Date(ev.createdAt).toLocaleString()}</div>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold text-sm flex items-center gap-1.5"><Sparkles size={16} className="text-brand-600" /> AI Recommendation</div>
              <Button variant="secondary" size="sm" onClick={runAiAnalysis} disabled={analyzing}>
                {analyzing ? "Analyzing..." : "Re-run"}
              </Button>
            </div>
            {!latestRec ? (
              <p className="text-sm text-slate-400">No AI analysis yet.</p>
            ) : (
              <div className="text-sm space-y-2">
                <div>Category: <span className="font-medium">{latestRec.suggestedCategory} / {latestRec.suggestedSubcategory}</span></div>
                <div>Priority: <PriorityBadge priority={latestRec.suggestedPriority ?? ""} /></div>
                <div>Sentiment: <span className="font-medium">{latestRec.suggestedSentiment}</span></div>
                <div>Confidence: <span className="font-medium">{(latestRec.confidence * 100).toFixed(0)}%</span></div>
                <p className="text-xs text-slate-500">{latestRec.reasoning}</p>
                <div className="text-xs font-medium">Status: {latestRec.status}</div>
                {latestRec.status === "PENDING" && (
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" variant="primary" onClick={() => reviewRecommendation(latestRec.id, "ACCEPTED")}>
                      <CheckCircle2 size={14} /> Accept
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => reviewRecommendation(latestRec.id, "REJECTED")}>
                      <XCircle size={14} /> Reject
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        reviewRecommendation(latestRec.id, "EDITED", { suggestedPriority: t.priority === "CRITICAL" ? "HIGH" : "CRITICAL" })
                      }
                    >
                      <Pencil size={14} /> Edit
                    </Button>
                  </div>
                )}
              </div>
            )}
          </Card>

          {t.slaInstance && (
            <Card className="p-4">
              <div className="font-semibold mb-2 text-sm flex items-center gap-1.5"><Clock size={16} /> SLA</div>
              <div className="text-sm space-y-2">
                <div>
                  <div className="text-xs text-slate-500">First response due</div>
                  <div className={timeLeft(t.slaInstance.firstResponseDueAt, t.slaInstance.firstResponseBreached).tone}>
                    {timeLeft(t.slaInstance.firstResponseDueAt, t.slaInstance.firstResponseBreached).text}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Resolution due</div>
                  <div className={timeLeft(t.slaInstance.resolutionDueAt, t.slaInstance.resolutionBreached).tone}>
                    {timeLeft(t.slaInstance.resolutionDueAt, t.slaInstance.resolutionBreached).text}
                  </div>
                </div>
              </div>
            </Card>
          )}

          <Card className="p-4 text-sm space-y-1">
            <div className="font-semibold mb-2">Details</div>
            <div className="text-slate-500">Team: <span className="text-slate-900 dark:text-slate-100">{t.team?.name ?? "—"}</span></div>
            <div className="text-slate-500">Agent: <span className="text-slate-900 dark:text-slate-100">{t.assignedAgent?.name ?? "Unassigned"}</span></div>
            <div className="text-slate-500">Category: <span className="text-slate-900 dark:text-slate-100">{t.category?.name ?? "—"}</span></div>
            <div className="text-slate-500">Reopen count: <span className="text-slate-900 dark:text-slate-100">{t.reopenCount}</span></div>
          </Card>
        </div>
      </div>
    </div>
  );
}
