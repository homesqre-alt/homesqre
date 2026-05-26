import { useState } from "react";
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
