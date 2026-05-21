import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { Navigate } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import DashShell from "@/components/layout/DashShell";
import { toast } from "sonner";
import HomepageEditor from "@/components/admin/HomepageEditor";
import InteriorsEditor from "@/components/admin/InteriorsEditor";
import ModerationQueue from "@/components/admin/ModerationQueue";
import { AdminListingDialog, AdminProjectDialog } from "@/components/admin/AdminListingProjectDialogs";
import { Plus, Edit } from "lucide-react";

const LINKS = [
  { to: "/dashboard/admin", label: "Overview" },
  { to: "/dashboard/admin/moderation", label: "Moderation Queue" },
  { to: "/dashboard/admin/users", label: "Users" },
  { to: "/dashboard/admin/listings", label: "Listings" },
  { to: "/dashboard/admin/projects", label: "Projects" },
  { to: "/dashboard/admin/inquiries", label: "Property Inquiries" },
  { to: "/dashboard/admin/interior-leads", label: "Interior Leads" },
  { to: "/dashboard/admin/loan-leads", label: "Loan Leads" },
  { to: "/dashboard/admin/banks", label: "Banks" },
  { to: "/dashboard/admin/amenities", label: "Amenities" },
  { to: "/dashboard/admin/cms/homepage", label: "CMS · Homepage" },
  { to: "/dashboard/admin/cms/interiors", label: "CMS · Interiors" },
];

export default function AdminDashboard({ tab = "overview" }) {
  const { user } = useAuth();
  if (user === undefined) return null;
  if (user === null) return <Navigate to="/login" />;
  if (user.role !== "admin") return <Navigate to="/" />;

  const titleMap = {
    overview: "Platform Overview",
    moderation: "Moderation Queue",
    users: "Users",
    listings: "All Listings",
    projects: "All Projects",
    inquiries: "Property Inquiries",
    "interior-leads": "Interior Leads",
    "loan-leads": "Loan Leads",
    banks: "Banks Management",
    amenities: "Amenities Management",
    "cms-homepage": "Homepage Content",
    "cms-interiors": "Interiors Page Content",
  };

  return (
    <DashShell links={LINKS} title={titleMap[tab]}>
      {tab === "overview" && <Overview />}
      {tab === "moderation" && <ModerationQueue />}
      {tab === "users" && <Users />}
      {tab === "listings" && <ListingsAdmin />}
      {tab === "projects" && <ProjectsAdmin />}
      {tab === "inquiries" && <AllInquiries />}
      {tab === "interior-leads" && <InteriorLeads />}
      {tab === "loan-leads" && <LoanLeads />}
      {tab === "banks" && <BanksMgmt />}
      {tab === "amenities" && <AmenitiesMgmt />}
      {tab === "cms-homepage" && <HomepageEditor />}
      {tab === "cms-interiors" && <InteriorsEditor />}
    </DashShell>
  );
}

function Overview() {
  const [a, setA] = useState(null);
  useEffect(() => { api.get("/admin/analytics").then(({ data }) => setA(data)); }, []);
  if (!a) return <div>Loading…</div>;

  const blocks = [
    ["Total Users", a.total_users],
    ["Listings (Approved)", `${a.live_listings} / ${a.total_listings}`],
    ["Pending Review", (a.pending_listings || 0) + (a.pending_projects || 0) + (a.pending_localities || 0)],
    ["Projects", a.total_projects],
    ["Inquiries", a.total_inquiries],
    ["New Inquiries", a.new_inquiries],
    ["Interior Leads", a.interior_leads],
    ["Loan Leads", a.loan_leads],
    ["Agents", a.by_role.agent],
    ["Builders", a.by_role.builder],
    ["Customers", a.by_role.customer],
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      {blocks.map(([label, v]) => (
        <div key={label} className="bg-white border border-[#E8E4D9] p-6">
          <div className="label-eyebrow mb-3">{label}</div>
          <div className="font-display text-4xl text-[#06402B]">{v}</div>
        </div>
      ))}
    </div>
  );
}

