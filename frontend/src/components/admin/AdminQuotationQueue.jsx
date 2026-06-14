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
  const [uploadingQuotationFor, setUploadingQuotationFor] = useState(null);
  const [activeTab, setActiveTab] = useState("awaiting");

  const backend = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/$/, "");
  const absUrl = (url) => (url && url.startsWith("http") ? url : `${backend}${url}`);

  const load = useCallback(async () => {
    try {
      const [p, s, q] = await Promise.all([
        api.get("/admin/design/projects"),
        api.get("/crm/statuses"),
        api.get("/admin/quotations"),
      ]);
      
      const qMap = {};
      (q.data || []).forEach(quot => qMap[quot.project_id] = quot);
      
      const filtered = (p.data || [])
        .filter(pr => ['ready_for_quotation', 'in_production'].includes(pr.status))
        .map(pr => ({ ...pr, quotation: qMap[pr.project_id] }));
        
      setProjects(filtered);
      setStatuses(s.data);
    } catch (err) { toast.error(formatApiError(err)); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const changeStatus = async (project_id, value) => {
    if (value === "Quotation sent") {
      setUploadingQuotationFor(project_id);
      return;
    }
    setBusyId(project_id);
    try {
      await api.put(`/admin/design/projects/${project_id}/quotation-status`, { quotation_status: value });
      toast.success("Quotation status updated");
      load();
    } catch (err) { toast.error(formatApiError(err)); }
    finally { setBusyId(null); }
  };

  const triggerMilestone = async (quotation_id, milestone_id) => {
    if (!confirm("Are you sure you want to trigger this payment milestone? The customer will now be able to pay it.")) return;
    try {
      await api.put(`/admin/quotations/${quotation_id}/milestones/${milestone_id}/trigger`);
      toast.success("Milestone unlocked successfully");
      load();
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  const displayedProjects = projects.filter(p => activeTab === 'awaiting' ? p.status === 'ready_for_quotation' : p.status === 'in_production');

  return (
    <div className="space-y-6" data-testid="admin-quotation-queue">
      <header>
        <h2 className="font-display text-2xl text-[#0C1D42]">Execution Quotations</h2>
        <p className="text-xs text-[#333333]">Upload quotations for approved designs, and track/trigger production payment milestones.</p>
      </header>
      
      <div className="flex gap-4 border-b border-[#EDE5DB]">
        <button onClick={() => setActiveTab('awaiting')} className={`pb-2 text-sm font-bold uppercase tracking-widest ${activeTab === 'awaiting' ? 'text-[#0C1D42] border-b-2 border-[#0C1D42]' : 'text-gray-400'}`}>Awaiting Quotation</button>
        <button onClick={() => setActiveTab('production')} className={`pb-2 text-sm font-bold uppercase tracking-widest ${activeTab === 'production' ? 'text-[#0C1D42] border-b-2 border-[#0C1D42]' : 'text-gray-400'}`}>In Production</button>
      </div>

      {displayedProjects.length === 0 && <p className="bg-white border border-[#EDE5DB] p-6 text-center text-[#333333]">No projects in this stage.</p>}
      <div className="space-y-4">
        {displayedProjects.map(p => (
          <article key={p.project_id} className="border border-[#EDE5DB] bg-white p-4" data-testid={`quotation-card-${p.project_id}`}>
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div>
                <h3 className="font-display text-lg text-[#0C1D42]">{p.customer?.name || p.user_id}</h3>
                <p className="text-xs text-[#333333]">{p.customer?.email} • {p.customer?.mobile}</p>
                <p className="text-xs text-[#333333] mt-1">{(p.images || []).length} approved render(s) • Approved on {new Date(p.approved_at || p.updated_at).toLocaleDateString()}</p>
              </div>
              <div className="flex items-center gap-4">
                {p.quotation && (
                  <a href={p.quotation.pdf_url} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-[#DA9E3E] hover:underline uppercase tracking-widest">
                    View PDF
                  </a>
                )}
                <div>
                  <label className="block text-[10px] uppercase tracking-widest font-bold text-[#0C1D42] mb-1">Quotation Status</label>
                  <select
                    data-testid={`quotation-status-${p.project_id}`}
                    disabled={busyId === p.project_id}
                    value={p.quotation_status || ""}
                    onChange={(e) => changeStatus(p.project_id, e.target.value)}
                    className="p-2 text-sm border border-[#EDE5DB] bg-white min-w-[220px]"
                  >
                    <option value="" disabled>— select —</option>
                    {statuses.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Display milestones if quotation exists */}
            {p.quotation && p.quotation.milestones && (
              <div className="mt-4 border-t border-[#EDE5DB] pt-4">
                <h4 className="text-[10px] uppercase tracking-widest font-bold text-[#0C1D42] mb-2">Payment Milestones</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {p.quotation.milestones.map((ms) => (
                    <div key={ms.id} className={`p-3 border text-xs ${ms.status === 'paid' ? 'bg-[#F5EDE8] border-[#0C1D42]' : ms.status === 'unlocked' ? 'bg-white border-[#DA9E3E]' : 'bg-gray-50 border-gray-200 opacity-60'}`}>
                      <p className="font-bold mb-1 truncate" title={ms.name}>{ms.name}</p>
                      <p>₹{ms.amount.toLocaleString('en-IN')}</p>
                      <div className="flex justify-between items-end mt-2">
                        <span className={`px-2 py-1 uppercase tracking-widest font-bold text-[9px] ${ms.status === 'paid' ? 'bg-[#0C1D42] text-white' : ms.status === 'unlocked' ? 'bg-[#DA9E3E] text-white' : 'bg-gray-200 text-gray-500'}`}>
                          {ms.status}
                        </span>
                        {ms.status === 'locked' && (
                          <button onClick={() => triggerMilestone(p.quotation.quotation_id, ms.id)} className="text-[#DA9E3E] hover:underline font-bold">Trigger Now</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
              {(p.images || []).slice(0, 8).map(img => (
                <a key={img.image_id} href={absUrl(img.url)} target="_blank" rel="noopener noreferrer">
                  <img src={absUrl(img.url)} alt={img.designer_comment}
                       className="w-full aspect-video object-cover border border-[#EDE5DB]" />
                </a>
              ))}
            </div>
          </article>
        ))}
      </div>
      
      {uploadingQuotationFor && (
        <QuotationUploadModal
          projectId={uploadingQuotationFor}
          onClose={() => setUploadingQuotationFor(null)}
          onSuccess={() => { setUploadingQuotationFor(null); load(); }}
        />
      )}
    </div>
  );
}

function QuotationUploadModal({ projectId, onClose, onSuccess }) {
  const [file, setFile] = useState(null);
  const [totalAmount, setTotalAmount] = useState("");
  const [milestones, setMilestones] = useState([
    { name: "50% Booking Advance", amount: "", tentative_date: "" },
    { name: "40% Before Delivery", amount: "", tentative_date: "" },
    { name: "10% On Completion", amount: "", tentative_date: "" }
  ]);
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!file) return toast.error("PDF Quotation file is required");
    if (!totalAmount) return toast.error("Total amount is required");
    
    setLoading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const uploadRes = await api.post("/upload", form);
      const pdf_url = uploadRes.data.url;

      const payload = {
        total_amount: Number(totalAmount),
        pdf_url,
        milestones: milestones.filter(m => m.name && m.amount).map(m => ({
          name: m.name,
          amount: Number(m.amount),
          tentative_date: m.tentative_date
        }))
      };
      
      await api.post(`/admin/quotations/${projectId}`, payload);
      await api.put(`/admin/design/projects/${projectId}/quotation-status`, { quotation_status: "Quotation sent" });

      toast.success("Quotation sent successfully!");
      onSuccess();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto animate-in zoom-in-95">
        <div className="flex justify-between items-center mb-6">
          <h3 className="font-display text-2xl text-[#0C1D42]">Upload Execution Quotation</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-black text-2xl">&times;</button>
        </div>
        
        <form onSubmit={submit} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs uppercase tracking-widest font-bold text-[#0C1D42] mb-2">Total Project Value (₹) *</label>
              <input type="number" required value={totalAmount} onChange={e => setTotalAmount(e.target.value)} placeholder="e.g. 1500000" className="w-full p-2 border border-[#EDE5DB] focus:outline-none focus:border-[#0C1D42] text-sm" />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-widest font-bold text-[#0C1D42] mb-2">Quotation PDF File *</label>
              <input type="file" required accept=".pdf" onChange={e => setFile(e.target.files[0])} className="w-full p-2 border border-[#EDE5DB] text-sm file:mr-4 file:py-1 file:px-3 file:border-0 file:text-xs file:bg-[#F5EDE8] file:text-[#0C1D42]" />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-xs uppercase tracking-widest font-bold text-[#0C1D42]">Payment Schedule Milestones</label>
              <button type="button" onClick={() => setMilestones([...milestones, { name: "", amount: "", tentative_date: "" }])} className="text-xs font-bold text-[#DA9E3E] hover:underline">+ Add Milestone</button>
            </div>
            <p className="text-[10px] text-[#333333] mb-3">Note: The system will automatically deduct any amounts the customer has already paid from the VERY FIRST milestone listed here.</p>
            
            <div className="space-y-3">
              {milestones.map((m, i) => (
                <div key={i} className="flex gap-2 items-start border border-[#EDE5DB] p-3 bg-[#F5EDE8]/30">
                  <div className="flex-1">
                    <input type="text" placeholder="Milestone Name (e.g. 50% Booking)" value={m.name} onChange={e => { const ms = [...milestones]; ms[i].name = e.target.value; setMilestones(ms); }} className="w-full p-2 text-sm border border-[#EDE5DB] focus:outline-none focus:border-[#0C1D42] mb-2" required />
                    <div className="flex gap-2">
                      <input type="number" placeholder="Amount (₹)" value={m.amount} onChange={e => { const ms = [...milestones]; ms[i].amount = e.target.value; setMilestones(ms); }} className="w-1/2 p-2 text-sm border border-[#EDE5DB] focus:outline-none focus:border-[#0C1D42]" required />
                      <input type="date" value={m.tentative_date} onChange={e => { const ms = [...milestones]; ms[i].tentative_date = e.target.value; setMilestones(ms); }} className="w-1/2 p-2 text-sm border border-[#EDE5DB] focus:outline-none focus:border-[#0C1D42]" required />
                    </div>
                  </div>
                  {milestones.length > 1 && (
                    <button type="button" onClick={() => { const ms = [...milestones]; ms.splice(i, 1); setMilestones(ms); }} className="text-red-500 font-bold p-2 hover:bg-red-50">&times;</button>
                  )}
                </div>
              ))}
            </div>
          </div>
          
          <button type="submit" disabled={loading} className="w-full bg-[#0C1D42] text-white py-3 uppercase tracking-widest text-sm font-bold hover:bg-[#08142D] disabled:opacity-50">
            {loading ? "Uploading & Saving..." : "Confirm & Send Quotation"}
          </button>
        </form>
      </div>
    </div>
  );
}
