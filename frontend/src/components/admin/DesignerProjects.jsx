import { useEffect, useState, useCallback } from "react";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";

/**
 * DesignerProjects — designer's "Active Projects" view. Shows the project list
 * on the left, the selected project's image queue on the right with an upload
 * form that REQUIRES a comment per image. Customer feedback (approved /
 * needs_improvement + comment) shows inline.
 */
export default function DesignerProjects({ currentUser }) {
  const [projects, setProjects] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [active, setActive] = useState(null);

  // Honor ?focus=<project_id> from the URL hash so the Approved tab can
  // deep-link straight to a specific project.
  useEffect(() => {
    const sync = () => {
      const m = window.location.hash.match(/[?&]focus=([^&]+)/);
      if (m) setActiveId(decodeURIComponent(m[1]));
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/admin/design/projects");
      setProjects(data);
      if (!activeId && data[0]) setActiveId(data[0].project_id);
    } catch (err) { toast.error(formatApiError(err)); }
  }, [activeId]);
  useEffect(() => { load(); }, [load]);

  const loadActive = useCallback(async () => {
    if (!activeId) { setActive(null); return; }
    try {
      const { data } = await api.get(`/admin/design/projects/${activeId}`);
      setActive(data);
    } catch (err) { toast.error(formatApiError(err)); }
  }, [activeId]);
  useEffect(() => { loadActive(); }, [loadActive]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6" data-testid="designer-projects">
      <aside className="border border-[#E8E4D9] bg-white p-3 max-h-[70vh] overflow-y-auto">
        <h4 className="text-xs uppercase tracking-widest font-bold text-[#06402B] mb-2">Active Projects</h4>
        {projects.length === 0 && <p className="text-xs text-[#4A5D54]">No projects yet.</p>}
        {projects.map(p => (
          <button
            key={p.project_id}
            onClick={() => setActiveId(p.project_id)}
            data-testid={`designer-project-${p.project_id}`}
            className={`w-full text-left p-2 border-l-2 ${activeId === p.project_id ? "border-[#B68D40] bg-[#F3F0E9]" : "border-transparent hover:bg-[#F3F0E9]"}`}
          >
            <div className="text-sm font-semibold text-[#06402B]">{p.customer?.name || "Customer"}</div>
            {p.customer?.project_name && (
              <div className="text-[10px] text-[#4A5D54] italic">{p.customer.project_name}</div>
            )}
            <div className="text-[10px] mt-1">
              <span className={`px-2 py-0.5 ${p.status === "ready_for_quotation" ? "bg-green-100 text-green-800" : "bg-[#FFF8EC] text-[#B68D40]"}`}>
                {p.status === "ready_for_quotation" ? "✓ Approved" : `${(p.images || []).length} render(s)`}
              </span>
            </div>
          </button>
        ))}
      </aside>

      <section>
        {active ? <ProjectDetail project={active} onReload={() => { load(); loadActive(); }} currentUser={currentUser} /> :
          <p className="text-sm text-[#4A5D54]">Select a project on the left.</p>}
      </section>
    </div>
  );
}

