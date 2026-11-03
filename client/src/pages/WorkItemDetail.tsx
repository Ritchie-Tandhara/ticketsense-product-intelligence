import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useFetch } from "../hooks/useFetch";
import { api, ApiRequestError } from "../lib/api";
import { WorkItem } from "../types";
import { Card, Button, Loading, ErrorState, Textarea } from "../components/ui";
import { useToast } from "../context/ToastContext";
import { ArrowLeft, Download, History } from "lucide-react";

const FIELDS: { key: keyof WorkItem; label: string }[] = [
  { key: "businessProblem", label: "Business Problem" },
  { key: "problemDescription", label: "Problem Description" },
  { key: "customerImpact", label: "Customer Impact" },
  { key: "observedSymptoms", label: "Observed Symptoms" },
  { key: "rootCause", label: "Root Cause (hypothesis unless confirmed)" },
  { key: "reproductionSteps", label: "Reproduction Steps" },
  { key: "expectedBehavior", label: "Expected Behavior" },
  { key: "actualBehavior", label: "Actual Behavior" },
  { key: "proposedSolution", label: "Proposed Solution" },
  { key: "userStory", label: "User Story" },
  { key: "acceptanceCriteria", label: "Acceptance Criteria (Gherkin)" },
  { key: "edgeCases", label: "Edge Cases" },
  { key: "assumptions", label: "Assumptions" },
  { key: "openQuestions", label: "Open Questions" },
];

export function WorkItemDetail() {
  const { id } = useParams();
  const toast = useToast();
  const item = useFetch<WorkItem>(`/work-items/${id}`);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [showHistory, setShowHistory] = useState(false);
  const [busy, setBusy] = useState(false);

  if (item.loading) return <Loading />;
  if (item.error || !item.data) return <ErrorState message={item.error ?? "Work item not found"} />;
  const data = item.data;

  function fieldValue(key: keyof WorkItem) {
    return edits[key] !== undefined ? edits[key] : (data[key] as string) ?? "";
  }

  async function saveEdits() {
    if (Object.keys(edits).length === 0) return;
    setBusy(true);
    try {
      await api.patch(`/work-items/${id}`, edits);
      toast.show("Work item updated (new version recorded).", "success");
      setEdits({});
      item.refetch();
    } catch (e) {
      toast.show(e instanceof ApiRequestError ? e.message : "Update failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function transition(status: string) {
    setBusy(true);
    try {
      await api.post(`/work-items/${id}/transition`, { status });
      toast.show(`Work item moved to ${status.replace("_", " ")}.`, "success");
      item.refetch();
    } catch (e) {
      toast.show(e instanceof ApiRequestError ? e.message : "Transition failed", "error");
    } finally {
      setBusy(false);
    }
  }

  function exportItem(format: "json" | "csv") {
    window.open(`/api/work-items/${id}/export?format=${format}`, "_blank");
  }

  return (
    <div className="space-y-6">
      <Link to="/product-roadmap" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
        <ArrowLeft size={14} /> Back to Product Roadmap
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{data.title}</h1>
          {data.aiDisclaimer && <p className="text-xs text-amber-600 mt-1">{data.aiDisclaimer}</p>}
          <div className="flex gap-2 mt-2 text-xs">
            <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800">{data.productArea}</span>
            <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800">{data.status.replace("_", " ")}</span>
            <Link to={`/issue-genome/${data.issueId}`} className="px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400 hover:underline">
              Source issue
            </Link>
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => exportItem("json")}><Download size={14} /> JSON</Button>
          <Button size="sm" variant="secondary" onClick={() => exportItem("csv")}><Download size={14} /> CSV</Button>
          <Button size="sm" variant="secondary" onClick={() => setShowHistory((s) => !s)}><History size={14} /> Versions ({data.versions?.length ?? 0})</Button>
        </div>
      </div>

      {showHistory && (
        <Card className="p-4">
          <h3 className="font-semibold mb-2">Edit history</h3>
          {(data.versions ?? []).length === 0 ? (
            <p className="text-sm text-slate-400">No edits yet.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {data.versions!.map((v) => (
                <li key={v.id} className="text-slate-500">{new Date(v.editedAt).toLocaleString()} — edited by {v.editedBy?.name ?? "unknown"}</li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Approval workflow</h3>
          <div className="flex gap-2">
            {(data.allowedNextStatuses ?? []).map((s) => (
              <Button key={s} size="sm" variant={s === "REJECTED" ? "danger" : "primary"} disabled={busy} onClick={() => transition(s)}>
                {s.replace("_", " ")}
              </Button>
            ))}
            {(data.allowedNextStatuses ?? []).length === 0 && <span className="text-sm text-slate-400">No further transitions (terminal state).</span>}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-4">
        {FIELDS.map((f) => (
          <Card key={f.key} className="p-4">
            <div className="text-xs font-semibold text-slate-500 mb-1">{f.label}</div>
            <Textarea rows={f.key === "acceptanceCriteria" ? 8 : 3} value={fieldValue(f.key)} onChange={(e) => setEdits((prev) => ({ ...prev, [f.key]: e.target.value }))} />
          </Card>
        ))}
      </div>
      <Button onClick={saveEdits} disabled={busy || Object.keys(edits).length === 0}>Save changes</Button>
    </div>
  );
}
