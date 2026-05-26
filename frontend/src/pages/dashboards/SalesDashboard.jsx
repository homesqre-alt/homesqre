import { useAuth } from "@/context/AuthContext";
import { Navigate } from "react-router-dom";
import DashShell from "@/components/layout/DashShell";
import MasterLeadPipeline from "@/components/admin/MasterLeadPipeline";

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
        <p className="text-[#4A5D54] max-w-2xl text-sm">
          Leads assigned to you. Add new leads, update status, set follow-ups and post comments. Basic info edits and deletion are admin-only.
        </p>
      </div>
      <MasterLeadPipeline mode="sales" currentUser={user} />
    </DashShell>
  );
}
