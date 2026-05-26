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
  { to: "#measurements", label: "Verification & Site Visits" },
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
  // unlike window.hashchange which React Router does NOT fire.
  const activeTab = (location.hash.replace('#', '') || 'overview');

  // Request Chrome Notification Permissions on Load
  useEffect(() => {
    if ("Notification" in window && Notification.permission !== "granted") {
      Notification.requestPermission();
    }
  }, []);

  const triggerNotification = (title, body) => {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(title, { body, icon: "/favicon.ico" });
    }
  };

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
            className={`text-sm font-medium pb-2 whitespace-nowrap ${activeTab === link.to.replace('#', '') ? 'text-[#06402B] border-b-2 border-[#06402B]' : 'text-gray-400'}`}
          >
            {link.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" && <TabOverview />}
      {activeTab === "pipeline" && <MasterLeadPipeline mode="admin" currentUser={user} />}
      {activeTab === "measurements" && <TabSiteVisits />}
      {activeTab === "designs" && <DesignerProjects currentUser={user} />}
      {activeTab === "quotations" && <AdminQuotationQueue />}
      {activeTab === "users" && <TabUsers />}
      {activeTab === "crm-settings" && <CrmSettings />}
      
    </DashShell>
  );
}

// ==========================================
// TAB 1: OVERVIEW & PLANNER (Analytics)
// ==========================================
export function TabOverview() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

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

  if (loading) return <p className="text-sm text-[#4A5D54]">Loading analytics…</p>;
  if (!data) return <p className="text-sm text-red-600">Could not load analytics.</p>;

  const c = data.cards || {};

  return (
    <div className="animate-in fade-in space-y-8" data-testid="admin-analytics">
      {/* Top-line metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard label="Total Retainers" value={`₹${Number(c.total_retainers || 0).toLocaleString("en-IN")}`} accent="green" />
        <MetricCard label="Pending Verifications" value={c.pending_verifications ?? 0} accent="gold" />
        <MetricCard label="Active Site Visits" value={c.active_site_visits ?? 0} accent="green" />
        <MetricCard label="In 3D Design" value={c.in_3d_design ?? 0} accent="green" />
        <MetricCard label="Awaiting Quotation" value={c.ready_for_quotation ?? 0} accent="gold" />
        <MetricCard label="Follow-ups Today" value={c.followups_today ?? 0} accent="red" testId="metric-followups-today" />
      </div>

      {/* Charts grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="New Leads (last 14 days)" testId="chart-leads-by-day">
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={data.leads_by_day} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gLeads" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#06402B" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#06402B" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8E4D9" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#4A5D54" }} tickFormatter={(d) => d.slice(5)} />
              <YAxis tick={{ fontSize: 10, fill: "#4A5D54" }} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 12, border: "1px solid #E8E4D9" }} />
              <Area type="monotone" dataKey="count" stroke="#06402B" strokeWidth={2} fill="url(#gLeads)" />
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
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#4A5D54" }} />
              <YAxis tick={{ fontSize: 10, fill: "#4A5D54" }} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 12, border: "1px solid #E8E4D9" }} />
              <Bar dataKey="count" fill="#B68D40" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Customers by Project Phase" testId="chart-customers-by-phase">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.customers_by_phase} layout="vertical" margin={{ top: 10, right: 10, left: 20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8E4D9" />
              <XAxis type="number" tick={{ fontSize: 10, fill: "#4A5D54" }} allowDecimals={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#4A5D54" }} width={110} />
              <Tooltip contentStyle={{ fontSize: 12, border: "1px solid #E8E4D9" }} />
              <Bar dataKey="count" fill="#06402B" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

const PIE_COLORS = ["#06402B", "#B68D40", "#9d7936", "#0a5839", "#4A5D54", "#D4B069", "#7a4f1f", "#2d6e54"];

function MetricCard({ label, value, accent, testId }) {
  const color = accent === "gold" ? "#B68D40" : accent === "red" ? "#B53A3A" : "#06402B";
  return (
    <div className="bg-white border border-[#E8E4D9] p-4" data-testid={testId}>
      <p className="text-[10px] uppercase tracking-widest text-[#4A5D54] mb-2">{label}</p>
      <p className="font-display text-2xl" style={{ color }}>{value}</p>
    </div>
  );
}

function ChartCard({ title, testId, children }) {
  return (
    <div className="bg-white border border-[#E8E4D9] p-4" data-testid={testId}>
      <h4 className="text-xs uppercase tracking-widest font-bold text-[#06402B] mb-3">{title}</h4>
      {children}
    </div>
  );
}

// ==========================================
// TAB 2: DISCOVERY CALLS (CRM)
// ==========================================
export function TabDiscoveryCalls({ triggerNotification, currentUser }) {
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
        <h3 className="font-display text-xl text-[#06402B]">Active Call Queue</h3>
        <button onClick={loadCalls} className="text-sm underline text-[#B68D40]">Refresh Queue</button>
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
                <td className={`p-4 font-bold ${isMine ? 'text-green-600' : 'text-[#06402B]'}`}>
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
      <h3 className="font-display text-xl text-[#06402B] mb-4">Floor Plan Verification Queue</h3>

      {pending.length === 0 ? (
        <p className="text-gray-500 bg-white border border-[#E8E4D9] p-6 mb-8 text-center">No pending floor plans to verify.</p>
      ) : (
        pending.map(v => (
          <div key={v.verification_id} className="bg-white border border-[#E8E4D9] p-6 mb-4" data-testid={`verification-${v.verification_id}`}>
            <div className="flex justify-between items-start mb-4">
              <div>
                {(v.customer?.name || v.customer?.project_name) && (
                  <p className="text-xs uppercase tracking-widest text-[#B68D40] font-bold mb-1">
                    {v.customer?.name}{v.customer?.project_name ? ` — ${v.customer.project_name}` : ""}
                  </p>
                )}
                <h4 className="font-bold text-[#06402B] capitalize">{v.bhk_or_units} {v.property_type}</h4>
                <p className="text-sm text-gray-500">Invoice Paid: ₹{Number(v.invoice_paid).toLocaleString('en-IN')}</p>
                <p className="text-sm text-gray-500 mt-2"><strong>Client Notes:</strong> {v.room_requirements}</p>
              </div>
              <div className="flex flex-col items-end gap-2">
                {((v.pdf_urls && v.pdf_urls.length > 0) ? v.pdf_urls : (v.pdf_url ? [v.pdf_url] : [])).map((u, idx) => (
                  <a key={idx} href={u} target="_blank" rel="noopener noreferrer" download
                     data-testid={`download-plan-${v.verification_id}-${idx}`}
                     className="text-[#B68D40] underline text-sm border p-2">
                    Floor Plan {idx + 1}
                  </a>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-3 border-t pt-4">
              <button onClick={() => handleApprove(v.verification_id)}
                      data-testid={`approve-${v.verification_id}`}
                      className="bg-[#06402B] text-white px-6 py-2 text-xs uppercase tracking-widest font-bold hover:bg-[#0a5839]">
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
          <h4 className="font-display text-sm uppercase tracking-widest text-[#06402B] mb-3">Recently resolved</h4>
          <div className="space-y-2">
            {recentlyResolved.map(v => (
              <div key={v.verification_id} className="bg-[#F3F0E9] border border-[#E8E4D9] p-3 text-xs flex justify-between items-center">
                <span className="capitalize">
                  {v.bhk_or_units} {v.property_type}
                  {v.corrected_property_type && (
                    <> → <strong>{v.corrected_bhk_or_units} {v.corrected_property_type}</strong></>
                  )}
                </span>
                <span className="text-[#4A5D54]">
                  {v.status === "approved" && "Approved — Scheduling"}
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

  // --- NEW: Delete Handler ---
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

  // --- NEW: Save Edit Handler ---
  const handleSaveEdit = async (email) => {
    try {
      await api.put(`/admin/employees/${email}`, { role: editRole });
      toast.success("Role updated successfully.");
      setEditingEmail(null); // Close the edit box
      loadEmployees();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to update role.");
    }
  };

  return (
    <div className="animate-in fade-in space-y-8">
      {/* ADD EMPLOYEE FORM */}
      <div className="bg-white p-6 border border-[#E8E4D9]">
        <h3 className="font-display text-lg mb-4 text-[#06402B]">Add Department Member</h3>
        <form onSubmit={handleAddMember} className="flex flex-col gap-4 max-w-md mt-4">
          <div className="grid grid-cols-2 gap-4">
            <input 
              type="email" 
              placeholder="Department Member Email *"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="border border-[#E8E4D9] p-2 rounded focus:outline-none focus:border-[#0B4A3F]"
            />
            <input 
              type="text" 
              placeholder="Phone Number"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              className="border border-[#E8E4D9] p-2 rounded focus:outline-none focus:border-[#0B4A3F]"
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <input 
              type="text" 
              placeholder="Temporary Password *"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="border border-[#E8E4D9] p-2 rounded focus:outline-none focus:border-[#0B4A3F]"
            />
            <select 
              value={newRole} 
              onChange={(e) => setNewRole(e.target.value)}
              className="border border-[#E8E4D9] p-2 rounded focus:outline-none focus:border-[#0B4A3F]"
            >
              <option value="sales">Sales Department</option>
              <option value="designer">Design Department</option>
              <option value="admin">Administrator</option>
            </select>
          </div>
          
          <button type="submit" className="bg-[#0B4A3F] text-white px-4 py-2 rounded hover:bg-[#08362e] transition-colors w-full">
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
                      className="border border-[#0B4A3F] p-1 rounded"
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
                      <button onClick={() => handleSaveEdit(e.email)} className="text-[#0B4A3F] font-bold hover:underline">Save</button>
                      <button onClick={() => setEditingEmail(null)} className="text-gray-500 hover:underline">Cancel</button>
                    </>
                  ) : (
                    <>
                      <button 
                        onClick={() => { setEditingEmail(e.email); setEditRole(e.role); }} 
                        className="text-[#B68D40] hover:underline"
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

// ==========================================
// TAB 5 & 6: PLACEHOLDERS
// ==========================================
function TabIntentTracking() {
  return <div className="p-8 text-center text-gray-400 border bg-white">Tracking pipeline initialized. Waiting for cart abandonment data.</div>;
}
function TabMasterPipeline() {
  return <div className="p-8 text-center text-gray-400 border bg-white">Global phase overrides locked.</div>;
}
