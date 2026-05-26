import { useAuth } from "@/context/AuthContext";
import { Navigate, useLocation } from "react-router-dom";
import DashShell from "@/components/layout/DashShell";
import { TabSiteVisits } from "./AdminDashboard";
import DesignerProjects from "@/components/admin/DesignerProjects";
import ApprovedFloorPlans from "@/components/admin/ApprovedFloorPlans";

const LINKS = [
  { to: "#verifications", label: "Verification & Site Visits" },
  { to: "#approved", label: "Approved Floor Plans" },
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

  const openProject = (projectId) => {
    if (!projectId) return;
    // Active Projects tab reads `?focus=<id>` from the URL hash so we can deep-link.
    window.location.hash = `#projects?focus=${projectId}`;
  };

  return (
    <DashShell links={LINKS} title="Designer Studio">
      {/* Visible top tab bar — same pattern as admin command center */}
      <div className="flex gap-4 border-b border-[#E8E4D9] mb-6 pb-2 overflow-x-auto" data-testid="designer-tabs">
        {LINKS.map(link => {
          const key = link.to.slice(1).split("?")[0];
          return (
            <button
              key={link.to}
              data-testid={`designer-tab-${key}`}
              onClick={() => { window.location.hash = link.to; }}
              className={`text-sm font-medium pb-2 whitespace-nowrap ${activeTab.split("?")[0] === key ? "text-[#06402B] border-b-2 border-[#06402B]" : "text-gray-400 hover:text-[#06402B]"}`}
            >
              {link.label}
            </button>
          );
        })}
      </div>
      <div className="mb-6">
        <p className="text-[#4A5D54] max-w-2xl text-sm">
          {activeTab.startsWith("projects") && "Upload 3D renders one at a time — each requires a note for the customer. Track their feedback inline."}
          {activeTab.startsWith("approved") && "Floor plans the customer has already paid for and you have approved. Reference these locally while designing, then jump to Active Projects to upload renders."}
          {activeTab.startsWith("verifications") && "Review uploaded floor plans, approve them to start design + site visit, or flag a package mismatch."}
        </p>
      </div>
      {activeTab.startsWith("verifications") && <TabSiteVisits />}
      {activeTab.startsWith("approved") && <ApprovedFloorPlans onOpenProject={openProject} />}
      {activeTab.startsWith("projects") && <DesignerProjects currentUser={user} />}
    </DashShell>
  );
}
