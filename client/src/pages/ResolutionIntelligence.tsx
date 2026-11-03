import { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { useFetch } from "../hooks/useFetch";
import { api, ApiRequestError } from "../lib/api";
import { PaginatedResponse, ProductIssue, Release, ResolutionMeasurement } from "../types";
import { Card, Button, Loading, ErrorState, EmptyState, Input, Select, Modal } from "../components/ui";
import { useToast } from "../context/ToastContext";
import { Rocket, CheckCircle2, RotateCcw, Plus, Link2 } from "lucide-react";

const OUTCOME_COLORS: Record<string, string> = {
  IMPROVING: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  NO_MATERIAL_CHANGE: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  WORSENING: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  INSUFFICIENT_DATA: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
};

const OUTCOME_EXPLANATION: Record<string, string> = {
  IMPROVING: "Ticket volume dropped by 40% or more between the pre- and post-release windows.",
  NO_MATERIAL_CHANGE: "Change was within +/-15% — not a meaningful shift either way.",
  WORSENING: "Ticket volume increased beyond the no-change band after release.",
  INSUFFICIENT_DATA: "Fewer than 3 tickets were observed in one of the windows — too little data to classify confidently.",
};

export function ResolutionIntelligence() {
  const toast = useToast();
  const releases = useFetch<{ data: Release[] }>("/releases");
  const measurements = useFetch<{ data: ResolutionMeasurement[] }>("/measurements");
  const issues = useFetch<PaginatedResponse<ProductIssue>>("/issues?pageSize=100");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [newReleaseModal, setNewReleaseModal] = useState(false);
  const [linkModal, setLinkModal] = useState<string | null>(null);
  const [releaseName, setReleaseName] = useState("");
  const [releaseVersion, setReleaseVersion] = useState("");
  const [releaseDate, setReleaseDate] = useState(new Date().toISOString().slice(0, 10));
  const [linkIssueId, setLinkIssueId] = useState("");

  async function createRelease() {
    try {
      await api.post("/releases", { name: releaseName, version: releaseVersion, releasedAt: new Date(releaseDate).toISOString() });
      toast.show("Release created.", "success");
      setNewReleaseModal(false);
      setReleaseName("");
      setReleaseVersion("");
      releases.refetch();
    } catch (e) {
      toast.show(e instanceof ApiRequestError ? e.message : "Could not create release", "error");
    }
  }

  async function linkIssue(releaseId: string) {
    if (!linkIssueId) return;
    try {
      await api.post(`/releases/${releaseId}/link-issue`, { issueId: linkIssueId });
      toast.show("Issue linked to release.", "success");
      setLinkModal(null);
      setLinkIssueId("");
      releases.refetch();
    } catch (e) {
      toast.show(e instanceof ApiRequestError ? e.message : "Could not link issue", "error");
    }
  }

  async function measure(releaseId: string, issueId: string) {
    setBusyId(releaseId + issueId);
    try {
      await api.post(`/releases/${releaseId}/measure`, { issueId, windowDays: 30 });
      toast.show("Measurement computed.", "success");
      measurements.refetch();
    } catch (e) {
      toast.show(e instanceof ApiRequestError ? e.message : "Measurement failed", "error");
    } finally {
      setBusyId(null);
    }
  }

  async function verify(id: string) {
    try {
      await api.post(`/measurements/${id}/verify`);
      toast.show("Outcome verified.", "success");
      measurements.refetch();
    } catch (e) {
      toast.show(e instanceof ApiRequestError ? e.message : "Verify failed", "error");
    }
  }

  async function reopen(id: string) {
    try {
      await api.post(`/measurements/${id}/reopen-issue`);
      toast.show("Issue reopened.", "success");
      measurements.refetch();
    } catch (e) {
      toast.show(e instanceof ApiRequestError ? e.message : "Reopen failed", "error");
    }
  }

  if (releases.loading) return <Loading />;
  if (releases.error) return <ErrorState message={releases.error} />;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Rocket size={24} className="text-brand-600" /> Resolution Intelligence</h1>
          <p className="text-slate-500 text-sm">
            Did the fix actually work? Before/after ticket volume compared across a configurable monitoring window
            (default 30 days), classified against fixed, documented thresholds.
          </p>
        </div>
        <Button size="sm" onClick={() => setNewReleaseModal(true)}><Plus size={14} /> New release</Button>
      </div>

      {(releases.data?.data ?? []).length === 0 ? (
        <EmptyState label="No releases yet." />
      ) : (
        releases.data!.data.map((release) => (
          <Card key={release.id} className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-semibold">{release.name} ({release.version})</h3>
                <p className="text-xs text-slate-500">{new Date(release.releasedAt).toLocaleDateString()} — {release.description}</p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => setLinkModal(release.id)}><Link2 size={14} /> Link issue</Button>
            </div>
            <div className="space-y-3">
              {(release.issueLinks ?? []).map((link) => {
                const m = (measurements.data?.data ?? []).find((x) => x.releaseId === release.id && x.issueId === link.issue.id);
                return (
                  <div key={link.issue.id} className="border border-slate-200 dark:border-slate-800 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{link.issue.title}</span>
                      {!m ? (
                        <Button size="sm" disabled={busyId === release.id + link.issue.id} onClick={() => measure(release.id, link.issue.id)}>
                          {busyId === release.id + link.issue.id ? "Computing..." : "Compute measurement"}
                        </Button>
                      ) : (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${OUTCOME_COLORS[m.outcomeClassification]}`}>{m.outcomeClassification.replace(/_/g, " ")}</span>
                      )}
                    </div>
                    {m && <MeasurementPanel measurement={m} onVerify={() => verify(m.id)} onReopen={() => reopen(m.id)} />}
                  </div>
                );
              })}
              {(release.issueLinks ?? []).length === 0 && <p className="text-sm text-slate-400">No issues linked to this release yet.</p>}
            </div>
          </Card>
        ))
      )}

      <Modal open={newReleaseModal} onClose={() => setNewReleaseModal(false)} title="Create a release" footer={<><Button variant="secondary" onClick={() => setNewReleaseModal(false)}>Cancel</Button><Button onClick={createRelease}>Create</Button></>}>
        <div className="space-y-3">
          <label className="text-xs text-slate-500">Name<Input value={releaseName} onChange={(e) => setReleaseName(e.target.value)} /></label>
          <label className="text-xs text-slate-500">Version<Input value={releaseVersion} onChange={(e) => setReleaseVersion(e.target.value)} placeholder="v1.0.0" /></label>
          <label className="text-xs text-slate-500">Released at<Input type="date" value={releaseDate} onChange={(e) => setReleaseDate(e.target.value)} /></label>
        </div>
      </Modal>

      <Modal open={!!linkModal} onClose={() => setLinkModal(null)} title="Link an issue to this release" footer={<><Button variant="secondary" onClick={() => setLinkModal(null)}>Cancel</Button><Button onClick={() => linkModal && linkIssue(linkModal)}>Link</Button></>}>
        <Select value={linkIssueId} onChange={setLinkIssueId}>
          <option value="">Select an issue...</option>
          {(issues.data?.data ?? []).map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}
        </Select>
      </Modal>
    </div>
  );
}

function MeasurementPanel({ measurement, onVerify, onReopen }: { measurement: ResolutionMeasurement; onVerify: () => void; onReopen: () => void }) {
  const chartData = [
    { metric: "Tickets", pre: measurement.preTicketCount, post: measurement.postTicketCount },
    { metric: "Customers", pre: measurement.preAffectedCustomers, post: measurement.postAffectedCustomers },
    { metric: "Support Hours", pre: measurement.preSupportHours, post: measurement.postSupportHours },
  ];
  return (
    <div className="mt-3 space-y-3">
      <p className="text-xs text-slate-500">{OUTCOME_EXPLANATION[measurement.outcomeClassification]}</p>
      <div style={{ width: "100%", height: 180 }}>
        <ResponsiveContainer>
          <BarChart data={chartData}>
            <XAxis dataKey="metric" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="pre" name="Pre-release" fill="#94a3b8" />
            <Bar dataKey="post" name="Post-release" fill="#4f46e5" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex gap-2">
        {!measurement.verifiedAt && (
          <Button size="sm" variant="secondary" onClick={onVerify}><CheckCircle2 size={14} /> Verify outcome</Button>
        )}
        {measurement.verifiedAt && <span className="text-xs text-slate-400">Verified {new Date(measurement.verifiedAt).toLocaleDateString()}</span>}
        {(measurement.outcomeClassification === "WORSENING" || measurement.outcomeClassification === "NO_MATERIAL_CHANGE") && (
          <Button size="sm" variant="danger" onClick={onReopen}><RotateCcw size={14} /> Reopen issue</Button>
        )}
      </div>
    </div>
  );
}