function ProjectDetail({ project, onReload, currentUser }) {
  const [file, setFile] = useState(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const isDesigner = currentUser?.role === "designer";

  const backend = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/$/, "");
  const absUrl = (url) => (url && url.startsWith("http") ? url : `${backend}${url}`);

  const upload = async (e) => {
    e.preventDefault();
    if (!file) return toast.error("Pick an image first");
    if (!comment.trim()) return toast.error("Comment is required for every render");
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("comment", comment.trim());
      await api.post(`/admin/design/projects/${project.project_id}/images`, form, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      toast.success("Render uploaded — customer notified.");
      setFile(null); setComment("");
      // reset file input
      document.querySelector("[data-testid='designer-image-input']").value = "";
      onReload();
    } catch (err) { toast.error(formatApiError(err)); }
    finally { setBusy(false); }
  };

  const pending = (project.images || []).filter(i => i.customer_status === "pending");
  const improvement = (project.images || []).filter(i => i.customer_status === "needs_improvement");
  const approved = (project.images || []).filter(i => i.customer_status === "approved");

  return (
    <div className="space-y-6">
      <header className="border-b border-[#E8E4D9] pb-3">
        <h3 className="font-display text-xl text-[#06402B]">{project.customer?.name || project.user_id}</h3>
        {isDesigner ? (
          project.customer?.project_name && (
            <p className="text-xs text-[#4A5D54] italic" data-testid="designer-project-name">{project.customer.project_name}</p>
          )
        ) : (
          <p className="text-xs text-[#4A5D54]">
            {project.customer?.project_name && <span className="italic">{project.customer.project_name} • </span>}
            {project.customer?.email} • {project.customer?.mobile}
          </p>
        )}
        {project.site_visit_at && (
          <p className="text-[11px] text-[#06402B] mt-1" data-testid="project-site-visit">
            <strong>Site Visit:</strong> {new Date(project.site_visit_at).toLocaleString()}
          </p>
        )}
        <div className="mt-2 flex flex-wrap gap-3 text-xs">
          <span className="px-3 py-1 bg-[#F3F0E9] border border-[#E8E4D9]">Status: {project.status}</span>
          <span className="px-3 py-1 bg-amber-50 border border-amber-200 text-amber-800">Pending: {pending.length}</span>
          <span className="px-3 py-1 bg-amber-50 border border-amber-300 text-amber-900">Needs improvement: {improvement.length}</span>
          <span className="px-3 py-1 bg-green-50 border border-green-200 text-green-800">Approved: {approved.length}</span>
        </div>
      </header>

      <LeadInlinePanel project={project} onChanged={onReload} />

      {project.status === "in_progress" && (
        <form onSubmit={upload} data-testid="designer-upload-form" className="bg-[#F3F0E9] border border-[#E8E4D9] p-4 space-y-3">
          <h4 className="text-xs uppercase tracking-widest font-bold text-[#06402B]">Upload new render</h4>
          <input
            type="file"
            data-testid="designer-image-input"
            accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="w-full p-2 border border-[#E8E4D9] text-sm bg-white"
          />
          <textarea
            data-testid="designer-image-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows="2"
            required
            placeholder="Mandatory note for the customer about this render (room, materials, design intent)…"
            className="w-full p-2 border border-[#E8E4D9] text-sm bg-white focus:outline-none focus:border-[#06402B]"
          />
          <button type="submit" disabled={busy || !file || !comment.trim()}
                  data-testid="designer-image-submit"
                  className="bg-[#06402B] text-white px-4 py-2 text-xs uppercase tracking-widest font-bold disabled:opacity-50 hover:bg-[#0a5839]">
            {busy ? "Uploading…" : "Send to customer"}
          </button>
        </form>
      )}

      {improvement.length > 0 && (
        <Block title="Needs improvement (uploaded again)" tint="amber">
          {improvement.map(img => (
            <Card key={img.image_id} img={img} absUrl={absUrl}>
              <div className="bg-amber-50 border border-amber-200 p-2 text-xs text-amber-900 mt-2">
                <strong>Customer says:</strong> {img.customer_comment || "(no comment)"}
              </div>
            </Card>
          ))}
        </Block>
      )}
      {pending.length > 0 && (
        <Block title="Pending customer review" tint="cream">
          {pending.map(img => <Card key={img.image_id} img={img} absUrl={absUrl} />)}
        </Block>
      )}
      {approved.length > 0 && (
        <Block title="Approved" tint="green">
          {approved.map(img => <Card key={img.image_id} img={img} absUrl={absUrl} />)}
        </Block>
      )}
    </div>
  );
}

function Block({ title, children }) {
  return (
    <section>
      <h4 className="text-xs uppercase tracking-widest font-bold text-[#06402B] mb-3">{title}</h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{children}</div>
    </section>
  );
}

function Card({ img, absUrl, children }) {
  return (
    <div className="bg-white border border-[#E8E4D9]">
      <div className="aspect-video bg-[#F3F0E9] overflow-hidden">
        <a href={absUrl(img.url)} target="_blank" rel="noopener noreferrer">
          <img src={absUrl(img.url)} alt={img.designer_comment} className="w-full h-full object-cover" />
        </a>
      </div>
      <div className="p-3 text-xs">
        <p className="font-semibold text-[#06402B]">Round {img.round}</p>
        <p className="mt-1 text-[#4A5D54] whitespace-pre-wrap">{img.designer_comment}</p>
        {children}
      </div>
    </div>
  );
}


