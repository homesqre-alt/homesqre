import { useEffect, useState, useCallback } from "react";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";

/**
 * DesignerLeadsList — read-only static list of the designer's leads.
 * Per product spec: NO actions, NO drill-down, NO phone/email — the designer
 * just sees how many leads they have, their status and lifecycle dates.
 * Backend already strips phone/email for `role=designer` on /api/leads.
 */
export default function DesignerLeadsList() {
  const [leads, setLeads] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/leads?limit=500");
      setLeads(data.items || []);
      setTotal(data.total || 0);
    } catch (err) { toast.error(formatApiError(err)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <p className="text-sm text-[#333333]">Loading leads…</p>;

  return (
    <div className="animate-in fade-in space-y-4" data-testid="designer-leads-list">
      <header className="flex items-center justify-between border-b border-[#EDE5DB] pb-3">
        <div>
          <h3 className="font-display text-xl text-[#0C1D42]">My Leads</h3>
          <p className="text-xs text-[#333333]">{total} lead{total === 1 ? "" : "s"} assigned to you. Read-only — workflow happens automatically as you progress design projects.</p>
        </div>
        <button onClick={load} className="text-xs underline text-[#DA9E3E]" data-testid="designer-leads-refresh">Refresh</button>
      </header>

      {leads.length === 0 ? (
        <p className="bg-white border border-[#EDE5DB] p-6 text-center text-[#333333]" data-testid="designer-leads-empty">
          You don&apos;t have any leads assigned yet.
        </p>
      ) : (
        <div className="bg-white border border-[#EDE5DB] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#F5EDE8] text-left text-[10px] uppercase tracking-widest text-[#0C1D42]">
              <tr>
                <th className="px-4 py-3 font-bold">Name</th>
                <th className="px-4 py-3 font-bold">Status</th>
                <th className="px-4 py-3 font-bold">Source</th>
                <th className="px-4 py-3 font-bold">Next Follow-up</th>
                <th className="px-4 py-3 font-bold">Updated</th>
              </tr>
            </thead>
            <tbody>
              {leads.map(l => (
                <tr key={l.lead_id} className="border-t border-[#EDE5DB] hover:bg-[#FCFAF5]"
                    data-testid={`designer-lead-row-${l.lead_id}`}>
                  <td className="px-4 py-3 font-medium text-[#0C1D42]">{l.name}</td>
                  <td className="px-4 py-3">
                    <span className="text-[10px] uppercase tracking-widest bg-[#FCFAF5] text-[#DA9E3E] border border-[#DA9E3E] px-2 py-0.5">
                      {l.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[#333333]">{l.source}</td>
                  <td className="px-4 py-3 text-[#333333]">{l.next_followup_at ? new Date(l.next_followup_at).toLocaleString() : "—"}</td>
                  <td className="px-4 py-3 text-[#333333]">{l.updated_at ? new Date(l.updated_at).toLocaleDateString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
