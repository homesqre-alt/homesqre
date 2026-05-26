import { useEffect, useState, useCallback } from "react";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";

/**
 * ApprovedFloorPlans — designer-side queue of floor plans that have already
 * been approved. Each card exposes the uploaded floor-plan files plus a quick
 * jump to the customer's 3D design project so the designer can start uploading
 * renders. No email/mobile — privacy.
 *
 * `onOpenProject(project_id)` switches the parent dashboard to the Active
 * Projects (3D) tab with that project pre-selected.
 */
export default function ApprovedFloorPlans({ onOpenProject }) {
  const [verifications, setVerifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/admin/verifications");
      setVerifications(data || []);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const approved = verifications.filter(v => v.status === "approved");
  const backend = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/$/, "");
  const absUrl = (url) => (url && url.startsWith("http") ? url : `${backend}${url}`);

  if (loading) return <p className="text-sm text-[#4A5D54]">Loading approved floor plans…</p>;

  return (
    <div className="animate-in fade-in space-y-6" data-testid="approved-floor-plans">
      <header className="flex items-center justify-between border-b border-[#E8E4D9] pb-3">
        <div>
          <h3 className="font-display text-xl text-[#06402B]">Approved Floor Plans</h3>
          <p className="text-xs text-[#4A5D54]">
            Customers are already informed that design has started. Use the floor plans below as your reference, then upload your renders from <strong>Active Projects (3D)</strong>.
          </p>
        </div>
        <button onClick={load} className="text-xs underline text-[#B68D40]" data-testid="approved-refresh-btn">Refresh</button>
      </header>

      {approved.length === 0 && (
        <p className="bg-white border border-[#E8E4D9] p-6 text-center text-[#4A5D54]" data-testid="approved-empty">
          No approved floor plans yet. They&apos;ll appear here automatically the moment you approve a verification.
        </p>
      )}

      <div className="space-y-4">
        {approved.map(v => {
          const files = (v.pdf_urls && v.pdf_urls.length > 0) ? v.pdf_urls : (v.pdf_url ? [v.pdf_url] : []);
          return (
            <article
              key={v.verification_id}
              data-testid={`approved-card-${v.verification_id}`}
              className="bg-white border border-[#E8E4D9] p-5"
            >
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div className="flex-1">
                  <p className="text-[10px] uppercase tracking-widest text-[#B68D40] font-bold mb-1">
                    {v.customer?.name || "Customer"}
                    {v.customer?.project_name ? ` — ${v.customer.project_name}` : ""}
                  </p>
                  <h4 className="font-display text-lg text-[#06402B] capitalize">
                    {v.bhk_or_units} {v.property_type}
                  </h4>
                  <p className="text-xs text-[#4A5D54] mt-1">{v.room_requirements || "No special notes."}</p>

                  <div className="mt-3 flex flex-wrap gap-2 items-center">
                    <span className="text-[10px] uppercase tracking-widest text-[#4A5D54]">Site Visit:</span>
                    {v.site_visit_at ? (
                      <span className="text-xs bg-green-50 border border-green-200 text-green-800 px-2 py-0.5"
                            data-testid={`site-visit-${v.verification_id}`}>
                        ✓ {new Date(v.site_visit_at).toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-xs bg-amber-50 border border-amber-200 text-amber-900 px-2 py-0.5"
                            data-testid={`site-visit-pending-${v.verification_id}`}>
                        Awaiting customer to schedule
                      </span>
                    )}
                  </div>
                </div>

                <div className="md:w-72 space-y-2">
                  <p className="text-[10px] uppercase tracking-widest font-bold text-[#06402B]">Floor Plan Files</p>
                  {files.length === 0 && <p className="text-xs text-gray-400">No files attached.</p>}
                  {files.map((u, idx) => (
                    <a
                      key={idx}
                      href={absUrl(u)}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-testid={`approved-file-${v.verification_id}-${idx}`}
                      className="block text-xs underline text-[#B68D40] hover:text-[#9d7936] truncate"
                    >
                      Floor Plan {idx + 1}
                    </a>
                  ))}
                  {v.design_project_id ? (
                    <button
                      onClick={() => onOpenProject?.(v.design_project_id)}
                      data-testid={`open-design-project-${v.verification_id}`}
                      className="w-full bg-[#06402B] text-white px-4 py-2 text-xs uppercase tracking-widest font-bold hover:bg-[#0a5839]"
                    >
                      Open Design Project →
                    </button>
                  ) : (
                    <p className="text-[10px] text-gray-400 italic">Design project will be created on next refresh.</p>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
