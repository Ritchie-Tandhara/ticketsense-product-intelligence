import { useState, FormEvent } from "react";
import { Plus } from "lucide-react";
import { useFetch } from "../hooks/useFetch";
import { api, ApiRequestError } from "../lib/api";
import { useToast } from "../context/ToastContext";
import { AssignmentRule, Category, Team } from "../types";
import { Button, Card, EmptyState, ErrorState, Input, Loading, Modal, PriorityBadge, Select } from "../components/ui";

const STRATEGIES = ["ROUND_ROBIN", "LEAST_ACTIVE", "CATEGORY_BASED", "PRIORITY_ESCALATION"];

export function AssignmentRules() {
  const { show } = useToast();
  const rules = useFetch<{ data: AssignmentRule[] }>("/assignment-rules");
  const teams = useFetch<{ data: Team[] }>("/admin/teams");
  const categories = useFetch<{ data: Category[] }>("/admin/categories");
  const [showCreate, setShowCreate] = useState(false);
  const [dryRun, setDryRun] = useState<{ priority: string; categoryId: string }>({ priority: "CRITICAL", categoryId: "" });
  const [dryRunResult, setDryRunResult] = useState<any>(null);

  async function toggleActive(rule: AssignmentRule) {
    try {
      await api.patch(`/assignment-rules/${rule.id}`, { isActive: !rule.isActive });
      rules.refetch();
    } catch (err) {
      show(err instanceof ApiRequestError ? err.message : "Failed to update rule", "error");
    }
  }

  async function runDryRun() {
    try {
      const res = await api.post("/assignment-rules/dry-run", { priority: dryRun.priority, categoryId: dryRun.categoryId || undefined });
      setDryRunResult(res);
    } catch (err) {
      show(err instanceof ApiRequestError ? err.message : "Dry run failed", "error");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Assignment Rules</h1>
          <p className="text-slate-500 text-sm">Evaluated in order; the default rule is used as a fallback.</p>
        </div>
        <Button onClick={() => setShowCreate(true)}><Plus size={16} /> New Rule</Button>
      </div>

      <Card className="overflow-hidden">
        {rules.loading ? (
          <Loading />
        ) : rules.error ? (
          <ErrorState message={rules.error} />
        ) : !rules.data || rules.data.data.length === 0 ? (
          <EmptyState label="No assignment rules configured." />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2">Order</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Condition</th>
                <th className="px-3 py-2">Strategy</th>
                <th className="px-3 py-2">Target Team</th>
                <th className="px-3 py-2">Active</th>
              </tr>
            </thead>
            <tbody>
              {rules.data.data.map((r) => (
                <tr key={r.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-3 py-2">{r.order}</td>
                  <td className="px-3 py-2 font-medium">{r.name} {r.isDefault && <span className="text-xs text-slate-400">(default)</span>}</td>
                  <td className="px-3 py-2">
                    {r.conditionPriority && <PriorityBadge priority={r.conditionPriority} />}
                    {r.conditionCategory && <span className="ml-1 text-xs">{r.conditionCategory.name}</span>}
                    {!r.conditionPriority && !r.conditionCategory && <span className="text-slate-400 text-xs">any</span>}
                  </td>
                  <td className="px-3 py-2">{r.strategy}</td>
                  <td className="px-3 py-2">{r.targetTeam?.name ?? "—"}</td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => toggleActive(r)}
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${r.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}
                    >
                      {r.isActive ? "Active" : "Disabled"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card className="p-4 space-y-3">
        <div className="font-semibold text-sm">Dry Run Preview</div>
        <p className="text-xs text-slate-500">Simulate a sample ticket to see which rule and agent would be chosen, without creating a real ticket.</p>
        <div className="flex gap-3 items-center flex-wrap">
          <Select value={dryRun.priority} onChange={(v) => setDryRun((d) => ({ ...d, priority: v }))}>
            {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((p) => <option key={p} value={p}>{p}</option>)}
          </Select>
          <Select value={dryRun.categoryId} onChange={(v) => setDryRun((d) => ({ ...d, categoryId: v }))}>
            <option value="">Any category</option>
            {categories.data?.data.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Button onClick={runDryRun}>Run Dry Run</Button>
        </div>
        {dryRunResult && (
          <div className="text-sm bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
            <div>Matched rule: <span className="font-medium">{dryRunResult.ruleName}</span></div>
            <div>Reason: {dryRunResult.reason}</div>
          </div>
        )}
      </Card>

      <CreateRuleModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        teams={teams.data?.data ?? []}
        categories={categories.data?.data ?? []}
        onCreated={() => {
          setShowCreate(false);
          rules.refetch();
        }}
      />
    </div>
  );
}

function CreateRuleModal({
  open,
  onClose,
  onCreated,
  teams,
  categories,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  teams: Team[];
  categories: Category[];
}) {
  const { show } = useToast();
  const [name, setName] = useState("");
  const [strategy, setStrategy] = useState("ROUND_ROBIN");
  const [targetTeamId, setTargetTeamId] = useState("");
  const [conditionPriority, setConditionPriority] = useState("");
  const [conditionCategoryId, setConditionCategoryId] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await api.post("/assignment-rules", {
        name,
        strategy,
        targetTeamId: targetTeamId || undefined,
        conditionPriority: conditionPriority || undefined,
        conditionCategoryId: conditionCategoryId || undefined,
      });
      show("Rule created", "success");
      setName("");
      onCreated();
    } catch (err) {
      show(err instanceof ApiRequestError ? err.message : "Failed to create rule", "error");
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New Assignment Rule">
      <form onSubmit={handleSubmit} className="space-y-3">
        <Input placeholder="Rule name" value={name} onChange={(e) => setName(e.target.value)} required />
        <Select value={strategy} onChange={setStrategy}>
          {STRATEGIES.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        <Select value={targetTeamId} onChange={setTargetTeamId}>
          <option value="">Select target team</option>
          {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
        <Select value={conditionPriority} onChange={setConditionPriority}>
          <option value="">Condition: any priority</option>
          {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((p) => <option key={p} value={p}>{p}</option>)}
        </Select>
        <Select value={conditionCategoryId} onChange={setConditionCategoryId}>
          <option value="">Condition: any category</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit">Create Rule</Button>
        </div>
      </form>
    </Modal>
  );
}
