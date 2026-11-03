import { useState, FormEvent } from "react";
import { Plus } from "lucide-react";
import { useFetch } from "../hooks/useFetch";
import { api, ApiRequestError } from "../lib/api";
import { useToast } from "../context/ToastContext";
import { Category, Team, User } from "../types";
import { Button, Card, EmptyState, ErrorState, Input, Loading, Modal } from "../components/ui";

export function TeamManagement() {
  const { show } = useToast();
  const teams = useFetch<{ data: (Team & { members: User[] })[] }>("/admin/teams");
  const categories = useFetch<{ data: Category[] }>("/admin/categories");
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Team Management</h1>
        <p className="text-slate-500 text-sm">Teams, agents, and ticket categories.</p>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Teams</h2>
          <Button onClick={() => setShowTeamModal(true)}><Plus size={16} /> New Team</Button>
        </div>
        {teams.loading ? (
          <Loading />
        ) : teams.error ? (
          <ErrorState message={teams.error} />
        ) : !teams.data || teams.data.data.length === 0 ? (
          <EmptyState label="No teams yet." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {teams.data.data.map((t) => (
              <Card key={t.id} className="p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{t.name}</h3>
                  {t.isEscalation && <span className="text-xs px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">Escalation Team</span>}
                </div>
                <p className="text-xs text-slate-500 mt-1">{t.members.length} member(s)</p>
                <ul className="mt-2 space-y-1 text-sm">
                  {t.members.map((m) => (
                    <li key={m.id} className="flex justify-between">
                      <span>{m.name}</span>
                      <span className="text-xs text-slate-400">{m.role.replace("_", " ")}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Categories</h2>
          <Button onClick={() => setShowCategoryModal(true)}><Plus size={16} /> New Category</Button>
        </div>
        {categories.loading ? (
          <Loading />
        ) : categories.error ? (
          <ErrorState message={categories.error} />
        ) : (
          <div className="flex gap-2 flex-wrap">
            {categories.data?.data.map((c) => (
              <span key={c.id} className="text-sm px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800">{c.name}</span>
            ))}
          </div>
        )}
      </section>

      <TeamModal open={showTeamModal} onClose={() => setShowTeamModal(false)} onCreated={() => { setShowTeamModal(false); teams.refetch(); }} />
      <CategoryModal open={showCategoryModal} onClose={() => setShowCategoryModal(false)} onCreated={() => { setShowCategoryModal(false); categories.refetch(); }} />
    </div>
  );
}

function TeamModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { show } = useToast();
  const [name, setName] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await api.post("/admin/teams", { name });
      show("Team created", "success");
      setName("");
      onCreated();
    } catch (err) {
      show(err instanceof ApiRequestError ? err.message : "Failed to create team", "error");
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New Team">
      <form onSubmit={handleSubmit} className="space-y-3">
        <Input placeholder="Team name" value={name} onChange={(e) => setName(e.target.value)} required />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit">Create</Button>
        </div>
      </form>
    </Modal>
  );
}

function CategoryModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { show } = useToast();
  const [name, setName] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await api.post("/admin/categories", { name });
      show("Category created", "success");
      setName("");
      onCreated();
    } catch (err) {
      show(err instanceof ApiRequestError ? err.message : "Failed to create category", "error");
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New Category">
      <form onSubmit={handleSubmit} className="space-y-3">
        <Input placeholder="Category name" value={name} onChange={(e) => setName(e.target.value)} required />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit">Create</Button>
        </div>
      </form>
    </Modal>
  );
}
