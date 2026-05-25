import { useAuth } from "@/context/AuthContext";
import { Navigate } from "react-router-dom";
import DashShell from "@/components/layout/DashShell";
import { TabSiteVisits } from "./AdminDashboard";

const LINKS = [
  { to: "/dashboard/designer", label: "Verification & Site Visits" },
];

export default function DesignerDashboard() {
  const { user } = useAuth();

  if (user === undefined) return null;
  if (user === null) return <Navigate to="/login" />;
  if (user.role !== "designer") {
    if (user.role === "admin") return <Navigate to="/dashboard/admin" />;
    if (user.role === "sales") return <Navigate to="/dashboard/sales" />;
    return <Navigate to="/" />;
  }

  return (
    <DashShell links={LINKS} title="Designer Studio">
      <div className="mb-8">
        <p className="text-[#4A5D54] max-w-2xl text-sm">
          Review uploaded floor plans, approve them to push clients into scheduling, or reject mismatches.
        </p>
      </div>
      <TabSiteVisits />
    </DashShell>
  );
}
