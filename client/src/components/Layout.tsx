import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Ticket,
  Sparkles,
  Workflow,
  Clock,
  BookOpen,
  BarChart3,
  Users,
  Settings,
  Sun,
  Moon,
  LogOut,
  HelpCircle,
  Dna,
  Calculator,
  ListChecks,
  Rocket,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";

const NAV_ITEMS = [
  { to: "/", label: "Overview", icon: LayoutDashboard },
  { to: "/tickets", label: "Tickets", icon: Ticket },
  { to: "/ai-intelligence", label: "AI Intelligence", icon: Sparkles },
  { to: "/assignment-rules", label: "Assignment Rules", icon: Workflow },
  { to: "/sla", label: "SLA Management", icon: Clock },
  { to: "/knowledge-base", label: "Knowledge Base", icon: BookOpen },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/teams", label: "Team Management", icon: Users },
  { to: "/settings", label: "Settings", icon: Settings },
  { to: "/help", label: "Help Guide", icon: HelpCircle },
  { to: "/issue-genome", label: "Issue Genome", icon: Dna },
  { to: "/impact-simulator", label: "Impact Simulator", icon: Calculator },
  { to: "/product-roadmap", label: "Product Roadmap", icon: ListChecks },
  { to: "/resolution-intelligence", label: "Resolution Intelligence", icon: Rocket },
];

export function Layout() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div className="flex h-screen">
      <aside className="w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2 font-bold text-lg text-brand-600">
            <Sparkles size={22} />
            TicketSense
          </div>
          <div className="text-xs text-slate-400 mt-0.5">AI Support Platform</div>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition ${
                  isActive
                    ? "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400"
                    : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`
              }
            >
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500">
          <div className="font-medium text-slate-700 dark:text-slate-200">{user?.name}</div>
          <div>{user?.role.replace("_", " ")}</div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-end px-5 gap-3">
          <NavLink
            to="/help"
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
            aria-label="Help guide"
            title="Help guide"
          >
            <HelpCircle size={18} />
          </NavLink>
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
            aria-label="Toggle theme"
          >
            {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
          >
            <LogOut size={16} />
            Logout
          </button>
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
