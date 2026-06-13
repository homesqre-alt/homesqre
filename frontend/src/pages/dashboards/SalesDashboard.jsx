import { useAuth } from "@/context/AuthContext";
import { Navigate } from "react-router-dom";
import DashShell from "@/components/layout/DashShell";
import MasterLeadPipeline from "@/components/admin/MasterLeadPipeline";
import SalesAnalyticsPanel from "@/components/sales/SalesAnalyticsPanel";
import FloorPlanAssignments from "@/components/sales/FloorPlanAssignments";

const LINKS = [
  { to: "/dashboard/sales", label: "My Leads" },
];

export default function SalesDashboard() {
  const { user } = useAuth();

  if (user === undefined) return null;
  if (user === null) return <Navigate to="/login" />;
  if (user.role !== "sales") {
    if (user.role === "admin") return <Navigate to="/dashboard/admin" />;
    if (user.role === "designer") return <Navigate to="/dashboard/designer" />;
    return <Navigate to="/" />;
  }

  return (
    <DashShell links={LINKS} title="Sales Command Center">
      <div className="mb-6">
        <p className="text-[#333333] max-w-2xl text-sm">
          Assign packages and discounts to newly submitted floor plans. Manage your leads below.
        </p>
      </div>
      <SalesAnalyticsPanel />
      
      <div className="mt-8 mb-8">
        <FloorPlanAssignments />
      </div>

      <MasterLeadPipeline mode="sales" currentUser={user} />
    </DashShell>
  );
}
