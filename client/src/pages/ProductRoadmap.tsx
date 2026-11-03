import { Link } from "react-router-dom";
import { useFetch } from "../hooks/useFetch";
import { WorkItem } from "../types";
import { Card, Loading, ErrorState, EmptyState } from "../components/ui";
import { ListChecks } from "lucide-react";

const COLUMNS: { status: WorkItem["status"]; label: string }[] = [
  { status: "DRAFT", label: "Draft" },
  { status: "UNDER_REVIEW", label: "Under Review" },
  { status: "APPROVED", label: "Approved" },
  { status: "BACKLOG", label: "Backlog" },
  { status: "IN_PROGRESS", label: "In Progress" },
  { status: "RELEASED", label: "Released" },
  { status: "VERIFIED", label: "Verified" },
];

export function ProductRoadmap() {
  const items = useFetch<{ data: WorkItem[] }>("/work-items");

  if (items.loading) return <Loading />;
  if (items.error) return <ErrorState message={items.error} />;
  const all = items.data?.data ?? [];
  const rejected = all.filter((w) => w.status === "REJECTED" || w.status === "NEEDS_REVISION");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><ListChecks size={24} className="text-brand-600" /> Product Roadmap</h1>
        <p className="text-slate-500 text-sm">
          Work items drafted by the AI BA Assistant (deterministic template, not an LLM) from confirmed Issue Genome
          issues, tracked through an approval state machine.
        </p>
      </div>

      {all.length === 0 ? (
        <EmptyState label='No work items yet. Generate one from an Issue Genome issue detail page ("Generate work item draft").' />
      ) : (
        <div className="grid grid-cols-7 gap-3 overflow-x-auto">
          {COLUMNS.map((col) => (
            <div key={col.status} className="min-w-[180px]">
              <div className="text-xs font-semibold text-slate-500 mb-2">{col.label} ({all.filter((w) => w.status === col.status).length})</div>
              <div className="space-y-2">
                {all.filter((w) => w.status === col.status).map((w) => (
                  <Link key={w.id} to={`/product-roadmap/${w.id}`}>
                    <Card className="p-3 hover:border-brand-400 transition">
                      <div className="text-sm font-medium line-clamp-2">{w.title}</div>
                      <div className="text-xs text-slate-500 mt-1">{w.productArea}</div>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {rejected.length > 0 && (
        <Card className="p-4">
          <h3 className="font-semibold mb-2 text-rose-600">Rejected / Needs Revision</h3>
          <div className="flex flex-col gap-1">
            {rejected.map((w) => (
              <Link key={w.id} to={`/product-roadmap/${w.id}`} className="text-sm text-brand-600 hover:underline">{w.title} ({w.status.replace("_", " ")})</Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