/**
 * LeadInlinePanel — inline lead status + comment + follow-up controls shown on
 * each active design project so the designer can keep the lead in sync without
 * leaving the page. Mirrors the workflow controls from MasterLeadPipeline's
 * detail drawer (status + comment + follow-up datetime).
 */
function LeadInlinePanel({ project, onChanged }) {
  const [statuses, setStatuses] = useState([]);
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState("");
  const [leadStatus, setLeadStatus] = useState(project.lead?.status || "");
  const [followup, setFollowup] = useState(project.lead?.next_followup_at?.slice(0, 16) || "");

  useEffect(() => {
    setLeadStatus(project.lead?.status || "");
    setFollowup(project.lead?.next_followup_at?.slice(0, 16) || "");
  }, [project.lead?.lead_id, project.lead?.status, project.lead?.next_followup_at]);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/crm/statuses");
        setStatuses(data || []);
      } catch (e) { /* non-fatal */ }
    })();
  }, []);

  const leadId = project.lead?.lead_id;

  if (!leadId) {
    return (
      <div className="bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900" data-testid="lead-inline-missing">
        This design project has no linked lead yet. It will auto-link on the next status change or render upload.
      </div>
    );
  }

  const changeStatus = async (next) => {
    setBusy(true);
    try {
      await api.put(`/leads/${leadId}/status`, { status: next });
      setLeadStatus(next);
      toast.success("Lead status updated");
      onChanged?.();
    } catch (err) { toast.error(formatApiError(err)); }
    finally { setBusy(false); }
  };

  const setFollowupOn = async (when) => {
    setBusy(true);
    try {
      await api.put(`/leads/${leadId}/followup`, { next_followup_at: when || null });
      setFollowup(when || "");
      toast.success("Follow-up updated");
    } catch (err) { toast.error(formatApiError(err)); }
    finally { setBusy(false); }
  };

  const postComment = async () => {
    if (!comment.trim()) return;
    setBusy(true);
    try {
      await api.post(`/leads/${leadId}/comments`, { text: comment.trim() });
      setComment("");
      toast.success("Comment added to lead");
    } catch (err) { toast.error(formatApiError(err)); }
    finally { setBusy(false); }
  };

  return (
    <section className="bg-white border border-[#E8E4D9] p-4 space-y-3" data-testid="lead-inline-panel">
      <header className="flex items-center justify-between">
        <h4 className="text-xs uppercase tracking-widest font-bold text-[#06402B]">Linked Lead</h4>
        <span className="text-[10px] text-[#4A5D54] font-mono">{leadId}</span>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-[10px] uppercase tracking-widest font-bold text-[#06402B] mb-1">Status</span>
          <select
            data-testid="lead-inline-status"
            disabled={busy}
            value={leadStatus}
            onChange={(e) => changeStatus(e.target.value)}
            className="w-full p-2 text-sm border border-[#E8E4D9] focus:outline-none focus:border-[#06402B] bg-white"
          >
            {statuses.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="block text-[10px] uppercase tracking-widest font-bold text-[#06402B] mb-1">Next Follow-up</span>
          <input
            type="datetime-local"
            data-testid="lead-inline-followup"
            disabled={busy}
            value={followup}
            onChange={(e) => setFollowupOn(e.target.value)}
            className="w-full p-2 text-sm border border-[#E8E4D9] focus:outline-none focus:border-[#06402B] bg-white"
          />
        </label>
      </div>

      <div className="flex gap-2">
        <input
          data-testid="lead-inline-comment-input"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Add a comment to this lead (visible to admin & sales)…"
          className="flex-1 p-2 text-sm border border-[#E8E4D9] focus:outline-none focus:border-[#06402B] bg-white"
        />
        <button
          onClick={postComment}
          disabled={!comment.trim() || busy}
          data-testid="lead-inline-comment-btn"
          className="px-4 py-2 text-xs uppercase tracking-widest bg-[#06402B] text-white font-bold disabled:opacity-40 hover:bg-[#0a5839]"
        >
          Post
        </button>
      </div>
    </section>
  );
}
