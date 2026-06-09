import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { Navigate, useLocation } from "react-router-dom";
import DashShell from "@/components/layout/DashShell";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, Legend,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import MasterLeadPipeline from "@/components/admin/MasterLeadPipeline";
import CrmSettings from "@/components/admin/CrmSettings";
import RejectPackageDialog from "@/components/admin/RejectPackageDialog";
import DesignerProjects from "@/components/admin/DesignerProjects";
import AdminQuotationQueue from "@/components/admin/AdminQuotationQueue";

// Custom Tabs based on Homesqre Architecture
const LINKS = [
  { to: "#overview", label: "Overview & Planner" },
  { to: "#pipeline", label: "Master Lead Pipeline" },
  { to: "#measurements", label: "Verify Floor Plan" },
  { to: "#site-visits", label: "Site Visits" },
  { to: "#designs", label: "Active Designs (3D)" },
  { to: "#quotations", label: "Awaiting Quotation" },
  { to: "#users", label: "Departments" },
  { to: "#crm-settings", label: "CRM Settings" },
];

export default function AdminDashboard() {
  const { user } = useAuth();
  const location = useLocation();

  // Derive active tab directly from React Router's location.hash
  // useLocation updates whenever a <Link> changes the hash —
  const activeTab = (location.hash.replace('#', '') || 'overview');

  if (user === undefined) return null;
  if (user === null) return <Navigate to="/login" />;
  if (user.role !== "admin") {
    // Sales / designer have their own dedicated dashboards.
    if (user.role === "sales") return <Navigate to="/dashboard/sales" />;
    if (user.role === "designer") return <Navigate to="/dashboard/designer" />;
    return <Navigate to="/" />;
  }

  return (
    <DashShell links={LINKS} title="Homesqre Command Center">
      <div className="flex gap-4 border-b border-[#E8E4D9] mb-8 pb-2 overflow-x-auto">
        {LINKS.map(link => (
          <button 
            key={link.to} 
            onClick={() => {
              window.location.hash = link.to;
            }}
            className={`text-sm font-medium pb-2 whitespace-nowrap ${activeTab === link.to.replace('#', '') ? 'text-[#0C1D42] border-b-2 border-[#0C1D42]' : 'text-gray-400'}`}
          >
            {link.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" && <TabOverview />}
      {activeTab === "pipeline" && <MasterLeadPipeline mode="admin" currentUser={user} />}
      {activeTab === "measurements" && <TabSiteVisits />}
      {activeTab === "site-visits" && <TabAdminSiteVisits />}
      {activeTab === "designs" && <DesignerProjects currentUser={user} />}
      {activeTab === "quotations" && <AdminQuotationQueue />}
      {activeTab === "users" && <TabUsers />}
      {activeTab === "crm-settings" && <CrmSettings />}
      
    </DashShell>
  );
}

// ==========================================
// TAB: ADMIN SITE VISITS
// ==========================================
export function TabAdminSiteVisits() {
  const [projects, setProjects] = useState([]);
  const [uploading, setUploading] = useState({});
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [slotsData, setSlotsData] = useState({ blocked_slots: [], booked_slots: [] });

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/admin/design/projects");
      // Filter for projects that have a site visit scheduled but not done
      const pendingVisits = (data || []).filter(p => p.site_visit_at && !p.site_visit_done);
      setProjects(pendingVisits);
    } catch (err) {
      toast.error("Failed to load site visits.");
    }
  }, []);

  const loadSlots = useCallback(async () => {
    if (!selectedDate) return;
    const dStr = selectedDate.toISOString().split('T')[0];
    try {
      const { data } = await api.get(`/site-visits/slots?start_date=${dStr}&end_date=${dStr}`);
      setSlotsData({ blocked_slots: data.blocked_slots || [], booked_slots: data.booked_slots || [] });
    } catch (err) {
      console.error(err);
    }
  }, [selectedDate]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadSlots(); }, [loadSlots]);

  const toggleSlot = async (slotVal) => {
    const dStr = selectedDate.toISOString().split('T')[0];
    const dt = `${dStr}T${slotVal}:00`;
    
    if (slotsData.booked_slots.includes(dt)) {
        toast.error("Slot is already booked by a customer.");
        return;
    }
    
    try {
        if (slotsData.blocked_slots.includes(dt)) {
            await api.delete(`/admin/site-visits/blocks/${dt}`);
            toast.success("Slot unblocked");
        } else {
            await api.post(`/admin/site-visits/blocks`, { slot: dt });
            toast.success("Slot blocked");
        }
        loadSlots();
    } catch (err) {
        toast.error(formatApiError(err));
    }
  };

  const getNext3Days = () => {
    const days = [];
    const now = new Date();
    for (let i = 0; i < 3; i++) {
      const d = new Date();
      d.setDate(now.getDate() + i);
      days.push(d);
    }
    return days;
  };

  const allTimeSlots = [
    "08:00", "08:30", "09:00", "09:30", "10:00", "10:30",
    "11:00", "11:30", "12:00", "12:30", "13:00", "13:30",
    "14:00", "14:30", "15:00", "15:30", "16:00", "16:30",
    "17:00", "17:30", "18:00", "18:30", "19:00", "19:30"
  ];

  const handleMeasurementUpload = async (leadId, e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(prev => ({ ...prev, [leadId]: true }));
    try {
      const form = new FormData();
      form.append("file", file);
      await api.post(`/admin/leads/${leadId}/site-visit-done`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success(`Site visit completed & measurements uploaded!`);
      load();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setUploading(prev => ({ ...prev, [leadId]: false }));
      e.target.value = "";
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in">
      {/* SLOT MANAGER */}
      <div className="bg-white border border-[#E8E4D9] p-6">
        <h3 className="font-display text-xl text-[#0C1D42] mb-2">Slot Manager</h3>
        <p className="text-sm text-[#333333] mb-4">Block or unblock specific times to manage lead engineer availability for the next 3 days.</p>
        
        <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
          {getNext3Days().map((d, i) => {
            const isSelected = selectedDate.toDateString() === d.toDateString();
            return (
              <button
                key={i}
                onClick={() => setSelectedDate(d)}
                className={`px-4 py-2 text-xs uppercase tracking-widest font-bold border transition whitespace-nowrap rounded ${
                  isSelected ? "bg-[#0C1D42] text-white border-[#0C1D42]" : "border-[#E8E4D9] text-[#333333] hover:bg-[#F3F0E9]"
                }`}
              >
                {d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
          {allTimeSlots.map(slot => {
            const dt = `${selectedDate.toISOString().split('T')[0]}T${slot}:00`;
            const isBooked = slotsData.booked_slots.includes(dt);
            const isBlocked = slotsData.blocked_slots.includes(dt);
            
            let btnClass = "border-[#E8E4D9] text-[#0C1D42] hover:bg-[#F3F0E9]";
            let statusLabel = "Available";
            
            if (isBooked) {
              btnClass = "bg-green-100 text-green-800 border-green-200 cursor-not-allowed";
              statusLabel = "Booked";
            } else if (isBlocked) {
              btnClass = "bg-red-100 text-red-800 border-red-200";
              statusLabel = "Blocked";
            }

            // Convert 13:00 to 01:00 PM for display
            const [h, m] = slot.split(":");
            const hour = parseInt(h, 10);
            const ampm = hour >= 12 ? 'PM' : 'AM';
            const displayHour = hour % 12 || 12;
            const displayLabel = `${displayHour < 10 ? '0'+displayHour : displayHour}:${m} ${ampm}`;

            return (
              <button
                key={slot}
                onClick={() => toggleSlot(slot)}
                className={`p-2 border transition rounded flex flex-col items-center justify-center gap-1 ${btnClass}`}
                title={isBooked ? "Cannot block a booked slot" : "Click to toggle"}
              >
                <span className="text-sm font-bold">{displayLabel}</span>
                <span className="text-[9px] uppercase tracking-widest">{statusLabel}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="font-display text-xl text-[#0C1D42] mb-4">Pending Site Visits</h3>
        {projects.length === 0 ? (
          <div className="bg-white border border-[#E8E4D9] p-8 text-center text-gray-500 text-sm">
            No pending site visits. Once a customer books a visit date, it will appear here.
          </div>
        ) : (
          projects.map(p => (
            <div key={p.project_id} className="bg-white border border-[#E8E4D9] p-5 mb-4">
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
              <p className="text-xs text-[#333333] mt-1">Lead ID: {p.lead_id}</p>
            </div>
            <div>
              <label className="cursor-pointer bg-[#0C1D42] text-white px-6 py-3 text-xs uppercase tracking-widest font-bold hover:bg-[#08142D] transition">
                {uploading[p.lead_id] ? "Uploading…" : "Mark as Done & Upload Measurements"}
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp"
                  className="hidden"
                  disabled={uploading[p.lead_id]}
                  onChange={(e) => handleMeasurementUpload(p.lead_id, e)}
                />
              </label>
              <p className="text-[10px] text-gray-400 mt-2 text-right">Upload is mandatory to complete visit</p>
            </div>
          </div>
        </div>
          ))
        )}
      </div>
    </div>
  );
}

// ==========================================
// TAB 1: OVERVIEW & PLANNER (Analytics)
// ==========================================
export function TabOverview() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState("overview");

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/admin/analytics/overview");
        setData(data);
      } catch (err) {
        toast.error(formatApiError(err));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-[#0C1D42] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-[#333333]">Loading analytics…</p>
      </div>
    </div>
  );
  if (!data) return <p className="text-sm text-red-600">Could not load analytics.</p>;

  const c = data.cards || {};
  const totalLeads = c.total_leads || 0;
  const converted = (data.leads_by_status || []).find(s => s.name === "Payment Received")?.count || 0;

  const sections = [
    { id: "overview", label: "Overview" },
    { id: "performance", label: "Sales Performance" },
    { id: "missed", label: `Missed Calls (${c.missed_calls ?? 0})` },
    { id: "overdue", label: `Overdue Follow-ups (${c.overdue_followups ?? 0})` },
  ];

  return (
    <div className="animate-in fade-in space-y-6" data-testid="admin-analytics">
      {/* Section nav */}
      <div className="flex gap-2 border-b border-[#E8E4D9] pb-2 overflow-x-auto">
        {sections.map(s => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id)}
            className={`text-xs font-bold uppercase tracking-widest pb-2 whitespace-nowrap px-3 transition-colors ${
              activeSection === s.id
                ? "text-[#0C1D42] border-b-2 border-[#0C1D42]"
                : "text-gray-400 hover:text-[#0C1D42]"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW SECTION ── */}
      {activeSection === "overview" && (
        <div className="space-y-6">
          {/* Top-line metric cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <MetricCard label="Total Retainers" value={`₹${Number(c.total_retainers || 0).toLocaleString("en-IN")}`} accent="green" />
            <MetricCard label="Follow-ups Today" value={c.followups_today ?? 0} accent="gold" testId="metric-followups-today" />
            <MetricCard label="Missed Calls" value={c.missed_calls ?? 0} accent="red" testId="metric-missed-calls" />
            <MetricCard label="Overdue Follow-ups" value={c.overdue_followups ?? 0} accent="red" testId="metric-overdue-followups" />
            <MetricCard label="Conversion Rate" value={`${c.conversion_rate ?? 0}%`} accent={c.conversion_rate >= 10 ? "green" : "gold"} />
          </div>

          {/* Secondary metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard label="Total Leads" value={c.total_leads ?? 0} accent="green" />
            <MetricCard label="Pending Verifications" value={c.pending_verifications ?? 0} accent="gold" />
            <MetricCard label="Active Site Visits" value={c.active_site_visits ?? 0} accent="green" />
            <MetricCard label="Awaiting Quotation" value={c.ready_for_quotation ?? 0} accent="gold" />
          </div>

          {/* Charts grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartCard title="New Leads (last 14 days)" testId="chart-leads-by-day">
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={data.leads_by_day} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gLeads" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0C1D42" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#0C1D42" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8E4D9" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#333333" }} tickFormatter={(d) => d.slice(5)} />
                  <YAxis tick={{ fontSize: 10, fill: "#333333" }} allowDecimals={false} />
                  <Tooltip contentStyle={{ fontSize: 12, border: "1px solid #E8E4D9" }} />
                  <Area type="monotone" dataKey="count" stroke="#0C1D42" strokeWidth={2} fill="url(#gLeads)" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Leads by Status" testId="chart-leads-by-status">
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={data.leads_by_status}
                    dataKey="count"
                    nameKey="name"
                    cx="50%" cy="50%"
                    innerRadius={48}
                    outerRadius={88}
                    paddingAngle={2}
                  >
                    {data.leads_by_status.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 12, border: "1px solid #E8E4D9" }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Top Lead Sources" testId="chart-leads-by-source">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.leads_by_source} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8E4D9" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#333333" }} />
                  <YAxis tick={{ fontSize: 10, fill: "#333333" }} allowDecimals={false} />
                  <Tooltip contentStyle={{ fontSize: 12, border: "1px solid #E8E4D9" }} />
                  <Bar dataKey="count" fill="#DA9E3E" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Customers by Project Phase" testId="chart-customers-by-phase">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.customers_by_phase} layout="vertical" margin={{ top: 10, right: 10, left: 20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8E4D9" />
                  <XAxis type="number" tick={{ fontSize: 10, fill: "#333333" }} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#333333" }} width={110} />
                  <Tooltip contentStyle={{ fontSize: 12, border: "1px solid #E8E4D9" }} />
                  <Bar dataKey="count" fill="#0C1D42" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        </div>
      )}

      {/* ── SALES PERFORMANCE SECTION ── */}
      {activeSection === "performance" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard label="Total Leads" value={c.total_leads ?? 0} accent="green" />
            <MetricCard label="Converted" value={converted} accent="green" />
            <MetricCard label="Conversion Rate" value={`${c.conversion_rate ?? 0}%`} accent={c.conversion_rate >= 10 ? "green" : "gold"} />
            <MetricCard label="Follow-ups Today" value={c.followups_today ?? 0} accent="gold" />
          </div>

          {/* Per-salesperson chart */}
          {(data.leads_by_salesperson || []).length > 0 && (
            <ChartCard title="Per-Salesperson Performance" testId="chart-sales-perf">
              <ResponsiveContainer width="100%" height={Math.max(240, (data.leads_by_salesperson || []).length * 52)}>
                <BarChart
                  data={data.leads_by_salesperson}
                  layout="vertical"
                  margin={{ top: 10, right: 40, left: 60, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8E4D9" />
                  <XAxis type="number" tick={{ fontSize: 10, fill: "#333333" }} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#333333" }} width={120} />
                  <Tooltip contentStyle={{ fontSize: 12, border: "1px solid #E8E4D9" }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="total" name="Total Leads" fill="#0C1D42" radius={[0, 3, 3, 0]} />
                  <Bar dataKey="converted" name="Converted" fill="#DA9E3E" radius={[0, 3, 3, 0]} />
                  <Bar dataKey="missed_calls" name="Missed Calls" fill="#B53A3A" radius={[0, 3, 3, 0]} />
                  <Bar dataKey="overdue_followups" name="Overdue Follow-ups" fill="#D4885A" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {/* Salesperson table */}
          <div className="bg-white border border-[#E8E4D9] overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F3F0E9]">
                <tr>
                  <th className="text-left p-4 text-xs font-bold uppercase tracking-widest text-[#0C1D42]">Sales Rep</th>
                  <th className="text-center p-4 text-xs font-bold uppercase tracking-widest text-[#0C1D42]">Total Leads</th>
                  <th className="text-center p-4 text-xs font-bold uppercase tracking-widest text-[#0C1D42]">Converted</th>
                  <th className="text-center p-4 text-xs font-bold uppercase tracking-widest text-[#0C1D42]">Conv. Rate</th>
                  <th className="text-center p-4 text-xs font-bold uppercase tracking-widest text-red-600">Missed Calls</th>
                  <th className="text-center p-4 text-xs font-bold uppercase tracking-widest text-orange-600">Overdue F/U</th>
                </tr>
              </thead>
              <tbody>
                {(data.leads_by_salesperson || []).length === 0 && (
                  <tr><td colSpan="6" className="p-6 text-center text-gray-400 italic text-sm">No leads assigned to any salesperson yet.</td></tr>
                )}
                {(data.leads_by_salesperson || []).map((rep, i) => {
                  const rate = rep.total > 0 ? ((rep.converted / rep.total) * 100).toFixed(1) : "0.0";
                  return (
                    <tr key={i} className="border-t border-[#E8E4D9] hover:bg-[#FCFAF5] transition">
                      <td className="p-4 font-medium text-[#0C1D42]">{rep.name || "—"}</td>
                      <td className="p-4 text-center font-bold">{rep.total}</td>
                      <td className="p-4 text-center text-[#0C1D42] font-bold">{rep.converted}</td>
                      <td className="p-4 text-center">
                        <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${parseFloat(rate) >= 10 ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                          {rate}%
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <span className={`font-bold ${rep.missed_calls > 0 ? "text-red-600" : "text-gray-400"}`}>{rep.missed_calls}</span>
                      </td>
                      <td className="p-4 text-center">
                        <span className={`font-bold ${rep.overdue_followups > 0 ? "text-orange-600" : "text-gray-400"}`}>{rep.overdue_followups}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── MISSED CALLS SECTION ── */}
      {activeSection === "missed" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 bg-red-50 border border-red-200 px-4 py-3 rounded">
            <span className="text-red-600 text-xl">📞</span>
            <div>
              <p className="text-sm font-bold text-red-700">Missed / No-Answer Leads</p>
              <p className="text-xs text-red-500">These leads need a follow-up call. Assign or update their status once contacted.</p>
            </div>
            <span className="ml-auto bg-red-600 text-white text-sm font-bold px-3 py-1 rounded-full">{c.missed_calls ?? 0}</span>
          </div>

          <div className="bg-white border border-[#E8E4D9] overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F3F0E9]">
                <tr>
                  <th className="text-left p-4 text-xs font-bold uppercase tracking-widest text-[#0C1D42]">Lead Name</th>
                  <th className="text-left p-4 text-xs font-bold uppercase tracking-widest text-[#0C1D42]">Phone</th>
                  <th className="text-left p-4 text-xs font-bold uppercase tracking-widest text-[#0C1D42]">Assigned To</th>
                  <th className="text-left p-4 text-xs font-bold uppercase tracking-widest text-[#0C1D42]">Source</th>
                  <th className="text-left p-4 text-xs font-bold uppercase tracking-widest text-[#0C1D42]">Created</th>
                  <th className="text-left p-4 text-xs font-bold uppercase tracking-widest text-red-600">Status</th>
                </tr>
              </thead>
              <tbody>
                {(data.missed_calls_list || []).length === 0 && (
                  <tr><td colSpan="6" className="p-6 text-center text-gray-400 italic">No missed calls. Great job! 🎉</td></tr>
                )}
                {(data.missed_calls_list || []).map((lead, i) => (
                  <tr key={lead.lead_id || i} className="border-t border-[#E8E4D9] hover:bg-red-50/30 transition">
                    <td className="p-4 font-medium text-[#0C1D42]">{lead.name}</td>
                    <td className="p-4">
                      <a href={`tel:${lead.phone}`} className="text-[#DA9E3E] hover:underline font-medium">{lead.phone}</a>
                    </td>
                    <td className="p-4 text-[#333333]">{lead.assigned_to || <span className="text-gray-400 italic">Unassigned</span>}</td>
                    <td className="p-4 text-[#333333]">{lead.source || "—"}</td>
                    <td className="p-4 text-xs text-gray-400">{lead.created_at ? new Date(lead.created_at).toLocaleDateString("en-IN") : "—"}</td>
                    <td className="p-4">
                      <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded">{lead.status || "—"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── OVERDUE FOLLOW-UPS SECTION ── */}
      {activeSection === "overdue" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 bg-orange-50 border border-orange-200 px-4 py-3 rounded">
            <span className="text-orange-600 text-xl">⏰</span>
            <div>
              <p className="text-sm font-bold text-orange-700">Overdue Follow-ups</p>
              <p className="text-xs text-orange-500">These leads had a scheduled follow-up date that has already passed. Take action now.</p>
            </div>
            <span className="ml-auto bg-orange-500 text-white text-sm font-bold px-3 py-1 rounded-full">{c.overdue_followups ?? 0}</span>
          </div>

          <div className="bg-white border border-[#E8E4D9] overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F3F0E9]">
                <tr>
                  <th className="text-left p-4 text-xs font-bold uppercase tracking-widest text-[#0C1D42]">Lead Name</th>
                  <th className="text-left p-4 text-xs font-bold uppercase tracking-widest text-[#0C1D42]">Phone</th>
                  <th className="text-left p-4 text-xs font-bold uppercase tracking-widest text-[#0C1D42]">Assigned To</th>
                  <th className="text-left p-4 text-xs font-bold uppercase tracking-widest text-[#0C1D42]">Status</th>
                  <th className="text-left p-4 text-xs font-bold uppercase tracking-widest text-orange-600">Was Due</th>
                </tr>
              </thead>
              <tbody>
                {(data.overdue_followups_list || []).length === 0 && (
                  <tr><td colSpan="5" className="p-6 text-center text-gray-400 italic">No overdue follow-ups. Everything is on track! ✅</td></tr>
                )}
                {(data.overdue_followups_list || []).map((lead, i) => {
                  const daysPast = lead.next_followup_at
                    ? Math.floor((Date.now() - new Date(lead.next_followup_at)) / 86400000)
                    : null;
                  return (
                    <tr key={lead.lead_id || i} className="border-t border-[#E8E4D9] hover:bg-orange-50/30 transition">
                      <td className="p-4 font-medium text-[#0C1D42]">{lead.name}</td>
                      <td className="p-4">
                        <a href={`tel:${lead.phone}`} className="text-[#DA9E3E] hover:underline font-medium">{lead.phone}</a>
                      </td>
                      <td className="p-4 text-[#333333]">{lead.assigned_to || <span className="text-gray-400 italic">Unassigned</span>}</td>
                      <td className="p-4">
                        <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded">{lead.status || "—"}</span>
                      </td>
                      <td className="p-4">
                        <div className="text-xs text-orange-600 font-bold">
                          {lead.next_followup_at ? new Date(lead.next_followup_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—"}
                        </div>
                        {daysPast !== null && daysPast > 0 && (
                          <div className="text-[10px] text-red-500 mt-0.5">{daysPast} day{daysPast > 1 ? "s" : ""} overdue</div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

const PIE_COLORS = ["#0C1D42", "#DA9E3E", "#C88C2F", "#08142D", "#333333", "#D4B069", "#C88C2F", "#2d6e54"];

function MetricCard({ label, value, accent, testId }) {
  const color = accent === "gold" ? "#DA9E3E" : accent === "red" ? "#B53A3A" : "#0C1D42";
  return (
    <div className="bg-white border border-[#E8E4D9] p-4" data-testid={testId}>
      <p className="text-[10px] uppercase tracking-widest text-[#333333] mb-2">{label}</p>
      <p className="font-display text-2xl" style={{ color }}>{value}</p>
    </div>
  );
}

function ChartCard({ title, testId, children }) {
  return (
    <div className="bg-white border border-[#E8E4D9] p-4" data-testid={testId}>
      <h4 className="text-xs uppercase tracking-widest font-bold text-[#0C1D42] mb-3">{title}</h4>
      {children}
    </div>
  );
}

// ==========================================
// TAB 2: DISCOVERY CALLS (CRM)
// ==========================================
export function TabDiscoveryCalls({ currentUser }) {
  const [calls, setCalls] = useState([]);
  
  const loadCalls = useCallback(async () => {
    try {
      const { data } = await api.get("/admin/discovery-calls");
      setCalls(data || []);
    } catch (err) {
      toast.error("Failed to load discovery calls.");
    }
  }, []);

  useEffect(() => {
    loadCalls();
    // Poll every 30 seconds for auto-assign updates
    const interval = setInterval(loadCalls, 30000);
    return () => clearInterval(interval);
  }, [loadCalls]);

  const updateStatus = async (callId, newStatus) => {
    try {
      await api.put(`/admin/discovery-calls/${callId}/status`, { status: newStatus });
      toast.success("Call status updated.");
      loadCalls();
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  const getMinutesPassed = (isoDate) => {
    const diff = new Date() - new Date(isoDate);
    return Math.floor(diff / 60000);
  };

  return (
    <div className="animate-in fade-in">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-display text-xl text-[#0C1D42]">Active Call Queue</h3>
        <button onClick={loadCalls} className="text-sm underline text-[#DA9E3E]">Refresh Queue</button>
      </div>

      <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-6 text-sm text-blue-800">
        <strong>Auto-Assign Logic Active:</strong> Leads are routed round-robin. If a lead is not marked 'Connected' or 'Missed' within 15 minutes, it automatically shifts to the next available agent.
      </div>

      <table className="w-full text-sm bg-white border border-[#E8E4D9]">
        <thead className="bg-[#F3F0E9]">
          <tr>
            <th className="text-left p-4 font-bold">Lead Contact</th>
            <th className="text-left p-4 font-bold">Assigned To</th>
            <th className="text-left p-4 font-bold text-red-600">Reassigns In (15m limit)</th>
            <th className="text-left p-4 font-bold">Action</th>
          </tr>
        </thead>
        <tbody>
          {calls.length === 0 && (
            <tr><td colSpan="4" className="p-4 text-center text-gray-500">No active discovery calls.</td></tr>
          )}
          {calls.map(c => {
            const minsPassed = getMinutesPassed(c.assigned_at);
            const minsLeft = Math.max(0, 15 - minsPassed);
            const isMine = c.assigned_to === currentUser.name;
            
            return (
              <tr key={c.call_id} className="border-t border-[#E8E4D9]">
                <td className="p-4">{c.name} <br/><span className="text-gray-500">{c.phone}</span></td>
                <td className={`p-4 font-bold ${isMine ? 'text-green-600' : 'text-[#0C1D42]'}`}>
                  {c.assigned_to} {isMine && "(You)"}
                </td>
                <td className="p-4 font-bold text-red-600">
                  {c.status === "pending" ? `${minsLeft} mins` : "Resolved"}
                </td>
                <td className="p-4">
                  <select 
                    className="border border-[#E8E4D9] p-1 text-xs"
                    value={c.status}
                    onChange={(e) => updateStatus(c.call_id, e.target.value)}
                  >
                    <option value="pending">Pending</option>
                    <option value="missed">Did Not Answer (Missed)</option>
                    <option value="connected">Connected / Resolved</option>
                  </select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ==========================================
// TAB 3: VERIFICATION & SITE VISITS
// ==========================================
export function TabSiteVisits() {
  const [verifications, setVerifications] = useState([]);
  const [rejecting, setRejecting] = useState(null);   // verification record being rejected

  const backend = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/$/, "");
  const absUrl = (u) => (u && u.startsWith("http") ? u : `${backend}${u}`);

  const loadVerifications = useCallback(async () => {
    try {
      const { data } = await api.get("/admin/verifications");
      setVerifications(data || []);
    } catch (err) {
      toast.error("Failed to load verifications.");
    }
  }, []);

  useEffect(() => { loadVerifications(); }, [loadVerifications]);

  const handleApprove = async (verId) => {
    try {
      await api.put(`/admin/verifications/${verId}`, { action: "approve" });
      toast.success("Approved — customer moved to scheduling.");
      loadVerifications();
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  const pending = verifications.filter(v => v.status === "pending");
  const recentlyResolved = verifications.filter(v =>
    v.status === "package_mismatch" || v.status === "package_adjusted_paid" || v.status === "approved"
  ).slice(0, 8);

  return (
    <div className="animate-in fade-in" data-testid="verification-queue">
      <h3 className="font-display text-xl text-[#0C1D42] mb-4">Floor Plan Verification Queue</h3>

      {pending.length === 0 ? (
        <p className="text-gray-500 bg-white border border-[#E8E4D9] p-6 mb-8 text-center">No pending floor plans to verify.</p>
      ) : (
        pending.map(v => (
          <div key={v.verification_id} className="bg-white border border-[#E8E4D9] p-6 mb-4" data-testid={`verification-${v.verification_id}`}>
            <div className="flex justify-between items-start mb-4">
              <div>
                {(v.customer?.name || v.customer?.project_name) && (
                  <p className="text-xs uppercase tracking-widest text-[#DA9E3E] font-bold mb-1">
                    {v.customer?.name}{v.customer?.project_name ? ` — ${v.customer.project_name}` : ""}
                  </p>
                )}
                <h4 className="font-bold text-[#0C1D42] capitalize">{v.bhk_or_units} {v.property_type}</h4>
                <p className="text-sm text-gray-500">Invoice Paid: ₹{Number(v.invoice_paid).toLocaleString('en-IN')}</p>
                <p className="text-sm text-gray-500 mt-2"><strong>Client Notes:</strong> {v.room_requirements}</p>
              </div>
              <div className="flex flex-col items-end gap-2">
                {((v.pdf_urls && v.pdf_urls.length > 0) ? v.pdf_urls : (v.pdf_url ? [v.pdf_url] : [])).map((u, idx) => (
                  <a key={idx} href={absUrl(u)} target="_blank" rel="noopener noreferrer" download
                     data-testid={`download-plan-${v.verification_id}-${idx}`}
                     className="text-[#DA9E3E] underline text-sm border p-2">
                    Floor Plan {idx + 1}
                  </a>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-3 border-t pt-4">
              <button onClick={() => handleApprove(v.verification_id)}
                      data-testid={`approve-${v.verification_id}`}
                      className="bg-[#0C1D42] text-white px-6 py-2 text-xs uppercase tracking-widest font-bold hover:bg-[#08142D]">
                Approve (Push to Scheduling)
              </button>
              <button onClick={() => setRejecting(v)}
                      data-testid={`reject-package-${v.verification_id}`}
                      className="border border-red-600 text-red-600 px-6 py-2 text-xs uppercase tracking-widest font-bold hover:bg-red-50">
                Reject — Package Mismatch
              </button>
            </div>
          </div>
        ))
      )}

      {recentlyResolved.length > 0 && (
        <div className="mt-10">
          <h4 className="font-display text-sm uppercase tracking-widest text-[#0C1D42] mb-3">Recently resolved</h4>
          <div className="space-y-2">
            {recentlyResolved.map(v => (
              <div key={v.verification_id} className="bg-[#F3F0E9] border border-[#E8E4D9] p-3 text-xs flex justify-between items-center">
                <span className="capitalize">
                  {v.customer?.name && <strong className="not-italic">{v.customer.name}</strong>}
                  {v.customer?.project_name && <> — <em className="text-[#333333]">{v.customer.project_name}</em></>}
                  {" • "}
                  {v.bhk_or_units} {v.property_type}
                  {v.corrected_property_type && (
                    <> → <strong>{v.corrected_bhk_or_units} {v.corrected_property_type}</strong></>
                  )}
                </span>
                <span className="text-[#333333]">
                  {v.status === "approved" && (v.site_visit_at
                    ? `Approved — Site visit: ${new Date(v.site_visit_at).toLocaleString()}`
                    : "Approved — Awaiting site visit booking")}
                  {v.status === "package_mismatch" && `Awaiting customer payment ₹${(v.differential_amount || 0).toLocaleString("en-IN")}`}
                  {v.status === "package_adjusted_paid" && `Paid — Designing (final ₹${(v.final_invoice || 0).toLocaleString("en-IN")})`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {rejecting && (
        <RejectPackageDialog
          verification={rejecting}
          onClose={() => setRejecting(null)}
          onSubmitted={() => { setRejecting(null); loadVerifications(); }}
        />
      )}
    </div>
  );
}

// ==========================================
// TAB 4: TEAM MANAGEMENT
// ==========================================
function TabUsers() {
  const [employees, setEmployees] = useState([]);
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("sales");

  // State for inline editing
  const [editingEmail, setEditingEmail] = useState(null);
  const [editRole, setEditRole] = useState("");

  const loadEmployees = useCallback(async () => {
    try {
      const { data } = await api.get("/admin/employees");
      setEmployees(data || []);
    } catch (err) {
      toast.error("Failed to load employee list.");
    }
  }, []);

  useEffect(() => { loadEmployees(); }, [loadEmployees]);

  const handleAddMember = async (e) => {
    e.preventDefault();
    if (!newEmail || !newPassword) {
      toast.error("Email and Temporary Password are required.");
      return;
    }
    try {
      const response = await api.post("/admin/employees", {
        email: newEmail,
        phone: newPhone,
        password: newPassword,
        role: newRole
      });
      toast.success(response.data?.message || "Account created successfully!");
      setNewEmail("");
      setNewPhone("");
      setNewPassword("");
      loadEmployees();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to create account.");
    }
  };

  // Delete Handler
  const handleDelete = async (email) => {
    if (!window.confirm(`Are you sure you want to permanently remove ${email}?`)) return;
    try {
      await api.delete(`/admin/employees/${email}`);
      toast.success("Department member deleted.");
      loadEmployees();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to delete member.");
    }
  };

  // Save Edit Handler
  const handleSaveEdit = async (email) => {
    try {
      await api.put(`/admin/employees/${email}`, { role: editRole });
      toast.success("Role updated successfully.");
      setEditingEmail(null);
      loadEmployees();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to update role.");
    }
  };

  return (
    <div className="animate-in fade-in space-y-8">
      {/* ADD EMPLOYEE FORM */}
      <div className="bg-white p-6 border border-[#E8E4D9]">
        <h3 className="font-display text-lg mb-4 text-[#0C1D42]">Add Department Member</h3>
        <form onSubmit={handleAddMember} className="flex flex-col gap-4 max-w-md mt-4">
          <div className="grid grid-cols-2 gap-4">
            <input 
              type="email" 
              placeholder="Department Member Email *"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="border border-[#E8E4D9] p-2 rounded focus:outline-none focus:border-[#08142D]"
            />
            <input 
              type="text" 
              placeholder="Phone Number"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              className="border border-[#E8E4D9] p-2 rounded focus:outline-none focus:border-[#08142D]"
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <input 
              type="password" 
              placeholder="Temporary Password *"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="border border-[#E8E4D9] p-2 rounded focus:outline-none focus:border-[#08142D]"
            />
            <select 
              value={newRole} 
              onChange={(e) => setNewRole(e.target.value)}
              className="border border-[#E8E4D9] p-2 rounded focus:outline-none focus:border-[#08142D]"
            >
              <option value="sales">Sales Department</option>
              <option value="designer">Design Department</option>
              <option value="admin">Administrator</option>
            </select>
          </div>
          
          <button type="submit" className="bg-[#08142D] text-white px-4 py-2 rounded hover:bg-[#08142D] transition-colors w-full">
            Create Department Account
          </button>
        </form>
      </div>

      {/* EMPLOYEE TABLE */}
      <div className="overflow-x-auto border border-[#E8E4D9]">
        <table className="w-full text-sm bg-white">
          <thead className="bg-[#F3F0E9]">
            <tr>
              <th className="text-left p-4">Email</th>
              <th className="text-left p-4">Role</th>
              <th className="text-left p-4">Status</th>
              <th className="text-left p-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {employees.map(e => (
              <tr key={e.email} className="border-t">
                <td className="p-4">{e.email}</td>
                
                {/* ROLE COLUMN (Transforms into a dropdown if editing) */}
                <td className="p-4 uppercase text-xs">
                  {editingEmail === e.email ? (
                    <select 
                      value={editRole} 
                      onChange={(evt) => setEditRole(evt.target.value)}
                      className="border border-[#08142D] p-1 rounded"
                    >
                      <option value="sales">Sales Department</option>
                      <option value="designer">Design Department</option>
                      <option value="admin">Admin</option>
                    </select>
                  ) : (
                    e.role
                  )}
                </td>
                
                <td className="p-4 text-green-600 font-bold">ACTIVE</td>
                
                {/* ACTIONS COLUMN */}
                <td className="p-4 flex gap-4">
                  {editingEmail === e.email ? (
                    <>
                      <button onClick={() => handleSaveEdit(e.email)} className="text-[#08142D] font-bold hover:underline">Save</button>
                      <button onClick={() => setEditingEmail(null)} className="text-gray-500 hover:underline">Cancel</button>
                    </>
                  ) : (
                    <>
                      <button 
                        onClick={() => { setEditingEmail(e.email); setEditRole(e.role); }} 
                        className="text-[#DA9E3E] hover:underline"
                      >
                        Edit
                      </button>
                      <button onClick={() => handleDelete(e.email)} className="text-red-600 hover:underline">
                        Delete
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