function Users() {
  const [items, setItems] = useState([]);
  const reload = useCallback(() => api.get("/admin/users").then(({ data }) => setItems(data || [])), []);
  useEffect(() => { reload(); }, [reload]);

  const updateRole = async (uid, role) => {
    try { await api.put(`/admin/users/${uid}`, { role }); reload(); toast.success("Role updated"); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  const toggleSuspend = async (u) => {
    try { await api.put(`/admin/users/${u.user_id}`, { is_suspended: !u.is_suspended }); reload(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <div className="bg-white border border-[#E8E4D9] overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-[#F3F0E9]">
          <tr>{["Name", "Email", "Role", "Verified", "Status", ""].map(h => <th key={h} className="text-left p-4 label-eyebrow">{h}</th>)}</tr>
        </thead>
        <tbody>
          {items.map(u => (
            <tr key={u.user_id} className="border-t border-[#E8E4D9]" data-testid={`user-row-${u.user_id}`}>
              <td className="p-4">{u.name}</td>
              <td className="p-4">{u.email}</td>
              <td className="p-4">
                <select value={u.role} onChange={e => updateRole(u.user_id, e.target.value)} className="hs-input text-xs py-1">
                  <option>customer</option><option>agent</option><option>builder</option><option>admin</option>
                </select>
              </td>
              <td className="p-4 text-xs">{u.is_verified ? "Yes" : "No"}</td>
              <td className="p-4 text-xs">{u.is_suspended ? "Suspended" : "Active"}</td>
              <td className="p-4">
                <button onClick={() => toggleSuspend(u)} className="text-xs underline text-[#9B4A3A]">
                  {u.is_suspended ? "Unsuspend" : "Suspend"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ListingsAdmin() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const reload = useCallback(() => api.get("/listings", { params: { status: "" } }).then(({ data }) => setItems(data || [])), []);
  useEffect(() => { reload(); }, [reload]);

  const setStatus = async (id, status, is_featured) => {
    try { await api.put(`/admin/listings/${id}/status`, { status, is_featured }); reload(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => { setEditing(null); setOpen(true); }}
          className="btn-primary inline-flex items-center gap-2"
          data-testid="admin-listing-create"
        >
          <Plus size={16} /> Create Listing
        </button>
      </div>
      <div className="bg-white border border-[#E8E4D9] overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#F3F0E9]"><tr>{["Title", "Locality", "Kind", "Status", "Featured", ""].map(h => <th key={h} className="text-left p-4 label-eyebrow">{h}</th>)}</tr></thead>
          <tbody>
            {items.map(l => (
              <tr key={l.listing_id} className="border-t border-[#E8E4D9]">
                <td className="p-4">{l.title}</td>
                <td className="p-4">{l.locality}</td>
                <td className="p-4">{l.kind}</td>
                <td className="p-4">
                  <select value={l.status} onChange={e => setStatus(l.listing_id, e.target.value, l.is_featured)} className="hs-input text-xs py-1">
                    <option value="draft">draft</option><option value="pending">pending</option><option value="approved">approved</option><option value="rejected">rejected</option>
                  </select>
                </td>
                <td className="p-4">
                  <input type="checkbox" checked={!!l.is_featured} onChange={e => setStatus(l.listing_id, l.status, e.target.checked)} />
                </td>
                <td className="p-4 flex items-center gap-3">
                  <button
                    onClick={() => { setEditing(l); setOpen(true); }}
                    className="inline-flex items-center gap-1 text-xs text-[#06402B] hover:text-[#053220]"
                    data-testid={`admin-listing-edit-${l.listing_id}`}
                  >
                    <Edit size={13} /> Edit
                  </button>
                  <a href={`/properties/${l.listing_id}`} className="text-xs underline">View</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <AdminListingDialog open={open} setOpen={setOpen} editing={editing} onSaved={reload} />
    </div>
  );
}

function ProjectsAdmin() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const reload = useCallback(() => api.get("/projects", { params: { status: "" } }).then(({ data }) => setItems(data || [])), []);
  useEffect(() => { reload(); }, [reload]);

  const setStatus = async (id, status, is_featured) => {
    try { await api.put(`/admin/projects/${id}/status`, { status, is_featured }); reload(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => { setEditing(null); setOpen(true); }}
          className="btn-primary inline-flex items-center gap-2"
          data-testid="admin-project-create"
        >
          <Plus size={16} /> Create Project
        </button>
      </div>
      <div className="bg-white border border-[#E8E4D9] overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#F3F0E9]"><tr>{["Project", "Locality", "Builder", "Status", "Featured", ""].map(h => <th key={h} className="text-left p-4 label-eyebrow">{h}</th>)}</tr></thead>
          <tbody>
            {items.map(p => (
              <tr key={p.project_id} className="border-t border-[#E8E4D9]">
                <td className="p-4">{p.name}</td>
                <td className="p-4">{p.locality}</td>
                <td className="p-4">{p.builder_name}</td>
                <td className="p-4">
                  <select value={p.status} onChange={e => setStatus(p.project_id, e.target.value, p.is_featured)} className="hs-input text-xs py-1">
                    <option value="draft">draft</option><option value="pending">pending</option><option value="approved">approved</option><option value="rejected">rejected</option>
                  </select>
                </td>
                <td className="p-4">
                  <input type="checkbox" checked={!!p.is_featured} onChange={e => setStatus(p.project_id, p.status, e.target.checked)} />
                </td>
                <td className="p-4 flex items-center gap-3">
                  <button
                    onClick={() => { setEditing(p); setOpen(true); }}
                    className="inline-flex items-center gap-1 text-xs text-[#06402B] hover:text-[#053220]"
                    data-testid={`admin-project-edit-${p.project_id}`}
                  >
                    <Edit size={13} /> Edit
                  </button>
                  <a href={`/projects/${p.city_slug}/${p.locality_slug}/${p.slug}`} className="text-xs underline">View</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <AdminProjectDialog open={open} setOpen={setOpen} editing={editing} onSaved={reload} />
    </div>
  );
}

function AllInquiries() {
  const [items, setItems] = useState([]);
  useEffect(() => { api.get("/inquiries", { params: { all_inquiries: true } }).then(({ data }) => setItems(data || [])); }, []);
  return (
    <div className="bg-white border border-[#E8E4D9] overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-[#F3F0E9]"><tr>{["Name", "Mobile", "For", "Status", "Date"].map(h => <th key={h} className="text-left p-4 label-eyebrow">{h}</th>)}</tr></thead>
        <tbody>
          {items.map(i => (
            <tr key={i.inquiry_id} className="border-t border-[#E8E4D9]">
              <td className="p-4">{i.name}</td><td className="p-4">{i.mobile}</td>
              <td className="p-4">{i.target_title}</td><td className="p-4 capitalize">{i.status}</td>
              <td className="p-4 text-xs">{new Date(i.created_at).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InteriorLeads() {
  const [items, setItems] = useState([]);
  const reload = useCallback(() => api.get("/interior-leads").then(({ data }) => setItems(data || [])), []);
  useEffect(() => { reload(); }, [reload]);

  const setStatus = async (id, status) => {
    try { await api.put(`/interior-leads/${id}`, { status }); reload(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <div className="bg-white border border-[#E8E4D9] overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-[#F3F0E9]"><tr>{["Name", "Phone", "Locality", "Flat", "Budget", "Status", "Date"].map(h => <th key={h} className="text-left p-4 label-eyebrow">{h}</th>)}</tr></thead>
        <tbody>
          {items.map(l => (
            <tr key={l.lead_id} className="border-t border-[#E8E4D9]" data-testid={`interior-lead-${l.lead_id}`}>
              <td className="p-4">{l.name}</td><td className="p-4">{l.phone}</td>
              <td className="p-4">{l.locality}</td><td className="p-4">{l.flat_size}</td>
              <td className="p-4">{l.budget}</td>
              <td className="p-4">
                <select className="hs-input text-xs py-1" value={l.status} onChange={e => setStatus(l.lead_id, e.target.value)}>
                  {["new","interested","follow-up","converted","not-interested","no-response"].map(s => <option key={s}>{s}</option>)}
                </select>
              </td>
              <td className="p-4 text-xs">{new Date(l.created_at).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LoanLeads() {
  const [items, setItems] = useState([]);
  useEffect(() => { api.get("/loan-leads").then(({ data }) => setItems(data || [])); }, []);
  return (
    <div className="bg-white border border-[#E8E4D9] overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-[#F3F0E9]"><tr>{["Name", "Phone", "Bank", "Loan", "Rate", "Tenure", "EMI", "Date"].map(h => <th key={h} className="text-left p-4 label-eyebrow">{h}</th>)}</tr></thead>
        <tbody>
          {items.map(l => (
            <tr key={l.lead_id} className="border-t border-[#E8E4D9]">
              <td className="p-4">{l.name || "—"}</td><td className="p-4">{l.phone || "—"}</td>
              <td className="p-4">{l.bank}</td><td className="p-4">₹{(l.loan_amount/100000).toFixed(1)}L</td>
              <td className="p-4">{l.interest_rate}%</td><td className="p-4">{l.tenure}y</td>
              <td className="p-4 font-semibold">₹{Math.round(l.emi).toLocaleString("en-IN")}</td>
              <td className="p-4 text-xs">{new Date(l.created_at).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BanksMgmt() {
  const [items, setItems] = useState([]);
  const reload = useCallback(() => api.get("/banks", { params: { active_only: false } }).then(({ data }) => setItems(data || [])), []);
  useEffect(() => { reload(); }, [reload]);

  const update = async (id, patch) => {
    try { await api.put(`/banks/${id}`, patch); reload(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <div className="bg-white border border-[#E8E4D9] overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-[#F3F0E9]"><tr>{["Name", "Rate Min", "Rate Max", "Active"].map(h => <th key={h} className="text-left p-4 label-eyebrow">{h}</th>)}</tr></thead>
        <tbody>
          {items.map(b => (
            <tr key={b.bank_id} className="border-t border-[#E8E4D9]">
              <td className="p-4 font-semibold">{b.name}</td>
              <td className="p-4">
                <input type="number" step="0.05" defaultValue={b.rate_min} onBlur={e => update(b.bank_id, { rate_min: parseFloat(e.target.value) })} className="hs-input w-24 text-xs" />
              </td>
              <td className="p-4">
                <input type="number" step="0.05" defaultValue={b.rate_max} onBlur={e => update(b.bank_id, { rate_max: parseFloat(e.target.value) })} className="hs-input w-24 text-xs" />
              </td>
              <td className="p-4">
                <input type="checkbox" checked={!!b.is_active} onChange={e => update(b.bank_id, { is_active: e.target.checked })} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AmenitiesMgmt() {
  const [items, setItems] = useState([]);
  const reload = useCallback(() => api.get("/amenities", { params: { active_only: false } }).then(({ data }) => setItems(data || [])), []);
  useEffect(() => { reload(); }, [reload]);

  const update = async (id, patch) => {
    try { await api.put(`/amenities/${id}`, patch); reload(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  const byCat = items.reduce((a, x) => { (a[x.category] = a[x.category] || []).push(x); return a; }, {});

  return (
    <div className="space-y-6">
      {Object.entries(byCat).map(([cat, list]) => (
        <div key={cat} className="bg-white border border-[#E8E4D9] p-6">
          <div className="font-display text-2xl text-[#06402B] mb-4">{cat}</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {list.map(a => (
              <label key={a.amenity_id} className="flex items-center gap-2 text-sm border border-[#E8E4D9] px-3 py-2">
                <input type="checkbox" checked={!!a.is_active} onChange={e => update(a.amenity_id, { is_active: e.target.checked })} />
                <span className="flex-1">{a.name}</span>
                {a.pending_approval && <span className="text-[10px] text-[#B68D40]">PENDING</span>}
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
