import { useEffect, useState, useCallback } from "react";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";

/**
 * CustomerDesignReview — rendered inside CustomerDashboard when project_phase
 * is 'designing' or 'ready_for_quotation'. Lists designer-uploaded renders
 * with per-image Approve / Need Improvement actions.
 */
export default function CustomerDesignReview({ phase, onProjectAdvance }) {
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rejecting, setRejecting] = useState(null);    // image being commented on
  const [reasonText, setReasonText] = useState("");
  const [busy, setBusy] = useState(false);

  const backend = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/$/, "");
  const absUrl = (url) => (url && url.startsWith("http") ? url : `${backend}${url}`);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/design/my-project");
      setProject(data);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const approve = async (img) => {
    setBusy(true);
    try {
      const { data } = await api.put(`/design/my-project/images/${img.image_id}/review`, { decision: "approved" });
      toast.success("Approved.");
      if (data.ready_for_quotation) {
        toast.success("All designs approved — moving to quotation!");
        onProjectAdvance?.();
      }
      await load();
    } catch (err) { toast.error(formatApiError(err)); }
    finally { setBusy(false); }
  };

  const submitImprovement = async () => {
    if (!reasonText.trim()) {
      toast.error("Please describe what needs improvement");
      return;
    }
    setBusy(true);
    try {
      await api.put(`/design/my-project/images/${rejecting.image_id}/review`, {
        decision: "needs_improvement", comment: reasonText.trim(),
      });
      toast.success("Feedback sent to designer.");
      setRejecting(null); setReasonText("");
      await load();
    } catch (err) { toast.error(formatApiError(err)); }
    finally { setBusy(false); }
  };

  if (loading) return <p className="text-[#333333]">Loading your designs…</p>;
  if (!project) {
    return (
      <div className="bg-white border border-[#E8E4D9] p-8 text-center text-[#333333]">
        Your designer hasn't uploaded any renders yet. We'll notify you as soon as the first batch is ready.
      </div>
    );
  }

  const pending = (project.images || []).filter(i => i.customer_status === "pending");
  const approved = (project.images || []).filter(i => i.customer_status === "approved");
  const needsImprovement = (project.images || []).filter(i => i.customer_status === "needs_improvement");

  return (
    <div className="space-y-10" data-testid="customer-design-review">
      <header className="border-b border-[#E8E4D9] pb-4">
        <h3 className="font-display text-2xl text-[#0C1D42]">Your 3D Designs</h3>
        <p className="text-sm text-[#333333] mt-1">
          Review each render. Approve the ones you love, or request improvements with notes for your designer.
        </p>
        <div className="mt-3 flex gap-4 text-xs">
          <span className="bg-[#F3F0E9] border border-[#E8E4D9] px-3 py-1">Pending: {pending.length}</span>
          <span className="bg-green-50 border border-green-200 text-green-800 px-3 py-1">Approved: {approved.length}</span>
          <span className="bg-amber-50 border border-amber-200 text-amber-800 px-3 py-1">Improvement: {needsImprovement.length}</span>
        </div>
        {project.status === "ready_for_quotation" && (
          <div className="mt-4 bg-[#FCFAF5] border border-[#DA9E3E] p-3 text-sm text-[#0C1D42]">
            🎉 All designs approved! Your detailed quotation is being prepared.
          </div>
        )}
      </header>

      {pending.length > 0 && <Section title="Awaiting your review" items={pending}
        renderActions={(img) => (
          <div className="flex gap-2 mt-3">
            <button onClick={() => approve(img)} disabled={busy}
                    data-testid={`approve-img-${img.image_id}`}
                    className="bg-[#0C1D42] text-white px-4 py-2 text-xs uppercase tracking-widest font-bold hover:bg-[#08142D] disabled:opacity-50">
              Approve
            </button>
            <button onClick={() => { setRejecting(img); setReasonText(""); }}
                    data-testid={`improve-img-${img.image_id}`}
                    disabled={busy}
                    className="border border-[#DA9E3E] text-[#DA9E3E] px-4 py-2 text-xs uppercase tracking-widest font-bold hover:bg-[#FCFAF5] disabled:opacity-50">
              Need Improvement
            </button>
          </div>
        )}
        absUrl={absUrl} />}

      {needsImprovement.length > 0 && <Section title="Your feedback sent" items={needsImprovement} dimmed
        renderActions={(img) => (
          <div className="mt-2 text-xs italic text-amber-800">
            Your note: {img.customer_comment}
          </div>
        )}
        absUrl={absUrl} />}

      {approved.length > 0 && <Section title="Approved" items={approved} dimmed
        renderActions={() => <p className="text-xs text-green-700 mt-2">✓ Approved by you</p>}
        absUrl={absUrl} />}

      {rejecting && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setRejecting(null)}>
          <div onClick={(e) => e.stopPropagation()} data-testid="improvement-modal"
               className="bg-white max-w-md w-full p-6">
            <h4 className="font-display text-xl text-[#0C1D42] mb-2">What needs improvement?</h4>
            <p className="text-xs text-[#333333] mb-3">Be specific so your designer can address it precisely (lighting, layout, materials, colours).</p>
            <textarea data-testid="improvement-comment"
                      autoFocus value={reasonText} onChange={(e) => setReasonText(e.target.value)} rows="4"
                      className="w-full p-2 border border-[#E8E4D9] text-sm focus:outline-none focus:border-[#0C1D42]"
                      placeholder="e.g. The sofa colour clashes with the wall paint…" />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setRejecting(null)} className="px-4 py-2 text-xs uppercase tracking-widest border border-[#E8E4D9]">Cancel</button>
              <button onClick={submitImprovement} disabled={busy || !reasonText.trim()}
                      data-testid="improvement-submit"
                      className="px-4 py-2 text-xs uppercase tracking-widest bg-[#DA9E3E] text-white disabled:opacity-50">
                Send to Designer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, items, renderActions, dimmed = false, absUrl }) {
  return (
    <section>
      <h4 className="text-xs uppercase tracking-widest font-bold text-[#0C1D42] mb-3">{title} ({items.length})</h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {items.map(img => (
          <div key={img.image_id}
               className={`bg-white border border-[#E8E4D9] overflow-hidden ${dimmed ? "opacity-70" : ""}`}>
            <div className="aspect-video bg-[#F3F0E9] overflow-hidden">
              <a href={absUrl(img.url)} target="_blank" rel="noopener noreferrer">
                <img src={absUrl(img.url)} alt={img.designer_comment} className="w-full h-full object-cover hover:scale-105 transition" />
              </a>
            </div>
            <div className="p-4">
              <p className="text-xs uppercase tracking-widest text-[#333333]">Round {img.round} • Designer note</p>
              <p className="text-sm text-[#0C1D42] mt-1 whitespace-pre-wrap">{img.designer_comment}</p>
              {renderActions(img)}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
