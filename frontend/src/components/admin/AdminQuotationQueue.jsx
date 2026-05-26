import { useEffect, useState, useCallback } from "react";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";

/**
 * AdminQuotationQueue — admin's "Ready Design Awaiting Quotation" tab.
 * Lists design projects in status=ready_for_quotation with a quotation_status
 * dropdown drawing from `crm_statuses` (Q Sent, Q Accepted, Won, Lost, etc.
 * configurable via CRM Settings tab).
 */
export default function AdminQuotationQueue() {
  const [projects, setProjects] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [busyId, setBusyId] = useState(null);

  const backend = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/$/, "");
  const absUrl = (url) => (url && url.startsWith("http") ? url : `${backend}${url}`);

  const load = useCallback(async () => {
    try {
      const [p, s] = await Promise.all([
        api.get("/admin/design/projects?status_filter=ready_for_quotation"),
        api.get("/crm/statuses"),
      ]);
      setProjects(p.data); setStatuses(s.data);
    } catch (err) { toast.error(formatApiError(err)); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const changeStatus = async (project_id, value) => {
    setBusyId(project_id);
    try {
      await api.put(`/admin/design/projects/${project_id}/quotation-status`, { quotation_status: value });
      toast.success("Quotation status updated");
      load();
    } catch (err) { toast.error(formatApiError(err)); }
    finally { setBusyId(null); }
  };

  return (
    <div className="space-y-6" data-testid="admin-quotation-queue">
      <header>
        <h2 className="font-display text-2xl text-[#06402B]">Ready Designs — Awaiting Quotation</h2>
        <p className="text-xs text-[#4A5D54]">Projects with all renders approved by the customer. Update the quotation status as you progress through the funnel (Q Sent, Q Accepted, etc — configure in CRM Settings).</p>
      </header>
      {projects.length === 0 && <p className="bg-white border border-[#E8E4D9] p-6 text-center text-[#4A5D54]">No projects awaiting quotation yet.</p>}
      <div className="space-y-4">
        {projects.map(p => (
          <article key={p.project_id} className="border border-[#E8E4D9] bg-white p-4" data-testid={`quotation-card-${p.project_id}`}>
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div>
                <h3 className="font-display text-lg text-[#06402B]">{p.customer?.name || p.user_id}</h3>
                <p className="text-xs text-[#4A5D54]">{p.customer?.email} • {p.customer?.mobile}</p>
                <p className="text-xs text-[#4A5D54] mt-1">{(p.images || []).length} approved render(s) • Approved on {new Date(p.approved_at || p.updated_at).toLocaleDateString()}</p>
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-widest font-bold text-[#06402B] mb-1">Quotation Status</label>
                <select
                  data-testid={`quotation-status-${p.project_id}`}
                  disabled={busyId === p.project_id}
                  value={p.quotation_status || ""}
                  onChange={(e) => changeStatus(p.project_id, e.target.value)}
                  className="p-2 text-sm border border-[#E8E4D9] bg-white min-w-[220px]"
                >
                  <option value="" disabled>— select —</option>
                  {statuses.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
              {(p.images || []).slice(0, 8).map(img => (
                <a key={img.image_id} href={absUrl(img.url)} target="_blank" rel="noopener noreferrer">
                  <img src={absUrl(img.url)} alt={img.designer_comment}
                       className="w-full aspect-video object-cover border border-[#E8E4D9]" />
                </a>
              ))}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
