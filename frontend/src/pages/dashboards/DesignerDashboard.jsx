import { useAuth } from "@/context/AuthContext";
import { Navigate, useLocation } from "react-router-dom";
import DashShell from "@/components/layout/DashShell";
import { TabSiteVisits } from "./AdminDashboard";
import DesignerLeadsList from "@/components/admin/DesignerLeadsList";
import DesignerProjectsPanel from "@/components/admin/DesignerProjectsPanel";

const LINKS = [
  { to: "#leads",          label: "My Leads" },
  { to: "#verify",         label: "Verify Floor Plan" },
  { to: "#active",         label: "Active Projects" },
  { to: "#awaiting",       label: "Awaiting Approvals" },
  { to: "#completed",      label: "Completed" },
];

export default function DesignerDashboard() {
  const { user } = useAuth();
  const loc = useLocation();
  const activeTab = (loc.hash || "#leads").slice(1);

  if (user === undefined) return null;
  if (user === null) return <Navigate to="/login" />;
  if (user.role !== "designer") {
    if (user.role === "admin") return <Navigate to="/dashboard/admin" />;
    if (user.role === "sales") return <Navigate to="/dashboard/sales" />;
    return <Navigate to="/" />;
  }

  return (
    <DashShell links={LINKS} title="Designer Studio">
      <div className="flex gap-4 border-b border-[#E8E4D9] mb-6 pb-2 overflow-x-auto" data-testid="designer-tabs">
        {LINKS.map(link => {
          const key = link.to.slice(1);
          return (
            <button
              key={link.to}
              data-testid={`designer-tab-${key}`}
              onClick={() => { window.location.hash = link.to; }}
              className={`text-sm font-medium pb-2 whitespace-nowrap ${activeTab === key ? "text-[#06402B] border-b-2 border-[#06402B]" : "text-gray-400 hover:text-[#06402B]"}`}
            >
              {link.label}
            </button>
          );
        })}
      </div>

      {activeTab === "leads"     && <DesignerLeadsList />}
      {activeTab === "verify"    && <TabSiteVisits />}
      {activeTab === "active"    && <DesignerProjectsPanel mode="active" />}
      {activeTab === "awaiting"  && <DesignerProjectsPanel mode="awaiting" />}
      {activeTab === "completed" && <DesignerProjectsPanel mode="completed" />}
    </DashShell>
  );
}
