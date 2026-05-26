import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { Navigate, useLocation } from "react-router-dom";
import DashShell from "@/components/layout/DashShell";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import MasterLeadPipeline from "@/components/admin/MasterLeadPipeline";
import CrmSettings from "@/components/admin/CrmSettings";

// Custom Tabs based on Homesqre Architecture
const LINKS = [
  { to: "#overview", label: "Overview & Planner" },
  { to: "#pipeline", label: "Master Lead Pipeline" },
  { to: "#measurements", label: "Verification & Site Visits" },
  { to: "#users", label: "Team Management" },
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
      {activeTab === "users" && <TabUsers />}
      {activeTab === "crm-settings" && <CrmSettings />}
      
    </DashShell>
  );
}

// ==========================================
// TAB 1: OVERVIEW & PLANNER
// ==========================================
export function TabOverview() {
  return (
    <div className="animate-in fade-in space-y-8">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-[#E8E4D9] p-6 text-center">
          <p className="text-xs uppercase tracking-widest text-[#4A5D54] mb-2">Total Retainers</p>
          <p className="font-display text-4xl text-[#06402B]">₹0</p>
        </div>
        <div className="bg-white border border-[#E8E4D9] p-6 text-center">
          <p className="text-xs uppercase tracking-widest text-[#4A5D54] mb-2">Pending Verifications</p>
          <p className="font-display text-4xl text-[#B68D40]">0</p>
        </div>
        <div className="bg-white border border-[#E8E4D9] p-6 text-center">
          <p className="text-xs uppercase tracking-widest text-[#4A5D54] mb-2">Active Site Visits</p>
          <p className="font-display text-4xl text-[#06402B]">0</p>
        </div>
        <div className="bg-white border border-[#E8E4D9] p-6 text-center">
          <p className="text-xs uppercase tracking-widest text-[#4A5D54] mb-2">In 3D Design</p>
          <p className="font-display text-4xl text-[#06402B]">0</p>
        </div>
      </div>
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

  const loadVerifications = useCallback(async () => {
    try {
      const { data } = await api.get("/admin/verifications");
      setVerifications(data || []);
    } catch (err) {
      toast.error("Failed to load verifications.");
    }
  }, []);

  useEffect(() => { loadVerifications(); }, [loadVerifications]);

  const handleModeration = async (verId, action) => {
    try {
      await api.put(`/admin/verifications/${verId}`, { action });
      toast.success(`Verification ${action}d successfully.`);
      loadVerifications();
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  return (
    <div className="animate-in fade-in">
      <h3 className="font-display text-xl text-[#06402B] mb-4">Floor Plan Verification Queue</h3>
      
      {verifications.filter(v => v.status === "pending").length === 0 ? (
        <p className="text-gray-500 bg-white border border-[#E8E4D9] p-6 mb-8 text-center">No pending floor plans to verify.</p>
      ) : (
        verifications.filter(v => v.status === "pending").map(v => (
          <div key={v.verification_id} className="bg-white border border-[#E8E4D9] p-6 mb-4">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h4 className="font-bold text-[#06402B] capitalize">{v.bhk_or_units} {v.property_type}</h4>
                <p className="text-sm text-gray-500">Invoice Paid: ₹{v.invoice_paid.toLocaleString('en-IN')}</p>
                <p className="text-sm text-gray-500 mt-2"><strong>Client Notes:</strong> {v.room_requirements}</p>
              </div>
              <button className="text-[#B68D40] underline text-sm border p-2">View Uploaded PDF</button>
            </div>
            <div className="flex gap-4 border-t pt-4">
              <button onClick={() => handleModeration(v.verification_id, 'approve')} className="bg-[#06402B] text-white px-6 py-2 text-xs uppercase tracking-widest font-bold">Approve (Push to Scheduling)</button>
              <button onClick={() => handleModeration(v.verification_id, 'reject')} className="border border-red-600 text-red-600 px-6 py-2 text-xs uppercase tracking-widest font-bold hover:bg-red-50">Reject (Mismatch)</button>
            </div>
          </div>
        ))
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
      toast.success("Team member deleted.");
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
        <h3 className="font-display text-lg mb-4 text-[#06402B]">Add New Team Member</h3>
        <form onSubmit={handleAddMember} className="flex flex-col gap-4 max-w-md mt-4">
          <div className="grid grid-cols-2 gap-4">
            <input 
              type="email" 
              placeholder="Employee Email Address *"
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
              <option value="sales">Sales Representative</option>
              <option value="designer">Interior Designer</option>
              <option value="admin">Administrator</option>
            </select>
          </div>
          
          <button type="submit" className="bg-[#0B4A3F] text-white px-4 py-2 rounded hover:bg-[#08362e] transition-colors w-full">
            Create Team Member Account
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
                      <option value="sales">Sales</option>
                      <option value="designer">Designer</option>
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
