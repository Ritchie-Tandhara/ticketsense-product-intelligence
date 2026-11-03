import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useFetch } from "../hooks/useFetch";
import { api, ApiRequestError } from "../lib/api";
import { ImpactScenario, ImpactScenarioInputs, PaginatedResponse, ProductIssue } from "../types";
import { Card, Button, Loading, ErrorState, EmptyState, Input, Select } from "../components/ui";
import { useToast } from "../context/ToastContext";
import { ArrowLeft, Download, Calculator } from "lucide-react";
import { downloadCsv } from "../lib/csv";

export function ImpactSimulatorHome() {
  const issues = useFetch<PaginatedResponse<ProductIssue>>("/issues?pageSize=100");
  if (issues.loading) return <Loading />;
  if (issues.error) return <ErrorState message={issues.error} />;
  const data = issues.data?.data ?? [];
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Calculator size={24} className="text-brand-600" /> Fix Impact Simulator</h1>
        <p className="text-slate-500 text-sm">Pick an Issue Genome issue to model the cost/benefit of fixing it.</p>
      </div>
      {data.length === 0 ? (
        <EmptyState label="No issues yet. Create one from Issue Genome first." />
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {data.map((issue) => (
            <Link key={issue.id} to={`/impact-simulator/${issue.id}`}>
              <Card className="p-4 hover:border-brand-400 transition">
                <div className="font-medium">{issue.title}</div>
                <div className="text-xs text-slate-500 mt-1">{issue.productArea} · {issue.relatedTicketCount ?? 0} tickets · {issue.uniqueCustomers ?? 0} customers</div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

const DEFAULT_INPUTS: ImpactScenarioInputs = {
  relatedTicketCount: 10,
  uniqueCustomers: 8,
  avgHandlingTimeMinutes: 25,
  supportCostPerHour: 22,
  projectedFutureTicketVolume: 50,
  estimatedFixEffectivenessPct: 75,
  engineeringCost: 8000,
  customerTier: "PRO",
};

function fmtMoney(n: number) {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function ImpactSimulator() {
  const { issueId } = useParams();
  const toast = useToast();
  const issue = useFetch<ProductIssue>(`/issues/${issueId}`);
  const scenarios = useFetch<{ data: ImpactScenario[] }>(`/issues/${issueId}/impact-scenarios`);

  const [name, setName] = useState("New scenario");
  const [scenarioType, setScenarioType] = useState<"CONSERVATIVE" | "EXPECTED" | "OPTIMISTIC">("EXPECTED");
  const [inputs, setInputs] = useState<ImpactScenarioInputs>(DEFAULT_INPUTS);
  const [preview, setPreview] = useState<ImpactScenario["outputs"] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (issue.data) {
      setInputs((prev) => ({
        ...prev,
        relatedTicketCount: issue.data!.relatedTicketCount ?? prev.relatedTicketCount,
        uniqueCustomers: issue.data!.uniqueCustomers ?? prev.uniqueCustomers,
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issue.data]);

  // Live recalculation preview via a throwaway server-side recompute call,
  // debounced lightly by relying on React state batching. We never compute
  // these numbers in the browser - the server is always the source of truth.
  useEffect(() => {
    const handle = setTimeout(async () => {
      try {
        const res = await api.post<{ outputs: ImpactScenario["outputs"] }>(`/issues/${issueId}/impact-scenarios/preview`, { inputs }).catch(() => null);
        if (res) setPreview(res.outputs);
      } catch {
        /* preview is best-effort */
      }
    }, 150);
    return () => clearTimeout(handle);
  }, [inputs, issueId]);

  async function save() {
    setSaving(true);
    try {
      await api.post(`/issues/${issueId}/impact-scenarios`, { name, scenarioType, inputs });
      toast.show("Scenario saved.", "success");
      scenarios.refetch();
    } catch (e) {
      toast.show(e instanceof ApiRequestError ? e.message : "Could not save scenario", "error");
    } finally {
      setSaving(false);
    }
  }

  function set<K extends keyof ImpactScenarioInputs>(key: K, value: ImpactScenarioInputs[K]) {
    setInputs((prev) => ({ ...prev, [key]: value }));
  }

  function exportCsv(s: ImpactScenario) {
    downloadCsv(`impact-scenario-${s.name}.csv`, [
      { field: "name", value: s.name },
      { field: "scenarioType", value: s.scenarioType },
      ...Object.entries(s.inputs).map(([k, v]) => ({ field: `input.${k}`, value: v })),
      ...Object.entries(s.outputs).filter(([k]) => k !== "prioritization").map(([k, v]) => ({ field: `output.${k}`, value: v ?? "N/A" })),
    ]);
  }

  if (issue.loading) return <Loading />;
  if (issue.error || !issue.data) return <ErrorState message={issue.error ?? "Issue not found"} />;

  return (
    <div className="space-y-6">
      <Link to={`/issue-genome/${issueId}`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
        <ArrowLeft size={14} /> Back to {issue.data.title}
      </Link>
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Calculator size={24} className="text-brand-600" /> Fix Impact Simulator</h1>
        <p className="text-slate-500 text-sm">
          A forecast/estimate, not a guarantee. All figures below are computed server-side from the assumptions you enter.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <Card className="p-4 space-y-3">
          <h3 className="font-semibold">Assumptions</h3>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-slate-500">Scenario name<Input value={name} onChange={(e) => setName(e.target.value)} /></label>
            <label className="text-xs text-slate-500">Scenario type
              <Select value={scenarioType} onChange={(v) => setScenarioType(v as typeof scenarioType)}>
                <option value="CONSERVATIVE">Conservative</option>
                <option value="EXPECTED">Expected</option>
                <option value="OPTIMISTIC">Optimistic</option>
              </Select>
            </label>
            <label className="text-xs text-slate-500">Related ticket count<Input type="number" value={inputs.relatedTicketCount} onChange={(e) => set("relatedTicketCount", Number(e.target.value))} /></label>
            <label className="text-xs text-slate-500">Unique customers<Input type="number" value={inputs.uniqueCustomers} onChange={(e) => set("uniqueCustomers", Number(e.target.value))} /></label>
            <label className="text-xs text-slate-500">Avg handling time (min)<Input type="number" value={inputs.avgHandlingTimeMinutes} onChange={(e) => set("avgHandlingTimeMinutes", Number(e.target.value))} /></label>
            <label className="text-xs text-slate-500">Support cost / hour ($)<Input type="number" value={inputs.supportCostPerHour} onChange={(e) => set("supportCostPerHour", Number(e.target.value))} /></label>
            <label className="text-xs text-slate-500">Projected future ticket volume<Input type="number" value={inputs.projectedFutureTicketVolume} onChange={(e) => set("projectedFutureTicketVolume", Number(e.target.value))} /></label>
            <label className="text-xs text-slate-500">Est. fix effectiveness (%)<Input type="number" value={inputs.estimatedFixEffectivenessPct} onChange={(e) => set("estimatedFixEffectivenessPct", Number(e.target.value))} /></label>
            <label className="text-xs text-slate-500">Engineering cost ($)<Input type="number" value={inputs.engineeringCost} onChange={(e) => set("engineeringCost", Number(e.target.value))} /></label>
            <label className="text-xs text-slate-500">Dominant customer tier
              <Select value={inputs.customerTier ?? "STANDARD"} onChange={(v) => set("customerTier", v)}>
                <option value="STANDARD">Standard</option>
                <option value="PRO">Pro</option>
                <option value="ENTERPRISE">Enterprise</option>
              </Select>
            </label>
          </div>
          <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save scenario"}</Button>
        </Card>

        <Card className="p-4 space-y-3">
          <h3 className="font-semibold">Live calculation preview</h3>
          {preview ? (
            <div className="space-y-2 text-sm">
              <Row label="Historical support cost" value={fmtMoney(preview.historicalSupportCost)} />
              <Row label="Avoided tickets" value={preview.avoidedTickets.toLocaleString()} />
              <Row label="Time saved (hours)" value={preview.timeSavedHours.toLocaleString()} />
              <Row label="Cost savings" value={fmtMoney(preview.costSavings)} />
              <Row label="Net benefit" value={fmtMoney(preview.netBenefit)} />
              <Row label="ROI %" value={preview.roiPct === null ? "N/A (zero engineering cost)" : `${preview.roiPct.toFixed(1)}%`} />
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                <div className="text-xs text-slate-500 mb-1">Prioritization score: {preview.prioritization.score.toFixed(1)} / 100 (weighted breakdown, not a black box)</div>
                {preview.prioritization.breakdown.map((b) => (
                  <div key={b.factor} className="flex items-center justify-between text-xs text-slate-500">
                    <span>{b.factor} (w={b.weight})</span>
                    <span>{b.normalizedScore.toFixed(0)} -&gt; +{b.weightedContribution.toFixed(1)}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-400 pt-2">
                How this is calculated: Historical Support Cost = ticket count x avg handling time x cost/hour. Avoided
                Tickets = projected volume x fix effectiveness %. Cost Savings = avoided tickets x handling time x
                cost/hour. Net Benefit = Cost Savings - Engineering Cost. ROI% = Net Benefit / Engineering Cost x 100,
                shown as N/A when engineering cost is zero (never a fabricated %).
              </p>
            </div>
          ) : (
            <Loading label="Calculating..." />
          )}
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 font-semibold text-sm">Saved scenarios (Conservative / Expected / Optimistic comparison)</div>
        {scenarios.loading ? (
          <Loading />
        ) : !scenarios.data || scenarios.data.data.length === 0 ? (
          <div className="p-4 text-sm text-slate-400">No scenarios saved yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-left text-xs text-slate-500">
              <tr><th className="px-3 py-2">Name</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Cost Savings</th><th className="px-3 py-2">Net Benefit</th><th className="px-3 py-2">ROI%</th><th className="px-3 py-2">Priority Score</th><th className="px-3 py-2"></th></tr>
            </thead>
            <tbody>
              {scenarios.data.data.map((s) => (
                <tr key={s.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-3 py-2">{s.name}</td>
                  <td className="px-3 py-2">{s.scenarioType}</td>
                  <td className="px-3 py-2">{fmtMoney(s.outputs.costSavings)}</td>
                  <td className="px-3 py-2">{fmtMoney(s.outputs.netBenefit)}</td>
                  <td className="px-3 py-2">{s.outputs.roiPct === null ? "N/A" : `${s.outputs.roiPct.toFixed(1)}%`}</td>
                  <td className="px-3 py-2">{s.outputs.prioritization.score.toFixed(1)}</td>
                  <td className="px-3 py-2">
                    <button onClick={() => exportCsv(s)} className="text-slate-400 hover:text-brand-600" title="Export CSV"><Download size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
