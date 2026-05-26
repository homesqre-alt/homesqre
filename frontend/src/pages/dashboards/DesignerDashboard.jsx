import { useAuth } from "@/context/AuthContext";
import { Navigate, useLocation } from "react-router-dom";
import DashShell from "@/components/layout/DashShell";
import { TabSiteVisits } from "./AdminDashboard";
import DesignerProjects from "@/components/admin/DesignerProjects";

const LINKS = [
  { to: "#verifications", label: "Verification & Site Visits" },
  { to: "#projects", label: "Active Projects (3D)" },
];

export default function DesignerDashboard() {
  const { user } = useAuth();
  const loc = useLocation();
  const activeTab = (loc.hash || "#verifications").slice(1);

  if (user === undefined) return null;
  if (user === null) return <Navigate to="/login" />;
  if (user.role !== "designer") {
    if (user.role === "admin") return <Navigate to="/dashboard/admin" />;
    if (user.role === "sales") return <Navigate to="/dashboard/sales" />;
    return <Navigate to="/" />;
  }

  return (
    <DashShell links={LINKS} title="Designer Studio">
      {/* Visible top tab bar — same pattern as admin command center */}
      <div className="flex gap-4 border-b border-[#E8E4D9] mb-6 pb-2 overflow-x-auto" data-testid="designer-tabs">
        {LINKS.map(link => (
          <button
            key={link.to}
            data-testid={`designer-tab-${link.to.slice(1)}`}
            onClick={() => { window.location.hash = link.to; }}
            className={`text-sm font-medium pb-2 whitespace-nowrap ${activeTab === link.to.slice(1) ? "text-[#06402B] border-b-2 border-[#06402B]" : "text-gray-400 hover:text-[#06402B]"}`}
          >
            {link.label}
          </button>
        ))}
      </div>
      <div className="mb-6">
        <p className="text-[#4A5D54] max-w-2xl text-sm">
          {activeTab === "projects"
            ? "Upload 3D renders one at a time — each requires a note for the customer. Track their feedback inline."
            : "Review uploaded floor plans, approve them to push clients into scheduling, or flag a package mismatch."}
        </p>
      </div>
      {activeTab === "verifications" && <TabSiteVisits />}
      {activeTab === "projects" && <DesignerProjects currentUser={user} />}
    </DashShell>
  );
}
