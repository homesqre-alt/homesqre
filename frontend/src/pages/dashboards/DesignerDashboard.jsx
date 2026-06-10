import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { Navigate, useLocation } from "react-router-dom";
import DashShell from "@/components/layout/DashShell";
import { TabSiteVisits } from "./AdminDashboard";
import DesignerLeadsList from "@/components/admin/DesignerLeadsList";
import DesignerProjectsPanel from "@/components/admin/DesignerProjectsPanel";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";

const LINKS = [
  { to: "#leads",      label: "My Leads" },
  { to: "#verify",     label: "Verify Floor Plan" },
  { to: "#visits",     label: "Site Visits" },
  { to: "#active",     label: "Active Projects" },
  { to: "#awaiting",   label: "Awaiting Approvals" },
  { to: "#completed",  label: "Completed" },
];

// Site Visits manager tab — shows all projects with scheduled site visits
function TabDesignerSiteVisits() {
  const [projects, setProjects] = useState([]);
  const [uploading, setUploading] = useState({});

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/admin/design/projects");
      const withVisits = (data || []).filter(p => p.site_visit_at);
      setProjects(withVisits);
    } catch (err) {
      toast.error("Failed to load site visits.");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleMeasurementUpload = async (projectId, e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(prev => ({ ...prev, [projectId]: true }));
    try {
      const form = new FormData();
      form.append("file", file);
      const { data } = await api.post("/upload", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success(`Measurement sheet uploaded: ${file.name}`);
      load();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setUploading(prev => ({ ...prev, [projectId]: false }));
      e.target.value = "";
    }
  };

  if (projects.length === 0) {
    return (
      <div className="bg-white border border-[#EDE5DB] p-8 text-center text-gray-500 text-sm">
        No site visits scheduled yet. Once a customer books a visit date, it will appear here.
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in">
      <h3 className="font-display text-xl text-[#0C1D42] mb-4">Scheduled Site Visits</h3>
      {projects.map(p => (
        <div key={p.project_id} className="bg-white border border-[#EDE5DB] p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-widest text-[#DA9E3E] font-bold mb-1">
                {p.customer?.name || "Customer"}
                {p.customer?.project_name ? ` — ${p.customer.project_name}` : ""}
              </p>
              <p className="font-display text-lg text-[#0C1D42]">
                {new Date(p.site_visit_at).toLocaleString('en-IN', {
                  dateStyle: 'full', timeStyle: 'short'
                })}
              </p>
              <p className="text-xs text-[#333333] mt-1">Project: {p.project_id}</p>
            </div>
            <div>
              <label className="cursor-pointer bg-[#0C1D42] text-white px-4 py-2 text-xs uppercase tracking-widest font-bold hover:bg-[#08142D] transition">
                {uploading[p.project_id] ? "Uploading…" : "Upload Measurement Sheet"}
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp"
                  className="hidden"
                  disabled={uploading[p.project_id]}
                  onChange={(e) => handleMeasurementUpload(p.project_id, e)}
                />
              </label>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

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
      <div className="flex gap-4 border-b border-[#EDE5DB] mb-6 pb-2 overflow-x-auto" data-testid="designer-tabs">
        {LINKS.map(link => {
          const key = link.to.slice(1);
          return (
            <button
              key={link.to}
              data-testid={`designer-tab-${key}`}
              onClick={() => { window.location.hash = link.to; }}
              className={`text-sm font-medium pb-2 whitespace-nowrap ${
                activeTab === key
                  ? "text-[#0C1D42] border-b-2 border-[#0C1D42]"
                  : "text-gray-400 hover:text-[#0C1D42]"
              }`}
            >
              {link.label}
            </button>
          );
        })}
      </div>

      {activeTab === "leads"     && <DesignerLeadsList />}
      {activeTab === "verify"    && <TabSiteVisits />}
      {activeTab === "visits"    && <TabDesignerSiteVisits />}
      {activeTab === "active"    && <DesignerProjectsPanel mode="active" />}
      {activeTab === "awaiting"  && <DesignerProjectsPanel mode="awaiting" />}
      {activeTab === "completed" && <DesignerProjectsPanel mode="completed" />}
    </DashShell>
  );
}
