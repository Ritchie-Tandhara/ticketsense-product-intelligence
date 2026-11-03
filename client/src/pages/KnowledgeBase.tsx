import { useState, FormEvent } from "react";
import { Plus, Search } from "lucide-react";
import { useFetch } from "../hooks/useFetch";
import { api, ApiRequestError } from "../lib/api";
import { useToast } from "../context/ToastContext";
import { KnowledgeArticle, PaginatedResponse } from "../types";
import { Button, Card, EmptyState, ErrorState, Input, Loading, Modal, Textarea } from "../components/ui";

export function KnowledgeBase() {
  const { show } = useToast();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const articles = useFetch<PaginatedResponse<KnowledgeArticle>>(`/knowledge?search=${encodeURIComponent(search)}`, [search]);

  async function togglePublish(a: KnowledgeArticle) {
    try {
      await api.patch(`/knowledge/${a.id}`, { isPublished: !a.isPublished });
      show(a.isPublished ? "Article unpublished" : "Article published", "success");
      articles.refetch();
    } catch (err) {
      show(err instanceof ApiRequestError ? err.message : "Failed to update article", "error");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Knowledge Base</h1>
          <p className="text-slate-500 text-sm">Published articles are used for the ticket "suggested articles" feature via keyword overlap.</p>
        </div>
        <Button onClick={() => setShowCreate(true)}><Plus size={16} /> New Article</Button>
      </div>

      <Card className="p-3 flex items-center gap-2 max-w-md">
        <Search size={16} className="text-slate-400" />
        <input
          placeholder="Search articles..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 bg-transparent outline-none text-sm"
        />
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {articles.loading ? (
          <Loading />
        ) : articles.error ? (
          <ErrorState message={articles.error} />
        ) : !articles.data || articles.data.data.length === 0 ? (
          <EmptyState label="No articles found." />
        ) : (
          articles.data.data.map((a) => (
            <Card key={a.id} className="p-4">
              <div className="flex items-start justify-between">
                <h3 className="font-semibold">{a.title}</h3>
                <button
                  onClick={() => togglePublish(a)}
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${a.isPublished ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}
                >
                  {a.isPublished ? "Published" : "Draft"}
                </button>
              </div>
              <p className="text-sm text-slate-500 mt-2 line-clamp-3">{a.body}</p>
              <div className="flex gap-1 mt-2 flex-wrap">
                {a.tags.split(",").filter(Boolean).map((tag) => (
                  <span key={tag} className="text-xs bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">{tag.trim()}</span>
                ))}
              </div>
            </Card>
          ))
        )}
      </div>

      <CreateArticleModal open={showCreate} onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); articles.refetch(); }} />
    </div>
  );
}

function CreateArticleModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { show } = useToast();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await api.post("/knowledge", { title, body, tags, isPublished: true });
      show("Article created", "success");
      setTitle("");
      setBody("");
      setTags("");
      onCreated();
    } catch (err) {
      show(err instanceof ApiRequestError ? err.message : "Failed to create article", "error");
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New Knowledge Article">
      <form onSubmit={handleSubmit} className="space-y-3">
        <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <Textarea placeholder="Body" rows={5} value={body} onChange={(e) => setBody(e.target.value)} required />
        <Input placeholder="Tags (comma separated)" value={tags} onChange={(e) => setTags(e.target.value)} />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit">Create</Button>
        </div>
      </form>
    </Modal>
  );
}
