import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Navigate } from "react-router-dom";
import api, { formatINR, formatApiError } from "@/lib/api";
import DashShell from "@/components/layout/DashShell";
import { toast } from "sonner";
import { Plus, Edit, Trash2, MessageSquare } from "lucide-react";
import InquiryDialog from "@/components/InquiryDialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

const LINKS = [
  { to: "/dashboard/builder", label: "Projects" },
  { to: "/dashboard/builder/inquiries", label: "Inquiries" },
  { to: "/dashboard/builder/subscription", label: "Subscription" },
];

const STATUSES = ["new", "contacted", "no-response", "follow-up", "converted", "closed", "not-interested"];

export default function BuilderDashboard({ tab = "projects" }) {
  const { user } = useAuth();
  if (user === undefined) return null;
  if (user === null) return <Navigate to="/login" />;
  if (!["builder", "admin"].includes(user.role)) return <Navigate to="/" />;

  return (
    <DashShell
      links={LINKS}
      title={tab === "inquiries" ? "Project Inquiries" : tab === "subscription" ? "Subscription" : "My Projects"}
    >
      {tab === "projects" && <Projects />}
      {tab === "inquiries" && <Inquiries />}
      {tab === "subscription" && <Subscription />}
    </DashShell>
  );
}

function Projects() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [settingsFor, setSettingsFor] = useState(null);
  const { user } = useAuth();

  const reload = () =>
    api.get("/projects", { params: { status: "", builder_id: user.user_id } }).then(({ data }) => setItems(data || []));
  useEffect(() => { reload(); }, []); // eslint-disable-line

  const remove = async (id) => {
    if (!window.confirm("Delete this project?")) return;
    try {
      await api.delete(`/projects/${id}`);
      toast.success("Deleted");
      reload();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <>
      <div className="flex justify-between items-center mb-6">
        <p className="text-sm text-[#4A5D54]">{items.length} projects</p>
        <button onClick={() => { setEditing(null); setOpen(true); }} className="btn-primary" data-testid="add-project-btn">
          <Plus size={14} /> Add Project
        </button>
      </div>

      <div className="bg-white border border-[#E8E4D9] overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#F3F0E9]">
            <tr>
              {["Project", "Locality", "Units", "Price", "Status", ""].map((h) => (
                <th key={h} className="text-left p-4 label-eyebrow">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.project_id} className="border-t border-[#E8E4D9]">
                <td className="p-4">
                  <div className="font-semibold">{p.name}</div>
                  <div className="text-xs text-[#758A80]">{p.builder_name}</div>
                </td>
                <td className="p-4">{p.locality}</td>
                <td className="p-4 text-xs">{p.unit_types}</td>
                <td className="p-4 text-[#06402B] font-semibold">{formatINR(p.price_min)}</td>
                <td className="p-4">
                  <span className={`px-2 py-1 text-[10px] tracking-widest uppercase font-semibold ${
                    p.status === "live" ? "bg-[#BBF7D0] text-[#06402B]" :
                    p.status === "pending" ? "bg-[#FEF08A]" : "bg-[#E8E4D9]"
                  }`}>{p.status}</span>
                </td>
                <td className="p-4 flex gap-2">
                  <button onClick={() => setSettingsFor(p)} className="text-xs underline text-[#06402B]">Settings</button>
                  <button onClick={() => { setEditing(p); setOpen(true); }} className="p-1 hover:text-[#06402B]"><Edit size={15} /></button>
                  <button onClick={() => remove(p.project_id)} className="p-1 hover:text-[#9B4A3A]"><Trash2 size={15} /></button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={6} className="p-12 text-center text-[#758A80]">No projects yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <ProjectDialog open={open} setOpen={setOpen} editing={editing} onSaved={reload} />
      <ProjectSettings project={settingsFor} setProject={setSettingsFor} onSaved={reload} />
    </>
  );
}

function ProjectDialog({ open, setOpen, editing, onSaved }) {
  const empty = {
    name: "", builder_name: "", city: "Bangalore", locality: "",
    price_min: 0, price_max: 0, sqft_min: 0, sqft_max: 0, unit_types: "2BHK & 3BHK",
    approvals: ["BBMP"], rera_number: "", rera_state: "Karnataka",
    rera_date: "", rera_expiry: "", description: "", tagline: "",
    banner_image: "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=1600",
    brochure_url: "",
  };
  const [form, setForm] = useState(empty);
  const [localities, setLocalities] = useState([]);

  useEffect(() => {
    if (editing) setForm({ ...empty, ...editing });
    else setForm(empty);
    api.get("/localities", { params: { city: "Bangalore" } }).then(({ data }) => setLocalities(data || []));
  }, [editing]); // eslint-disable-line

  const save = async () => {
    try {
      const payload = { ...form, approvals: typeof form.approvals === "string" ? form.approvals.split(",").map(x => x.trim()) : form.approvals };
      if (editing) await api.put(`/projects/${editing.project_id}`, payload);
      else await api.post("/projects", payload);
      toast.success(editing ? "Updated" : "Project created — pending admin review");
      setOpen(false);
      onSaved();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-3xl bg-[#FAF9F6]">
        <DialogHeader>
          <DialogTitle className="font-display text-3xl">{editing ? "Edit Project" : "New Project"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[60vh] overflow-auto pr-2">
          <F label="Project Name"><input className="hs-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="prj-name" /></F>
          <F label="Builder Name"><input className="hs-input" value={form.builder_name} onChange={(e) => setForm({ ...form, builder_name: e.target.value })} /></F>
          <F label="Tagline"><input className="hs-input" value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} /></F>
          <F label="Locality">
            <select className="hs-input" value={form.locality} onChange={(e) => setForm({ ...form, locality: e.target.value })}>
              <option value="">Select</option>
              {localities.map((l) => <option key={l.locality_id}>{l.name}</option>)}
            </select>
          </F>
          <F label="Unit Types"><input className="hs-input" value={form.unit_types} onChange={(e) => setForm({ ...form, unit_types: e.target.value })} /></F>
          <F label="Approvals (comma)"><input className="hs-input" value={Array.isArray(form.approvals) ? form.approvals.join(",") : form.approvals} onChange={(e) => setForm({ ...form, approvals: e.target.value })} /></F>
          <F label="Price Min (₹)"><input type="number" className="hs-input" value={form.price_min} onChange={(e) => setForm({ ...form, price_min: Number(e.target.value) })} /></F>
          <F label="Price Max (₹)"><input type="number" className="hs-input" value={form.price_max} onChange={(e) => setForm({ ...form, price_max: Number(e.target.value) })} /></F>
          <F label="Sqft Min"><input type="number" className="hs-input" value={form.sqft_min} onChange={(e) => setForm({ ...form, sqft_min: Number(e.target.value) })} /></F>
          <F label="Sqft Max"><input type="number" className="hs-input" value={form.sqft_max} onChange={(e) => setForm({ ...form, sqft_max: Number(e.target.value) })} /></F>
          <F label="RERA Number" full><input className="hs-input" value={form.rera_number} onChange={(e) => setForm({ ...form, rera_number: e.target.value })} /></F>
          <F label="Banner Image URL" full><input className="hs-input" value={form.banner_image} onChange={(e) => setForm({ ...form, banner_image: e.target.value })} /></F>
          <F label="Brochure URL (optional)" full><input className="hs-input" value={form.brochure_url} onChange={(e) => setForm({ ...form, brochure_url: e.target.value })} /></F>
          <F label="Description" full><textarea className="hs-input min-h-[80px]" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></F>
        </div>
        <div className="flex gap-3 justify-end pt-4 border-t border-[#E8E4D9]">
          <button onClick={() => setOpen(false)} className="btn-secondary">Cancel</button>
          <button onClick={save} className="btn-primary" data-testid="prj-save">Save</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ProjectSettings({ project, setProject, onSaved }) {
  const [amenities, setAmenities] = useState([]);
  const [banks, setBanks] = useState([]);
  const [selAmen, setSelAmen] = useState([]);
  const [selBanks, setSelBanks] = useState([]);

  useEffect(() => {
    if (!project) return;
    api.get("/amenities").then(({ data }) => setAmenities(data || []));
    api.get("/banks").then(({ data }) => setBanks(data || []));
    setSelAmen(project.amenity_ids || []);
    setSelBanks(project.bank_ids || []);
  }, [project]);

  if (!project) return null;

  const toggleAmen = (id) =>
    setSelAmen((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const toggleBank = (id) =>
    setSelBanks((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const byCat = amenities.reduce((acc, a) => {
    (acc[a.category] = acc[a.category] || []).push(a);
    return acc;
  }, {});

  const save = async () => {
    try {
      await api.put(`/projects/${project.project_id}`, { amenity_ids: selAmen, bank_ids: selBanks });
      toast.success("Settings saved");
      setProject(null);
      onSaved();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <Dialog open={!!project} onOpenChange={(o) => !o && setProject(null)}>
      <DialogContent className="max-w-3xl bg-[#FAF9F6]">
        <DialogHeader>
          <DialogTitle className="font-display text-3xl">Settings — {project.name}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-auto pr-2">
          <div className="label-eyebrow mb-3">Approved Banks</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-8">
            {banks.map((b) => (
              <label key={b.bank_id} className="flex items-center gap-2 text-sm border border-[#E8E4D9] bg-white px-3 py-2">
                <input type="checkbox" checked={selBanks.includes(b.bank_id)} onChange={() => toggleBank(b.bank_id)} />
                {b.name}
              </label>
            ))}
          </div>
          <div className="label-eyebrow mb-3">Amenities</div>
          {Object.entries(byCat).map(([cat, list]) => (
            <div key={cat} className="mb-6">
              <div className="font-display text-lg mb-2 text-[#06402B]">{cat}</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {list.map((a) => (
                  <label key={a.amenity_id} className="flex items-center gap-2 text-sm border border-[#E8E4D9] bg-white px-3 py-2">
                    <input type="checkbox" checked={selAmen.includes(a.amenity_id)} onChange={() => toggleAmen(a.amenity_id)} />
                    {a.name}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-3 pt-4 border-t border-[#E8E4D9]">
          <button onClick={() => setProject(null)} className="btn-secondary">Cancel</button>
          <button onClick={save} className="btn-primary">Save Settings</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function F({ label, full = false, children }) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <label className="label-eyebrow mb-1 block">{label}</label>
      {children}
    </div>
  );
}

function Inquiries() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(null);
  const reload = () => api.get("/inquiries").then(({ data }) => setItems(data || []));
  useEffect(() => { reload(); }, []);

  const setStatus = async (id, status) => {
    try { await api.put(`/inquiries/${id}`, { status }); reload(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <>
    <div className="overflow-x-auto pb-4">
      <div className="flex gap-4 min-w-max">
        {STATUSES.map((s) => (
          <div key={s} className="kanban-col w-72">
            <div className="flex items-center justify-between mb-4">
              <div className="font-display text-lg capitalize">{s.replace("-", " ")}</div>
              <span className="label-eyebrow text-[#4A5D54]">
                {items.filter((i) => i.status === s).length}
              </span>
            </div>
            <div className="space-y-3">
              {items.filter((i) => i.status === s).map((i) => (
                <div key={i.inquiry_id} className="bg-[#FAF9F6] border border-[#E8E4D9] p-3" data-testid={`inq-${i.inquiry_id}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm truncate">{i.name}</div>
                      <div className="text-xs text-[#4A5D54] mt-1">{i.mobile}</div>
                    </div>
                    <button onClick={() => setOpen(i)} className="text-[#06402B] hover:text-[#B68D40]" data-testid={`open-inq-${i.inquiry_id}`}>
                      <MessageSquare size={15} />
                    </button>
                  </div>
                  <div className="text-xs text-[#758A80] mt-1 line-clamp-2">{i.target_title}</div>
                  {(i.messages?.length > 0 || i.notes?.length > 0) && (
                    <div className="flex gap-3 mt-2 text-[10px] text-[#B68D40] tracking-widest uppercase">
                      {i.messages?.length > 0 && <span>{i.messages.length} msg</span>}
                      {i.notes?.length > 0 && <span>{i.notes.length} note</span>}
                    </div>
                  )}
                  <select
                    className="hs-input mt-2 text-xs py-1"
                    value={i.status}
                    onChange={(e) => setStatus(i.inquiry_id, e.target.value)}
                  >
                    {STATUSES.map((s2) => <option key={s2}>{s2}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
    <InquiryDialog inquiry={open} open={!!open} onOpenChange={(o) => !o && setOpen(null)} onChanged={reload} />
    </>
  );
}

function Subscription() {
  return (
    <div className="bg-white border border-[#E8E4D9] p-10 max-w-2xl">
      <div className="label-eyebrow mb-3">Builder Packages</div>
      <h2 className="font-display text-3xl mb-4">Contact your Relationship Manager</h2>
      <p className="text-[#4A5D54] mb-6">Premium project promotion, featured placement and concierge support.</p>
      <a href="mailto:builders@homesqre.com" className="btn-gold inline-flex">Contact RM</a>
    </div>
  );
}
