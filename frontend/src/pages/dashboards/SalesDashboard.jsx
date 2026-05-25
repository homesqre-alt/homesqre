import { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { Navigate } from "react-router-dom";
import DashShell from "@/components/layout/DashShell";
import { TabDiscoveryCalls } from "./AdminDashboard";

const LINKS = [
  { to: "/dashboard/sales", label: "Discovery Calls (CRM)" },
];

export default function SalesDashboard() {
  const { user } = useAuth();

  // Browser notification permission (same as AdminDashboard)
  useEffect(() => {
    if ("Notification" in window && Notification.permission !== "granted") {
      Notification.requestPermission();
    }
  }, []);

  const triggerNotification = (title, body) => {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(title, { body, icon: "/favicon.ico" });
    }
  };

  if (user === undefined) return null;
  if (user === null) return <Navigate to="/login" />;
  if (user.role !== "sales") {
    if (user.role === "admin") return <Navigate to="/dashboard/admin" />;
    if (user.role === "designer") return <Navigate to="/dashboard/designer" />;
    return <Navigate to="/" />;
  }

  return (
    <DashShell links={LINKS} title="Sales Command Center">
      <div className="mb-8">
        <p className="text-[#4A5D54] max-w-2xl text-sm">
          Your active discovery-call queue. Leads auto-reassign after 15 minutes if not marked Connected or Missed.
        </p>
      </div>
      <TabDiscoveryCalls triggerNotification={triggerNotification} currentUser={user} />
    </DashShell>
  );
}
