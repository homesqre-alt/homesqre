import { useEffect, useMemo, useState, useCallback } from "react";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import DocumentVault from "@/components/DocumentVault";

/**
 * MasterLeadPipeline — shared CRM grid used by Admin and Sales dashboards.
 * - `mode="admin"` → can add/edit basic fields + delete + reassign + export CSV
 * - `mode="sales"` → can add new + change status / comment / follow-up only
 */
export default function MasterLeadPipeline({ mode = "admin", currentUser }) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    q: "", status: "", source: "", followup: "", assigned_to: "",
  });
  const [statuses, setStatuses] = useState([]);
  const [sources, setSources] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [employees, setEmployees] = useState([]);

  const [selected, setSelected] = useState(null);          // open detail drawer
  const [isAddOpen, setIsAddOpen] = useState(false);

  // --- Initial settings/options ---
  useEffect(() => {
    (async () => {
      try {
        const [s, src, b] = await Promise.all([
          api.get("/crm/statuses"),
          api.get("/crm/sources"),
          api.get("/crm/budget-options"),
        ]);
        setStatuses(s.data); setSources(src.data); setBudgets(b.data);
      } catch (e) { /* ignore — page still works */ }
      if (mode === "admin") {
        try { const { data } = await api.get("/admin/employees"); setEmployees(data); }
        catch (e) { /* not fatal */ }
      }
    })();
  }, [mode]);

  // --- Fetch leads with current filters ---
  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => v && params.append(k, v));
      const { data } = await api.get(`/leads?${params.toString()}`);
      const sortedItems = [...data.items].sort((a, b) => {
        if (a.status === "Partial Payment Pending" && b.status !== "Partial Payment Pending") return -1;
        if (b.status === "Partial Payment Pending" && a.status !== "Partial Payment Pending") return 1;
        return 0;
      });
      setItems(sortedItems); setTotal(data.total);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  // --- CSV export ---
  const handleExportCSV = async () => {
    try {
      const res = await api.get("/leads/export.csv", { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([res.data], { type: "text/csv" }));
      const a = document.createElement("a");
      a.href = url; a.download = `leads_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click(); URL.revokeObjectURL(url);
      toast.success("CSV downloaded");
    } catch (err) { toast.error(formatApiError(err)); }
  };

  // --- Sub-row counts for filter chips ---
  const stats = useMemo(() => {
    const byStatus = {};
    items.forEach(i => { byStatus[i.status] = (byStatus[i.status] || 0) + 1; });
    return byStatus;
  }, [items]);

  return (
    <div className="space-y-6" data-testid="master-lead-pipeline">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl text-[#0C1D42]">
            {mode === "admin" ? "Master Lead Pipeline" : "My Leads"}
          </h2>
          <p className="text-xs text-[#333333]">
            Showing {items.length} of {total} {mode === "sales" ? "leads assigned to you" : "leads"}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            data-testid="followups-today-btn"
            onClick={() => setFilters(f => ({ ...f, followup: f.followup === "today" ? "" : "today" }))}
            className={`px-4 py-2 text-xs uppercase tracking-widest font-bold border transition ${
              filters.followup === "today"
                ? "bg-[#DA9E3E] text-white border-[#DA9E3E]"
                : "border-[#DA9E3E] text-[#DA9E3E] hover:bg-[#FCFAF5]"
            }`}
          >Follow-ups Today</button>
          <button
            data-testid="add-lead-btn"
            onClick={() => setIsAddOpen(true)}
            className="bg-[#0C1D42] text-white px-4 py-2 text-xs uppercase tracking-widest font-bold hover:bg-[#08142D]"
          >+ Add Lead</button>
          {mode === "admin" && (
            <button
              data-testid="export-csv-btn"
              onClick={handleExportCSV}
              className="border border-[#0C1D42] text-[#0C1D42] px-4 py-2 text-xs uppercase tracking-widest font-bold hover:bg-[#F3F0E9]"
            >Export CSV</button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 bg-[#F3F0E9] p-4 border border-[#E8E4D9]">
        <input
          data-testid="filter-search"
          value={filters.q}
          onChange={e => setFilters({ ...filters, q: e.target.value })}
          placeholder="Search name / phone / email"
          className="col-span-2 p-2 text-sm border border-[#E8E4D9] focus:outline-none focus:border-[#0C1D42] bg-white"
        />
        <select
          data-testid="filter-status"
          value={filters.status}
          onChange={e => setFilters({ ...filters, status: e.target.value })}
          className="p-2 text-sm border border-[#E8E4D9] bg-white"
        >
          <option value="">All statuses</option>
          {statuses.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
        </select>
        <select
          data-testid="filter-source"
          value={filters.source}
          onChange={e => setFilters({ ...filters, source: e.target.value })}
          className="p-2 text-sm border border-[#E8E4D9] bg-white"
        >
          <option value="">All sources</option>
          {sources.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
        </select>
        <select
          data-testid="filter-followup"
          value={filters.followup}
          onChange={e => setFilters({ ...filters, followup: e.target.value })}
          className="p-2 text-sm border border-[#E8E4D9] bg-white"
        >
          <option value="">All follow-ups</option>
          <option value="overdue">Overdue</option>
          <option value="today">Due today</option>
          <option value="upcoming">Upcoming</option>
        </select>
        <select
          data-testid="filter-assigned-to"
          value={filters.assigned_to}
          onChange={e => setFilters({ ...filters, assigned_to: e.target.value })}
          className="p-2 text-sm border border-[#E8E4D9] bg-white"
        >
          <option value="">All Assignees</option>
          <option value="unassigned">Unassigned</option>
          {employees.map(e => <option key={e.email} value={e.email}>{e.email} ({e.role})</option>)}
        </select>
      </div>

      {/* Quick stats */}
      {Object.keys(stats).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(stats).map(([k, v]) => (
            <button
              key={k}
              onClick={() => setFilters(f => ({ ...f, status: f.status === k ? "" : k }))}
              className={`px-3 py-1 text-xs border ${filters.status === k ? "bg-[#0C1D42] text-white border-[#0C1D42]" : "border-[#E8E4D9] text-[#0C1D42] hover:bg-[#F3F0E9]"}`}
            >
              {k}: {v}
            </button>
          ))}
        </div>
      )}

      {/* Lead table */}
      <div className="border border-[#E8E4D9] overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#0C1D42] text-white text-xs uppercase tracking-widest">
            <tr>
              <th className="p-3 text-left">Name</th>
              <th className="p-3 text-left">Phone</th>
              <th className="p-3 text-left">Source</th>
              <th className="p-3 text-left">Status</th>
              <th className="p-3 text-left">Assigned</th>
              <th className="p-3 text-left">Follow-up</th>
              <th className="p-3 text-left">Created</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan="7" className="p-6 text-center text-[#333333]">Loading…</td></tr>}
            {!loading && items.length === 0 && (
              <tr><td colSpan="7" className="p-6 text-center text-[#333333]">No leads found.</td></tr>
            )}
            {items.map(l => (
              <tr
                key={l.lead_id}
                onClick={() => setSelected(l)}
                data-testid={`lead-row-${l.lead_id}`}
                className="border-t border-[#E8E4D9] hover:bg-[#F3F0E9] cursor-pointer"
              >
                <td className="p-3 font-semibold text-[#0C1D42]">
                  {l.name}
                  {l.is_verified && <span className="ml-2 text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded uppercase tracking-wider font-bold">Verified</span>}
                </td>
                <td className="p-3">{l.phone}</td>
                <td className="p-3 text-xs">{l.source}</td>
                <td className="p-3 text-xs">
                  <span className={`px-2 py-0.5 border ${l.status === 'Partial Payment Pending' ? 'bg-red-600 text-white border-red-700 font-bold shadow-sm' : 'bg-[#F3F0E9] border-[#E8E4D9]'}`}>
                    {l.status}
                  </span>
                </td>
                <td className="p-3 text-xs">{l.assigned_to || "—"}</td>
                <td className="p-3 text-xs">{l.next_followup_at ? new Date(l.next_followup_at).toLocaleString() : "—"}</td>
                <td className="p-3 text-xs">{new Date(l.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add modal */}
      {isAddOpen && (
        <LeadAddModal
          mode={mode}
          statuses={statuses}
          sources={sources}
          budgets={budgets}
          employees={employees}
          onClose={() => setIsAddOpen(false)}
          onCreated={() => { setIsAddOpen(false); fetchLeads(); }}
        />
      )}

      {/* Detail drawer */}
      {selected && (
        <LeadDetailDrawer
          mode={mode}
          lead={selected}
          statuses={statuses}
          sources={sources}
          budgets={budgets}
          employees={employees}
          currentUser={currentUser}
          onClose={() => setSelected(null)}
          onChanged={(updated) => { fetchLeads(); setSelected(updated || null); }}
        />
      )}
    </div>
  );
}

// ---------- Add Lead modal ----------
function LeadAddModal({ mode, statuses, sources, budgets, employees, onClose, onCreated }) {
  const [form, setForm] = useState({
    name: "", phone: "", email: "", budget_range: "", message: "",
    source: sources[0]?.name || "Website",
    status: statuses[0]?.name || "New",
    assigned_to: "",
  });
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.phone) return toast.error("Name and phone are required");
    setBusy(true);
    try {
      await api.post("/leads", form);
      toast.success("Lead created");
      onCreated();
    } catch (err) { toast.error(formatApiError(err)); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={submit}
            data-testid="add-lead-modal"
            className="bg-white max-w-xl w-full p-6 max-h-[90vh] overflow-y-auto">
        <h3 className="font-display text-xl text-[#0C1D42] mb-4">Add Lead</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <Field label="Name *"><input data-testid="add-lead-name" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inputCls} /></Field>
          <Field label="Phone *"><input data-testid="add-lead-phone" required pattern="^[0-9]{10}$" title="Phone number must be exactly 10 digits" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className={inputCls} /></Field>
          <Field label="Email"><input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className={inputCls} /></Field>
          <Field label="Budget"><select value={form.budget_range} onChange={e => setForm({ ...form, budget_range: e.target.value })} className={inputCls}>
            <option value="">—</option>{budgets.map(b => <option key={b} value={b}>{b}</option>)}
          </select></Field>
          <Field label="Source"><select value={form.source} onChange={e => setForm({ ...form, source: e.target.value })} className={inputCls}>
            {sources.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
          </select></Field>
          <Field label="Status"><select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className={inputCls}>
            {statuses.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
          </select></Field>
          {mode === "admin" && (
            <Field label="Assign to (override)"><select value={form.assigned_to} onChange={e => setForm({ ...form, assigned_to: e.target.value })} className={inputCls}>
              <option value="">Auto (by status rule)</option>
              {employees.map(e => <option key={e.email} value={e.email}>{e.email} ({e.role})</option>)}
            </select></Field>
          )}
          <Field label="Message" full><textarea value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} rows="3" className={inputCls} /></Field>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button type="button" onClick={onClose} className="px-4 py-2 text-xs uppercase tracking-widest border border-[#E8E4D9]">Cancel</button>
          <button type="submit" disabled={busy} data-testid="add-lead-submit" className="px-4 py-2 text-xs uppercase tracking-widest bg-[#0C1D42] text-white disabled:opacity-50">
            {busy ? "Creating…" : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ---------- Detail drawer ----------
function LeadDetailDrawer({ mode, lead, statuses, sources, budgets, employees, currentUser, onClose, onChanged }) {
  const [data, setData] = useState(lead);
  const [comment, setComment] = useState("");      // buffered new comment
  const [busy, setBusy] = useState(false);
  const [edits, setEdits] = useState({});          // buffered field edits (status / followup / core)
  const isAdmin = mode === "admin";
  const isAssignee = (data.assigned_to || "") === (currentUser?.email || "").toLowerCase();
  const canEditCore = isAdmin;
  const canEditWorkflow = isAdmin || isAssignee;

  // refresh full lead (with comments) on open
  useEffect(() => {
    (async () => {
      try { const { data } = await api.get(`/leads/${lead.lead_id}`); setData(data); }
      catch (err) { toast.error(formatApiError(err)); }
    })();
  }, [lead.lead_id]);

  const dirtyCount = Object.keys(edits).length + (comment.trim() ? 1 : 0);

  const allowedStatuses = useMemo(() => {
    if (currentUser?.role === "admin") return statuses;
    if (currentUser?.role === "designer") {
      return statuses.filter(s => 
        ["Floor Plan Uploaded", "Floor Plan Approved", "Floor Plan Rejected", "Designing", "Awaiting Customer Approval", "Design Approved"].includes(s.name) || s.name === data.status
      );
    }
    // sales
    return statuses.filter(s => 
      ["New", "Followup", "Not Interested", "Payment Received", "Partial Payment Pending"].includes(s.name) || s.name === data.status
    );
  }, [statuses, currentUser, data.status]);

  // Single batched submit — fires the right endpoint for each changed field.
  // Nothing hits the API until the user clicks "Submit Changes".
  const submitChanges = async () => {
    if (!canEditWorkflow) return;
    if (dirtyCount === 0) return;
    setBusy(true);
    let reassignedTo = null;
    try {
      // 1) Workflow: status
      if (typeof edits.status === "string" && edits.status !== data.status) {
        if (isAdmin && !comment.trim()) {
          toast.error("A comment is required when manually overriding status.");
          setBusy(false);
          return;
        }
        const { data: r } = await api.put(`/leads/${data.lead_id}/status`, { status: edits.status });
        reassignedTo = r?.assigned_to ?? null;
      }
      // 2) Workflow: next follow-up
      if ("next_followup_at" in edits) {
        await api.put(`/leads/${data.lead_id}/followup`, {
          next_followup_at: edits.next_followup_at || null,
        });
      }
      // 3) Admin-only core fields (name/phone/email/budget/message/source/assigned_to)
      const coreKeys = ["name", "phone", "email", "budget_range", "message", "source", "assigned_to"];
      const corePayload = {};
      coreKeys.forEach(k => { if (k in edits) corePayload[k] = edits[k]; });
      if (isAdmin && Object.keys(corePayload).length > 0) {
        await api.put(`/leads/${data.lead_id}`, corePayload);
      }
      // 4) New comment (any role with workflow access)
      if (comment.trim()) {
        await api.post(`/leads/${data.lead_id}/comments`, { text: comment.trim() });
      }
      // Refresh and clear buffers
      const { data: fresh } = await api.get(`/leads/${data.lead_id}`);
      setData(fresh);
      setEdits({});
      setComment("");
      onChanged(fresh);
      toast.success(
        reassignedTo && reassignedTo !== data.assigned_to
          ? `Changes saved · reassigned to ${reassignedTo}`
          : "Changes saved"
      );
      // For sales mode, auto-close the drawer after a successful save — less confusion
      if (mode === "sales") onClose();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setBusy(false);
    }
  };

  const discardChanges = () => {
    setEdits({});
    setComment("");
  };

  const deleteLead = async () => {
    if (!isAdmin) return;
    if (!confirm(`Delete lead for ${data.name}? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await api.delete(`/leads/${data.lead_id}`);
      toast.success("Lead deleted");
      onChanged(null);
      onClose();
    } catch (err) { toast.error(formatApiError(err)); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex justify-end" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} data-testid="lead-detail-drawer"
           className="bg-white w-full max-w-xl h-full overflow-y-auto p-6 space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-display text-2xl text-[#0C1D42]">{data.name}</h3>
            <p className="text-sm text-[#333333]">{data.phone}{data.email ? ` • ${data.email}` : ""}</p>
          </div>
          <button onClick={onClose} className="text-2xl leading-none text-[#0C1D42] opacity-50 hover:opacity-100">×</button>
        </div>

        {/* Workflow */}
        <section className="space-y-3">
          <h4 className="text-xs uppercase tracking-widest font-bold text-[#0C1D42]">Workflow</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Status">
              <select
                data-testid="detail-status-select"
                disabled={!canEditWorkflow || busy}
                value={edits.status ?? data.status}
                onChange={e => setEdits({ ...edits, status: e.target.value })}
                className={inputCls}>
                {allowedStatuses.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Next Follow-up">
              <input
                type="datetime-local"
                data-testid="detail-followup-input"
                disabled={!canEditWorkflow || busy}
                value={(edits.next_followup_at ?? data.next_followup_at ?? "").slice(0, 16)}
                onChange={e => setEdits({ ...edits, next_followup_at: e.target.value })}
                className={inputCls} />
            </Field>
            <Field label="Assigned to">
              {isAdmin ? (
                <select
                  disabled={busy}
                  value={edits.assigned_to ?? data.assigned_to ?? ""}
                  onChange={e => setEdits({ ...edits, assigned_to: e.target.value })}
                  className={inputCls}>
                  <option value="">—</option>
                  {employees.map(e => <option key={e.email} value={e.email}>{e.email} ({e.role})</option>)}
                </select>
              ) : (
                <input readOnly value={data.assigned_to || "—"} className={`${inputCls} bg-gray-100`} />
              )}
            </Field>
            <Field label="Source">
              {isAdmin ? (
                <select disabled={busy} value={edits.source ?? data.source} onChange={e => setEdits({ ...edits, source: e.target.value })} className={inputCls}>
                  {sources.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                </select>
              ) : (<input readOnly value={data.source} className={`${inputCls} bg-gray-100`} />)}
            </Field>
          </div>
        </section>

        {/* Core fields (admin editable, buffered) */}
        {isAdmin && (
          <section className="space-y-3">
            <h4 className="text-xs uppercase tracking-widest font-bold text-[#0C1D42]">Basic Info (admin)</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Name"><input value={edits.name ?? data.name} onChange={e => setEdits({ ...edits, name: e.target.value })} className={inputCls} /></Field>
              <Field label="Phone"><input value={edits.phone ?? data.phone} onChange={e => setEdits({ ...edits, phone: e.target.value })} className={inputCls} /></Field>
              <Field label="Email"><input value={edits.email ?? data.email ?? ""} onChange={e => setEdits({ ...edits, email: e.target.value })} className={inputCls} /></Field>
              <Field label="Budget"><select value={edits.budget_range ?? data.budget_range ?? ""} onChange={e => setEdits({ ...edits, budget_range: e.target.value })} className={inputCls}>
                <option value="">—</option>{budgets.map(b => <option key={b}>{b}</option>)}
              </select></Field>
              <Field label="Message" full><textarea rows="2" value={edits.message ?? data.message ?? ""} onChange={e => setEdits({ ...edits, message: e.target.value })} className={inputCls} /></Field>
            </div>
            <div className="flex gap-2">
              <button onClick={deleteLead} disabled={busy} data-testid="delete-lead-btn"
                      className="px-4 py-2 text-xs uppercase tracking-widest border border-red-700 text-red-700 hover:bg-red-50">Delete Lead</button>
            </div>
          </section>
        )}

        {/* Read-only info for sales */}
        {!isAdmin && (
          <section>
            <h4 className="text-xs uppercase tracking-widest font-bold text-[#0C1D42] mb-2">Lead Info</h4>
            <p className="text-sm">Budget: <strong>{data.budget_range || "—"}</strong></p>
            {data.message && <p className="text-sm mt-1 whitespace-pre-wrap"><em>{data.message}</em></p>}
          </section>
        )}

        {/* Document Vault */}
        <section className="space-y-4">
          <h4 className="text-xs uppercase tracking-widest font-bold text-[#0C1D42]">Document Vault</h4>
          <DocumentVault leadId={data.lead_id} />
        </section>

        {/* Lead Journey Timeline */}
        <section className="space-y-4">
          <h4 className="text-xs uppercase tracking-widest font-bold text-[#0C1D42]">Lead Journey</h4>
          <div className="relative border-l-2 border-[#DA9E3E] ml-3 pl-5 space-y-5 pb-2">
            
            {(data.history || []).map((h, i) => (
              <div key={`h-${i}`} className="relative">
                <div className="absolute -left-[27px] top-1 w-3 h-3 bg-[#DA9E3E] rounded-full border-2 border-[#F3F0E9]"></div>
                <div className="text-[10px] text-gray-500 font-medium tracking-wide">
                  {new Date(h.at).toLocaleString()}
                </div>
                <div className="text-xs text-[#0C1D42] mt-0.5">
                  <span className="font-semibold">{h.by === "system" ? "System" : h.by}</span> moved lead to <span className="font-bold bg-[#F3F0E9] px-1">{h.to_status}</span>
                </div>
              </div>
            ))}

            {(data.comments || []).map(c => (
              <div key={c.id} className="relative bg-gray-50 border border-gray-200 p-3 rounded shadow-sm mt-3">
                <div className="absolute -left-[32px] top-4 w-2 h-2 bg-gray-400 rounded-full"></div>
                <div className="flex justify-between items-baseline mb-1">
                  <div className="text-xs font-semibold text-[#0C1D42]">{c.by_name || c.by}</div>
                  <div className="text-[10px] text-gray-400">{new Date(c.at).toLocaleString()}</div>
                </div>
                <div className="text-xs text-gray-700 whitespace-pre-wrap">{c.text}</div>
              </div>
            ))}
            
            {((data.history || []).length === 0 && (data.comments || []).length === 0) && (
              <div className="text-xs text-gray-400 italic">No activity yet.</div>
            )}
          </div>
          {canEditWorkflow && (
            <div>
              <label className="block text-[10px] uppercase tracking-widest font-bold text-[#0C1D42] mb-1">New comment (queued)</label>
              <textarea
                data-testid="add-comment-input"
                value={comment}
                onChange={e => setComment(e.target.value)}
                rows={2}
                placeholder="Add a comment… it will be posted when you click Submit Changes."
                className={inputCls} />
            </div>
          )}
        </section>

        {/* Sticky batch-submit footer */}
        {canEditWorkflow && (
          <section
            data-testid="lead-submit-bar"
            className="sticky bottom-0 -mx-6 -mb-6 px-6 py-4 bg-white border-t border-[#E8E4D9] flex flex-col sm:flex-row sm:items-center gap-3"
          >
            <p className="text-xs text-[#333333] flex-1">
              {dirtyCount === 0
                ? "No pending changes."
                : <><strong>{dirtyCount}</strong> pending change{dirtyCount === 1 ? "" : "s"} — nothing is saved yet.</>}
            </p>
            <div className="flex gap-2">
              <button
                onClick={discardChanges}
                disabled={busy || dirtyCount === 0}
                data-testid="lead-discard-btn"
                className="px-4 py-2 text-xs uppercase tracking-widest border border-[#E8E4D9] text-[#333333] disabled:opacity-40"
              >Discard</button>
              <button
                onClick={submitChanges}
                disabled={busy || dirtyCount === 0}
                data-testid="lead-submit-btn"
                className="px-5 py-2 text-xs uppercase tracking-widest bg-[#0C1D42] text-white hover:bg-[#08142D] disabled:opacity-40"
              >{busy ? "Submitting…" : "Submit Changes"}</button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

// ---------- shared helpers ----------
const inputCls = "p-2 text-sm border border-[#E8E4D9] focus:outline-none focus:border-[#0C1D42] bg-white w-full";
function Field({ label, full, children }) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <label className="block text-[10px] uppercase tracking-widest font-bold text-[#0C1D42] mb-1">{label}</label>
      {children}
    </div>
  );
}
