import { useEffect, useState, useCallback, useMemo } from "react";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";

/**
 * DesignerProjectsPanel — replaces the old DesignerProjects component with a
 * mode-driven, lead-style list view + drill-in detail.
 *
 * Modes:
 *   - "active"    → in_progress projects with NO pending customer reviews.
 *                   Designer can download the floor plan + upload multiple
 *                   render files (each with a comment). After upload, project
 *                   migrates to "awaiting" automatically (because pending
 *                   images now exist).
 *   - "awaiting"  → in_progress projects with 1+ pending customer reviews.
 *                   View-only / locked.
 *   - "completed" → ready_for_quotation projects. View-only for designer
 *                   (admin can take quotation actions on its own dashboard).
 *
 * Customer phone/email are NEVER displayed — only customer name + project name.
 */
export default function DesignerProjectsPanel({ mode = "active" }) {
  const [projects, setProjects] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [active, setActive] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/design/projects");
      setProjects(data || []);
    } catch (err) { toast.error(formatApiError(err)); }
    finally { setLoading(false); }
  }, []);

  const loadActive = useCallback(async () => {
    if (!activeId) return setActive(null);
    try {
      const { data } = await api.get(`/admin/design/projects/${activeId}`);
      setActive(data);
    } catch (err) { toast.error(formatApiError(err)); }
  }, [activeId]);

  useEffect(() => { load(); }, [load, mode]);
  useEffect(() => { loadActive(); }, [loadActive]);

  // Reset selected project whenever the mode changes (it might not exist in the new bucket).
  useEffect(() => { setActiveId(null); setActive(null); }, [mode]);

  const filtered = useMemo(() => {
    return (projects || []).filter(p => {
      const status = p.lead?.status || p.status; // Fallback to p.status if no lead
      if (mode === "completed") {
        return ["Design Approved", "Ready for Quotation", "In Production", "Delivered"].includes(status) || p.status !== "in_progress";
      }
      if (mode === "awaiting") {
        return status === "Awaiting Customer Approval";
      }
      // active
      return ["Floor Plan Approved", "Floor Plan Rejected", "Designing"].includes(status);
    });
  }, [projects, mode]);

  const label = {
    active: { title: "Active Projects", help: "Approved floor plans. Upload renders with your notes — they'll move to Awaiting Approvals the moment they're sent to the customer." },
    awaiting: { title: "Awaiting Approvals", help: "Renders sent to customers. Locked — you can't take any action until the customer reviews them." },
    completed: { title: "Completed", help: "Final renders approved by the customer. View-only for designers; admin handles quotation from their dashboard." },
  }[mode];

  return (
    <div className="animate-in fade-in space-y-4" data-testid={`designer-${mode}-panel`}>
      <header className="flex items-center justify-between border-b border-[#EDE5DB] pb-3">
        <div>
          <h3 className="font-display text-xl text-[#0C1D42]">{label.title}</h3>
          <p className="text-xs text-[#333333]">{label.help}</p>
        </div>
        <button onClick={load} className="text-xs underline text-[#DA9E3E]" data-testid={`designer-${mode}-refresh`}>Refresh</button>
      </header>

      {loading && <p className="text-sm text-[#333333]">Loading…</p>}

      {!loading && !active && (
        <ProjectList
          mode={mode}
          projects={filtered}
          onPick={(id) => setActiveId(id)}
        />
      )}

      {!loading && active && (
        <ProjectDetail
          mode={mode}
          project={active}
          onBack={() => { setActiveId(null); setActive(null); }}
          onChanged={() => { load(); loadActive(); }}
        />
      )}
    </div>
  );
}


