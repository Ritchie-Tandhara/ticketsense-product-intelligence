import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";
import { Overview } from "./pages/Overview";
import { Tickets } from "./pages/Tickets";
import { TicketDetail } from "./pages/TicketDetail";
import { AIIntelligence } from "./pages/AIIntelligence";
import { AssignmentRules } from "./pages/AssignmentRules";
import { SLAManagement } from "./pages/SLAManagement";
import { KnowledgeBase } from "./pages/KnowledgeBase";
import { Reports } from "./pages/Reports";
import { TeamManagement } from "./pages/TeamManagement";
import { Settings } from "./pages/Settings";
import { Help } from "./pages/Help";
import { IssueGenome } from "./pages/IssueGenome";
import { IssueGenomeDetail } from "./pages/IssueGenomeDetail";
import { ImpactSimulator, ImpactSimulatorHome } from "./pages/ImpactSimulator";
import { ProductRoadmap } from "./pages/ProductRoadmap";
import { WorkItemDetail } from "./pages/WorkItemDetail";
import { ResolutionIntelligence } from "./pages/ResolutionIntelligence";
import { Loading } from "./components/ui";

function ProtectedLayout() {
  const { user, loading } = useAuth();
  if (loading) return <Loading label="Loading TicketSense..." />;
  if (!user) return <Navigate to="/login" replace />;
  return <Layout />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedLayout />}>
        <Route path="/" element={<Overview />} />
        <Route path="/tickets" element={<Tickets />} />
        <Route path="/tickets/:id" element={<TicketDetail />} />
        <Route path="/ai-intelligence" element={<AIIntelligence />} />
        <Route path="/assignment-rules" element={<AssignmentRules />} />
        <Route path="/sla" element={<SLAManagement />} />
        <Route path="/knowledge-base" element={<KnowledgeBase />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/teams" element={<TeamManagement />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/help" element={<Help />} />
        <Route path="/issue-genome" element={<IssueGenome />} />
        <Route path="/issue-genome/:id" element={<IssueGenomeDetail />} />
        <Route path="/impact-simulator" element={<ImpactSimulatorHome />} />
        <Route path="/impact-simulator/:issueId" element={<ImpactSimulator />} />
        <Route path="/product-roadmap" element={<ProductRoadmap />} />
        <Route path="/product-roadmap/:id" element={<WorkItemDetail />} />
        <Route path="/resolution-intelligence" element={<ResolutionIntelligence />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
