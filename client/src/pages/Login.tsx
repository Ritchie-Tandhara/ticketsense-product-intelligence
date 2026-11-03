import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Button, Input } from "../components/ui";
import { ApiRequestError } from "../lib/api";

const DEMO_ACCOUNTS = [
  { role: "Super Admin", email: "admin@ticketsense.io" },
  { role: "Support Manager", email: "manager@ticketsense.io" },
  { role: "Support Agent", email: "agent1@ticketsense.io" },
  { role: "Readonly Analyst", email: "analyst@ticketsense.io" },
];

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("admin@ticketsense.io");
  const [password, setPassword] = useState("Password123!");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-800 p-8">
        <div className="flex items-center gap-2 text-brand-600 font-bold text-xl mb-1">
          <Sparkles size={24} />
          TicketSense
        </div>
        <p className="text-sm text-slate-500 mb-6">AI-powered customer support & ITSM platform</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1 block">Email</label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1 block">Password</label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && <div className="text-sm text-rose-600">{error}</div>}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Signing in..." : "Sign in"}
          </Button>
        </form>

        <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500">
          <div className="font-medium mb-1">Demo accounts (password: Password123!)</div>
          <ul className="space-y-0.5">
            {DEMO_ACCOUNTS.map((a) => (
              <li key={a.email}>
                <button type="button" className="hover:text-brand-600 underline" onClick={() => setEmail(a.email)}>
                  {a.role}
                </button>{" "}
                — {a.email}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
