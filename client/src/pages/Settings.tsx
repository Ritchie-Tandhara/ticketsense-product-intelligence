import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useFetch } from "../hooks/useFetch";
import { AuditLogEntry, PaginatedResponse } from "../types";
import { Button, Card, EmptyState, ErrorState, Loading, Pagination } from "../components/ui";

export function Settings() {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [page, setPage] = useState(1);
  const canSeeAudit = user?.role === "SUPER_ADMIN" || user?.role === "SUPPORT_MANAGER" || user?.role === "READONLY_ANALYST";
  const audit = useFetch<PaginatedResponse<AuditLogEntry>>(canSeeAudit ? `/admin/audit-log?page=${page}&pageSize=15` : null, [page]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-slate-500 text-sm">Profile, preferences, and audit trail.</p>
      </div>

      <Card className="p-4 max-w-md">
        <div className="font-semibold mb-3 text-sm">Profile</div>
        <div className="text-sm space-y-1">
          <div>Name: <span className="font-medium">{user?.name}</span></div>
          <div>Email: <span className="font-medium">{user?.email}</span></div>
          <div>Role: <span className="font-medium">{user?.role.replace("_", " ")}</span></div>
        </div>
      </Card>

      <Card className="p-4 max-w-md">
        <div className="font-semibold mb-3 text-sm">Appearance</div>
        <div className="flex items-center justify-between text-sm">
          <span>Theme: {theme === "light" ? "Light" : "Dark"}</span>
          <Button variant="secondary" size="sm" onClick={toggleTheme}>Toggle theme</Button>
        </div>
      </Card>

      {canSeeAudit && (
        <section className="space-y-3">
          <h2 className="font-semibold">Audit Log</h2>
          <Card className="overflow-hidden">
            {audit.loading ? (
              <Loading />
            ) : audit.error ? (
              <ErrorState message={audit.error} />
            ) : !audit.data || audit.data.data.length === 0 ? (
              <EmptyState label="No audit entries yet." />
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/50 text-left text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Actor</th>
                    <th className="px-3 py-2">Action</th>
                    <th className="px-3 py-2">Entity</th>
                    <th className="px-3 py-2">When</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.data.data.map((a) => (
                    <tr key={a.id} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-3 py-2">{a.actor?.name ?? "System"}</td>
                      <td className="px-3 py-2">{a.action}</td>
                      <td className="px-3 py-2">{a.entity}</td>
                      <td className="px-3 py-2 text-slate-500">{new Date(a.createdAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {audit.data && (
              <div className="px-4">
                <Pagination page={audit.data.pagination.page} totalPages={audit.data.pagination.totalPages} onChange={setPage} />
              </div>
            )}
          </Card>
        </section>
      )}
    </div>
  );
}