function ProjectList({ mode, projects, onPick }) {
  if (projects.length === 0) {
    return (
      <p className="bg-white border border-[#EDE5DB] p-6 text-center text-[#333333]"
         data-testid={`designer-${mode}-empty`}>
        No projects here yet.
      </p>
    );
  }
  return (
    <div className="bg-white border border-[#EDE5DB] overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-[#F5EDE8] text-left text-[10px] uppercase tracking-widest text-[#0C1D42]">
          <tr>
            <th className="px-4 py-3 font-bold">Customer</th>
            <th className="px-4 py-3 font-bold">Project</th>
            <th className="px-4 py-3 font-bold">Renders</th>
            <th className="px-4 py-3 font-bold">Updated</th>
          </tr>
        </thead>
        <tbody>
          {projects.map(p => {
            const renders = (p.images || []).length;
            const pending = (p.images || []).filter(i => i.customer_status === "pending").length;
            return (
              <tr
                key={p.project_id}
                onClick={() => onPick(p.project_id)}
                data-testid={`designer-project-row-${p.project_id}`}
                className="border-t border-[#EDE5DB] hover:bg-[#FCFAF5] cursor-pointer"
              >
                <td className="px-4 py-3 font-medium text-[#0C1D42]">{p.customer?.name || "—"}</td>
                <td className="px-4 py-3 text-[#333333]">{p.customer?.project_name || "—"}</td>
                <td className="px-4 py-3 text-[#333333]">
                  {renders} total
                  {pending > 0 && <span className="ml-1 text-[#DA9E3E]">• {pending} pending</span>}
                </td>
                <td className="px-4 py-3 text-[#333333]">{p.updated_at ? new Date(p.updated_at).toLocaleDateString() : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}


function ProjectDetail({ mode, project, onBack, onChanged }) {
  const backend = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/$/, "");
  const absUrl = (u) => (u && u.startsWith("http") ? u : `${backend}${u}`);

  // Floor-plan files come from the linked verification, surfaced on the user.
  // We always make them downloadable in the detail view.
  const floorPlans = (project.verification?.pdf_urls
                      || (project.verification?.pdf_url ? [project.verification.pdf_url] : []));

  const sortedImages = useMemo(() => {
    return [...(project.images || [])].sort((a, b) => (b.round || 0) - (a.round || 0));
  }, [project.images]);

  return (
    <article className="bg-white border border-[#EDE5DB] p-5 space-y-5"
             data-testid={`designer-${mode}-detail`}>
      <header className="flex items-start justify-between gap-3 border-b border-[#EDE5DB] pb-3">
        <div className="w-full">
          <button onClick={onBack} className="text-xs underline text-[#DA9E3E] mb-2"
                  data-testid={`designer-${mode}-back-btn`}>← Back to list</button>
          <div className="flex justify-between items-start w-full">
            <div>
              <h3 className="font-display text-xl text-[#0C1D42]">{project.customer?.name || "Customer"}</h3>
              {project.customer?.project_name && (
                <p className="text-xs text-[#333333] italic">{project.customer.project_name}</p>
              )}
              <p className="text-[10px] uppercase tracking-widest text-[#333333] mt-1">
                {project.status !== "in_progress" ? "Completed" : (mode === "awaiting" ? "Awaiting customer approval" : "Active")}
              </p>
            </div>
            
            {(project.verification?.budget_range || project.verification?.design_styles || project.verification?.room_requirements) && (
              <div className="bg-[#F5EDE8] p-3 border border-[#EDE5DB] text-xs space-y-1 min-w-[200px]">
                {project.verification.budget_range && (
                  <p><span className="font-bold text-[#0C1D42] uppercase tracking-widest text-[10px]">Budget:</span> {project.verification.budget_range}</p>
                )}
                {project.verification.design_styles && (
                  <p><span className="font-bold text-[#0C1D42] uppercase tracking-widest text-[10px]">Style:</span> {project.verification.design_styles}</p>
                )}
                {project.verification.room_requirements && (
                  <p><span className="font-bold text-[#0C1D42] uppercase tracking-widest text-[10px]">Rooms:</span> {project.verification.room_requirements}</p>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      <FloorPlanFiles files={floorPlans} absUrl={absUrl} testIdPrefix={`designer-${mode}`} />

      <SiteMeasurements project={project} onChanged={onChanged} absUrl={absUrl} />

      {mode === "active" && (
        <RenderUploader projectId={project.project_id} onUploaded={onChanged} />
      )}

      {mode === "awaiting" && (
        <div className="bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900"
             data-testid={`designer-${mode}-locked-banner`}>
          🔒 Locked — waiting for the customer to review the renders. If they request improvements, this project will move back to <strong>Active Projects</strong>.
        </div>
      )}

      <RenderHistory images={sortedImages} absUrl={absUrl} mode={mode} />
    </article>
  );
}


  function FloorPlanFiles({ files, absUrl, testIdPrefix }) {
    if (!files || files.length === 0) return null;
    return (
      <section>
        <h4 className="text-[10px] uppercase tracking-widest font-bold text-[#0C1D42] mb-2">
          Floor Plan Files
        </h4>
        <ul className="flex flex-wrap gap-2">
          {files.map((u, idx) => (
            <li key={idx}>
              <a
                href={absUrl(u)}
                target="_blank"
                rel="noopener noreferrer"
                download
                data-testid={`${testIdPrefix}-floor-plan-${idx}`}
                className="inline-block text-xs underline text-[#DA9E3E] hover:text-[#C88C2F] border border-[#EDE5DB] px-3 py-1.5"
              >
                📄 Download Floor Plan {idx + 1}
              </a>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  function SiteMeasurements({ project, onChanged, absUrl }) {
    const [file, setFile] = useState(null);
    const [notes, setNotes] = useState(project.site_measurements?.notes || "");
    const [isSaving, setIsSaving] = useState(false);

    const handleSave = async () => {
      setIsSaving(true);
      try {
        const formData = new FormData();
        if (notes) formData.append("notes", notes);
        if (file) formData.append("file", file);

        await api.post(`/admin/design/projects/${project.project_id}/measurements`, formData, {
          headers: { "Content-Type": "multipart/form-data" }
        });
        toast.success("Site measurements saved!");
        setFile(null);
        if (onChanged) onChanged();
      } catch (err) {
        toast.error(formatApiError(err));
      } finally {
        setIsSaving(false);
      }
    };

    return (
      <section className="bg-gray-50 border border-gray-200 p-4">
        <h4 className="text-[10px] uppercase tracking-widest font-bold text-[#0C1D42] mb-3">
          Site Measurements
        </h4>
        <div className="space-y-4">
          {project.site_measurements?.url && (
            <div>
              <p className="text-xs text-gray-500 mb-1">Current Measurement File:</p>
              <a
                href={absUrl(project.site_measurements.url)}
                target="_blank"
                rel="noopener noreferrer"
                download
                className="inline-block text-xs underline text-green-600 hover:text-green-800"
              >
                📄 Download {project.site_measurements.filename || "Measurements"}
              </a>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-[#333333] mb-1">Update Measurement File</label>
              <input
                type="file"
                onChange={(e) => setFile(e.target.files[0])}
                className="text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#333333] mb-1">Measurement Notes / Dimensions</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Master bed: 12x14, ceiling 9.5 ft..."
                className="w-full text-xs p-2 border border-[#EDE5DB] focus:outline-none focus:border-[#0C1D42] h-20"
              />
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={isSaving || (!file && notes === (project.site_measurements?.notes || ""))}
            className="bg-[#0C1D42] text-white px-4 py-2 text-[10px] uppercase tracking-widest font-bold disabled:opacity-50"
          >
            {isSaving ? "Saving..." : "Save Measurements"}
          </button>
        </div>
      </section>
    );
  }

  
  function RenderUploader({ projectId, onUploaded }) {
  // Each entry: { file: File, comment: string }
  const [entries, setEntries] = useState([]);
  const [busy, setBusy] = useState(false);

  const onPick = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setEntries(prev => [...prev, ...files.map(f => ({ file: f, comment: "" }))]);
    e.target.value = "";
  };

  const updateComment = (idx, val) => {
    setEntries(prev => prev.map((en, i) => i === idx ? { ...en, comment: val } : en));
  };

  const removeEntry = (idx) => {
    setEntries(prev => prev.filter((_, i) => i !== idx));
  };

  const allHaveComments = entries.length > 0 && entries.every(en => en.comment.trim());

  const upload = async () => {
    if (!allHaveComments) return toast.error("Each render needs a comment before sending.");
    setBusy(true);
    let ok = 0;
    for (const en of entries) {
      try {
        const form = new FormData();
        form.append("file", en.file);
        form.append("comment", en.comment.trim());
        await api.post(`/admin/design/projects/${projectId}/images`, form, {
          headers: { "Content-Type": "multipart/form-data" }
        });
        ok++;
      } catch (err) {
        toast.error(`Failed to upload ${en.file.name}: ${formatApiError(err)}`);
      }
    }
    if (ok > 0) {
      toast.success(`Sent ${ok} render${ok === 1 ? "" : "s"} to the customer.`);
      setEntries([]);
      onUploaded?.();
    }
    setBusy(false);
  };

  return (
    <section className="bg-[#FCFAF5] border border-[#EDE5DB] p-4 space-y-4"
             data-testid="designer-render-uploader">
      <h4 className="text-[10px] uppercase tracking-widest font-bold text-[#0C1D42]">
        Upload Renders — each with its own note for the customer
      </h4>

      {/* File picker */}
      <div>
        <input
          type="file"
          multiple
          accept=".png,.jpg,.jpeg,.webp,.pdf,image/png,image/jpeg,image/webp,application/pdf"
          onChange={onPick}
          disabled={busy}
          data-testid="designer-render-files-input"
          className="w-full p-2 border border-[#EDE5DB] text-sm bg-white file:mr-4 file:py-2 file:px-4 file:border-0 file:text-sm file:font-semibold file:bg-[#F5EDE8] file:text-[#0C1D42] hover:file:bg-[#EDE5DB] disabled:opacity-50"
        />
        {entries.length > 0 && (
          <p className="text-[10px] text-[#333333] mt-1">
            {entries.length} file{entries.length === 1 ? "" : "s"} selected — add a note for each render below.
          </p>
        )}
      </div>

      {/* Per-file comment rows */}
      {entries.length > 0 && (
        <ul className="space-y-3" data-testid="designer-render-files-preview">
          {entries.map((en, idx) => (
            <li key={idx}
                className="bg-white border border-[#EDE5DB] p-3 space-y-2"
                data-testid={`designer-render-entry-${idx}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-[#0C1D42] truncate">
                  {idx + 1}. {en.file.name}
                </span>
                <button
                  type="button"
                  onClick={() => removeEntry(idx)}
                  disabled={busy}
                  data-testid={`designer-render-remove-${idx}`}
                  className="text-[10px] text-[#DA9E3E] hover:text-[#C88C2F] underline whitespace-nowrap disabled:opacity-40"
                >
                  Remove
                </button>
              </div>
              <textarea
                value={en.comment}
                onChange={(e) => updateComment(idx, e.target.value)}
                placeholder={`Note for this render — what does it show? What should the customer review?`}
                disabled={busy}
                rows={2}
                data-testid={`designer-render-comment-${idx}`}
                className={`w-full p-2 border text-sm bg-white focus:outline-none resize-none ${
                  en.comment.trim() ? "border-[#0C1D42]" : "border-[#EDE5DB] focus:border-[#0C1D42]"
                }`}
              />
              {!en.comment.trim() && (
                <p className="text-[10px] text-red-500">Note required</p>
              )}
            </li>
          ))}
        </ul>
      )}

      {entries.length > 0 && (
        <button
          onClick={upload}
          disabled={busy || !allHaveComments}
          data-testid="designer-render-send-btn"
          className="bg-[#0C1D42] text-white px-4 py-2 text-xs uppercase tracking-widest font-bold hover:bg-[#08142D] disabled:opacity-40 w-full"
        >
          {busy
            ? "Sending…"
            : allHaveComments
              ? `Send ${entries.length} render${entries.length === 1 ? "" : "s"} to customer →`
              : `Add notes to all ${entries.length} renders to continue`}
        </button>
      )}
    </section>
  );
}


function RenderHistory({ images, absUrl, mode }) {
  if (images.length === 0) return null;
  return (
    <section>
      <h4 className="text-[10px] uppercase tracking-widest font-bold text-[#0C1D42] mb-2">
        Render History
      </h4>
      <ul className="space-y-3">
        {images.map(img => (
          <li key={img.image_id}
              className="border border-[#EDE5DB] p-3 flex flex-col md:flex-row gap-3"
              data-testid={`designer-${mode}-render-${img.image_id}`}>
            <a href={absUrl(img.url)} target="_blank" rel="noopener noreferrer" className="md:w-40 shrink-0">
              <img src={absUrl(img.url)} alt={img.filename || "render"} className="w-full h-32 object-cover border border-[#EDE5DB]" loading="lazy" />
            </a>
            <div className="flex-1 text-sm">
              <p className="text-[10px] uppercase tracking-widest text-[#333333]">
                Round {img.round} • {new Date(img.uploaded_at).toLocaleDateString()}
              </p>
              <p className="text-[#0C1D42] mt-1"><strong>Designer note:</strong> {img.designer_comment}</p>
              <p className="text-xs mt-2">
                Status:{" "}
                <StatusPill status={img.customer_status} />
              </p>
              {img.customer_comment && (
                <p className="text-xs text-[#333333] mt-1"><strong>Customer feedback:</strong> {img.customer_comment}</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}


function StatusPill({ status }) {
  const styles = {
    approved:           "bg-green-100 text-green-800 border-green-300",
    needs_improvement:  "bg-red-100 text-red-800 border-red-300",
    pending:            "bg-amber-100 text-amber-900 border-amber-300",
  };
  return (
    <span className={`inline-block text-[10px] uppercase tracking-widest border px-2 py-0.5 ${styles[status] || styles.pending}`}>
      {status === "needs_improvement" ? "Needs Improvement" : status}
    </span>
  );
}
