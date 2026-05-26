import { useEffect, useMemo, useState, useCallback } from "react";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";

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
      setItems(data.items); setTotal(data.total);
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
          <h2 className="font-display text-2xl text-[#06402B]">
            {mode === "admin" ? "Master Lead Pipeline" : "My Leads"}
          </h2>
          <p className="text-xs text-[#4A5D54]">
            Showing {items.length} of {total} {mode === "sales" ? "leads assigned to you" : "leads"}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            data-testid="followups-today-btn"
            onClick={() => setFilters(f => ({ ...f, followup: f.followup === "today" ? "" : "today" }))}
            className={`px-4 py-2 text-xs uppercase tracking-widest font-bold border transition ${
              filters.followup === "today"
                ? "bg-[#B68D40] text-white border-[#B68D40]"
                : "border-[#B68D40] text-[#B68D40] hover:bg-[#FFF8EC]"
            }`}
          >Follow-ups Today</button>
          <button
            data-testid="add-lead-btn"
            onClick={() => setIsAddOpen(true)}
            className="bg-[#06402B] text-white px-4 py-2 text-xs uppercase tracking-widest font-bold hover:bg-[#0a5839]"
          >+ Add Lead</button>
          {mode === "admin" && (
            <button
              data-testid="export-csv-btn"
              onClick={handleExportCSV}
              className="border border-[#06402B] text-[#06402B] px-4 py-2 text-xs uppercase tracking-widest font-bold hover:bg-[#F3F0E9]"
            >Export CSV</button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 bg-[#F3F0E9] p-4 border border-[#E8E4D9]">
        <input
          data-testid="filter-search"
          value={filters.q}
          onChange={e => setFilters({ ...filters, q: e.target.value })}
          placeholder="Search name / phone / email"
          className="col-span-2 p-2 text-sm border border-[#E8E4D9] focus:outline-none focus:border-[#06402B] bg-white"
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
      </div>

      {/* Quick stats */}
      {Object.keys(stats).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(stats).map(([k, v]) => (
            <button
              key={k}
              onClick={() => setFilters(f => ({ ...f, status: f.status === k ? "" : k }))}
              className={`px-3 py-1 text-xs border ${filters.status === k ? "bg-[#06402B] text-white border-[#06402B]" : "border-[#E8E4D9] text-[#06402B] hover:bg-[#F3F0E9]"}`}
            >
              {k}: {v}
            </button>
          ))}
        </div>
      )}

      {/* Lead table */}
      <div className="border border-[#E8E4D9] overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#06402B] text-white text-xs uppercase tracking-widest">
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
            {loading && <tr><td colSpan="7" className="p-6 text-center text-[#4A5D54]">Loading…</td></tr>}
            {!loading && items.length === 0 && (
              <tr><td colSpan="7" className="p-6 text-center text-[#4A5D54]">No leads found.</td></tr>
            )}
            {items.map(l => (
              <tr
                key={l.lead_id}
                onClick={() => setSelected(l)}
                data-testid={`lead-row-${l.lead_id}`}
                className="border-t border-[#E8E4D9] hover:bg-[#F3F0E9] cursor-pointer"
              >
                <td className="p-3 font-semibold text-[#06402B]">{l.name}</td>
                <td className="p-3">{l.phone}</td>
                <td className="p-3 text-xs">{l.source}</td>
                <td className="p-3 text-xs"><span className="bg-[#F3F0E9] border border-[#E8E4D9] px-2 py-0.5">{l.status}</span></td>
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
        <h3 className="font-display text-xl text-[#06402B] mb-4">Add Lead</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <Field label="Name *"><input data-testid="add-lead-name" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inputCls} /></Field>
          <Field label="Phone *"><input data-testid="add-lead-phone" required value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className={inputCls} /></Field>
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
          <button type="submit" disabled={busy} data-testid="add-lead-submit" className="px-4 py-2 text-xs uppercase tracking-widest bg-[#06402B] text-white disabled:opacity-50">
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
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [edits, setEdits] = useState({});  // admin-only basic-field edits
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

  const changeStatus = async (newStatus) => {
    if (!canEditWorkflow) return;
    setBusy(true);
    try {
      const { data: r } = await api.put(`/leads/${data.lead_id}/status`, { status: newStatus });
      toast.success(r.assigned_to !== data.assigned_to
        ? `Status changed → reassigned to ${r.assigned_to}`
        : "Status updated");
      const { data: fresh } = await api.get(`/leads/${data.lead_id}`);
      setData(fresh); onChanged(fresh);
    } catch (err) { toast.error(formatApiError(err)); }
    finally { setBusy(false); }
  };

  const setFollowup = async (when) => {
    if (!canEditWorkflow) return;
    setBusy(true);
    try {
      await api.put(`/leads/${data.lead_id}/followup`, { next_followup_at: when || null });
      setData({ ...data, next_followup_at: when || null });
      onChanged({ ...data, next_followup_at: when || null });
      toast.success("Follow-up updated");
    } catch (err) { toast.error(formatApiError(err)); }
    finally { setBusy(false); }
  };

  const addComment = async () => {
    if (!comment.trim()) return;
    setBusy(true);
    try {
      const { data: c } = await api.post(`/leads/${data.lead_id}/comments`, { text: comment });
      setData({ ...data, comments: [...(data.comments || []), c] });
      setComment("");
      toast.success("Comment added");
    } catch (err) { toast.error(formatApiError(err)); }
    finally { setBusy(false); }
  };

  const saveCoreEdits = async () => {
    if (!isAdmin || Object.keys(edits).length === 0) return;
    setBusy(true);
    try {
      await api.put(`/leads/${data.lead_id}`, edits);
      const { data: fresh } = await api.get(`/leads/${data.lead_id}`);
      setData(fresh); setEdits({}); onChanged(fresh);
      toast.success("Lead updated");
    } catch (err) { toast.error(formatApiError(err)); }
    finally { setBusy(false); }
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
            <h3 className="font-display text-2xl text-[#06402B]">{data.name}</h3>
            <p className="text-sm text-[#4A5D54]">{data.phone}{data.email ? ` • ${data.email}` : ""}</p>
          </div>
          <button onClick={onClose} className="text-2xl leading-none text-[#06402B] opacity-50 hover:opacity-100">×</button>
        </div>

        {/* Workflow */}
        <section className="space-y-3">
          <h4 className="text-xs uppercase tracking-widest font-bold text-[#06402B]">Workflow</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Status">
              <select
                data-testid="detail-status-select"
                disabled={!canEditWorkflow || busy}
                value={data.status}
                onChange={e => changeStatus(e.target.value)}
                className={inputCls}>
                {statuses.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Next Follow-up">
              <input
                type="datetime-local"
                disabled={!canEditWorkflow || busy}
                value={data.next_followup_at ? data.next_followup_at.slice(0, 16) : ""}
                onChange={e => setFollowup(e.target.value)}
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

        {/* Core fields (admin editable) */}
        {isAdmin && (
          <section className="space-y-3">
            <h4 className="text-xs uppercase tracking-widest font-bold text-[#06402B]">Basic Info (admin)</h4>
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
              <button onClick={saveCoreEdits} disabled={Object.keys(edits).length === 0 || busy}
                      data-testid="save-core-btn"
                      className="px-4 py-2 text-xs uppercase tracking-widest bg-[#06402B] text-white disabled:opacity-40">Save changes</button>
              <button onClick={deleteLead} disabled={busy} data-testid="delete-lead-btn"
                      className="px-4 py-2 text-xs uppercase tracking-widest border border-red-700 text-red-700 hover:bg-red-50">Delete</button>
            </div>
          </section>
        )}

        {/* Read-only info for sales */}
        {!isAdmin && (
          <section>
            <h4 className="text-xs uppercase tracking-widest font-bold text-[#06402B] mb-2">Lead Info</h4>
            <p className="text-sm">Budget: <strong>{data.budget_range || "—"}</strong></p>
            {data.message && <p className="text-sm mt-1 whitespace-pre-wrap"><em>{data.message}</em></p>}
          </section>
        )}

        {/* Comments */}
        <section className="space-y-3">
          <h4 className="text-xs uppercase tracking-widest font-bold text-[#06402B]">Comments &amp; History</h4>
          <div className="space-y-2 max-h-72 overflow-y-auto border border-[#E8E4D9] p-3 bg-[#F3F0E9]">
            {(data.comments || []).length === 0 && <p className="text-xs text-[#4A5D54]">No comments yet.</p>}
            {(data.comments || []).map(c => (
              <div key={c.id} className="text-xs bg-white p-2 border border-[#E8E4D9]">
                <div className="font-semibold text-[#06402B]">{c.by_name || c.by}</div>
                <div className="text-gray-500">{new Date(c.at).toLocaleString()}</div>
                <div className="mt-1 whitespace-pre-wrap">{c.text}</div>
              </div>
            ))}
            {(data.history || []).map((h, i) => (
              <div key={`h-${i}`} className="text-xs italic text-[#4A5D54]">
                {new Date(h.at).toLocaleString()} — status: <strong>{h.from_status || "—"}</strong> → <strong>{h.to_status}</strong> (by {h.by})
              </div>
            ))}
          </div>
          {canEditWorkflow && (
            <div className="flex gap-2">
              <input
                data-testid="add-comment-input"
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder="Add a comment…"
                className={inputCls} />
              <button onClick={addComment} disabled={!comment.trim() || busy}
                      data-testid="add-comment-btn"
                      className="px-4 py-2 text-xs uppercase tracking-widest bg-[#06402B] text-white disabled:opacity-40">Post</button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

// ---------- shared helpers ----------
const inputCls = "p-2 text-sm border border-[#E8E4D9] focus:outline-none focus:border-[#06402B] bg-white w-full";
function Field({ label, full, children }) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <label className="block text-[10px] uppercase tracking-widest font-bold text-[#06402B] mb-1">{label}</label>
      {children}
    </div>
  );
}
