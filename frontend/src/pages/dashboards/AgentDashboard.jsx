import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { Navigate } from "react-router-dom";
import api from "@/lib/api";
import DashShell from "@/components/layout/DashShell";
import { formatINR, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Edit, Trash2, Plus, MessageSquare } from "lucide-react";
import InquiryDialog from "@/components/InquiryDialog";

const LINKS = [
  { to: "/dashboard/agent", label: "Listings" },
  { to: "/dashboard/agent/leads", label: "Leads" },
  { to: "/dashboard/agent/subscription", label: "Subscription" },
];

const STATUSES = ["new", "contacted", "no-response", "follow-up", "converted", "closed", "not-interested"];

export default function AgentDashboard({ tab = "listings" }) {
  const { user } = useAuth();
  if (user === undefined) return null;
  if (user === null) return <Navigate to="/login" />;
  if (!["agent", "admin"].includes(user.role)) return <Navigate to="/" />;

  return (
    <DashShell links={LINKS} title={tab === "leads" ? "Lead Pipeline" : tab === "subscription" ? "Subscription" : "My Listings"}>
      {tab === "listings" && <Listings />}
      {tab === "leads" && <Leads />}
      {tab === "subscription" && <Subscription />}
    </DashShell>
  );
}

function Listings() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const { user } = useAuth();

  const reload = () => api.get("/listings", { params: { status: "", agent_id: user.user_id } }).then(({ data }) => setItems(data || []));
  useEffect(() => { reload(); }, []); // eslint-disable-line

  const remove = async (id) => {
    if (!window.confirm("Delete this listing?")) return;
    try {
      await api.delete(`/listings/${id}`);
      toast.success("Deleted");
      reload();
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  return (
    <>
      <div className="flex justify-between items-center mb-6">
        <p className="text-sm text-[#333333]">{items.length} listings</p>
        <button onClick={() => { setEditing(null); setOpen(true); }} className="btn-primary" data-testid="add-listing-btn">
          <Plus size={14} /> Add Listing
        </button>
      </div>

      <div className="bg-white border border-[#EDE5DB] overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#F5EDE8]">
            <tr>
              {["Title", "Locality", "Type", "Price", "Status", "Views", ""].map((h) => (
                <th key={h} className="text-left p-4 label-eyebrow">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.listing_id} className="border-t border-[#EDE5DB]">
                <td className="p-4">{it.title}</td>
                <td className="p-4">{it.locality}</td>
                <td className="p-4 uppercase text-xs">{it.kind}</td>
                <td className="p-4 font-semibold text-[#0C1D42]">{formatINR(it.price)}</td>
                <td className="p-4">
                  <StatusPill status={it.status} />
                </td>
                <td className="p-4">{it.views}</td>
                <td className="p-4 flex gap-2">
                  <button onClick={() => { setEditing(it); setOpen(true); }} className="p-1 hover:text-[#0C1D42]"><Edit size={15} /></button>
                  <button onClick={() => remove(it.listing_id)} className="p-1 hover:text-[#9B4A3A]"><Trash2 size={15} /></button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={7} className="p-12 text-center text-[#666666]">No listings yet — add your first one.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <ListingDialog open={open} setOpen={setOpen} editing={editing} onSaved={reload} />
    </>
  );
}

function ListingDialog({ open, setOpen, editing, onSaved }) {
  const empty = {
    title: "", description: "", kind: "sale", city: "Bangalore", locality: "", address: "",
    price: 0, area_sqft: 0, area_type: "super_builtup", bedrooms: 2, bathrooms: 2,
    property_type: "Apartment", possession_status: "Ready to Move",
    photos: ["https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200"], lat: 12.9716, lng: 77.5946,
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
      if (editing) await api.put(`/listings/${editing.listing_id}`, form);
      else await api.post("/listings", form);
      toast.success(editing ? "Listing updated" : "Listing created — pending admin review");
      setOpen(false);
      onSaved();
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-3xl bg-[#FCFAF5]">
        <DialogHeader>
          <DialogTitle className="font-display text-3xl">{editing ? "Edit Listing" : "New Listing"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[60vh] overflow-auto pr-2">
          <Field label="Title"><input className="hs-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} data-testid="lst-title" /></Field>
          <Field label="Kind">
            <select className="hs-input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              <option value="sale">For Sale</option><option value="rent">For Rent</option>
            </select>
          </Field>
          <Field label="Locality">
            <select className="hs-input" value={form.locality} onChange={(e) => setForm({ ...form, locality: e.target.value })}>
              <option value="">Select</option>
              {localities.map((l) => <option key={l.locality_id}>{l.name}</option>)}
            </select>
          </Field>
          <Field label="Property Type"><input className="hs-input" value={form.property_type} onChange={(e) => setForm({ ...form, property_type: e.target.value })} /></Field>
          <Field label="Price (₹)"><input type="number" className="hs-input" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} data-testid="lst-price" /></Field>
          <Field label="Area (sqft)"><input type="number" className="hs-input" value={form.area_sqft} onChange={(e) => setForm({ ...form, area_sqft: Number(e.target.value) })} /></Field>
          <Field label="Area Type">
            <select className="hs-input" value={form.area_type} onChange={(e) => setForm({ ...form, area_type: e.target.value })}>
              <option value="carpet">Carpet</option><option value="builtup">Built-up</option><option value="super_builtup">Super Built-up</option>
            </select>
          </Field>
          <Field label="Possession"><input className="hs-input" value={form.possession_status} onChange={(e) => setForm({ ...form, possession_status: e.target.value })} /></Field>
          <Field label="Bedrooms"><input type="number" className="hs-input" value={form.bedrooms} onChange={(e) => setForm({ ...form, bedrooms: Number(e.target.value) })} /></Field>
          <Field label="Bathrooms"><input type="number" className="hs-input" value={form.bathrooms} onChange={(e) => setForm({ ...form, bathrooms: Number(e.target.value) })} /></Field>
          <Field label="Address" full><input className="hs-input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
          <Field label="Photo URLs (comma separated)" full>
            <input className="hs-input" value={(form.photos || []).join(",")} onChange={(e) => setForm({ ...form, photos: e.target.value.split(",").map(x => x.trim()).filter(Boolean) })} />
          </Field>
          <Field label="Description" full>
            <textarea className="hs-input min-h-[80px]" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
        </div>
        <div className="flex gap-3 justify-end pt-4 border-t border-[#EDE5DB]">
          <button onClick={() => setOpen(false)} className="btn-secondary">Cancel</button>
          <button onClick={save} className="btn-primary" data-testid="lst-save">Save</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, full = false, children }) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <label className="label-eyebrow mb-1 block">{label}</label>
      {children}
    </div>
  );
}

function StatusPill({ status }) {
  const map = {
    draft: "bg-[#EDE5DB] text-[#0C1D42]",
    pending: "bg-[#FEF08A] text-[#7C5800]",
    approved: "bg-[#BBF7D0] text-[#0C1D42]",
    rejected: "bg-[#FECACA] text-[#9B4A3A]",
  };
  const label = status === "approved" ? "live" : status;
  return <span className={`px-2 py-1 text-[10px] tracking-widest uppercase font-semibold ${map[status] || "bg-[#EDE5DB]"}`}>{label || "—"}</span>;
}

function Leads() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(null);

  const reload = useCallback(
    () => api.get("/inquiries").then(({ data }) => setItems(data || [])),
    []
  );
  useEffect(() => {
    reload();
  }, [reload]);

  const setStatus = async (id, status) => {
    try {
      await api.put(`/inquiries/${id}`, { status });
      reload();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <>
    <div className="overflow-x-auto pb-4">
      <div className="flex gap-4 min-w-max">
        {STATUSES.map((s) => (
          <div key={s} className="kanban-col w-72">
            <div className="flex items-center justify-between mb-4">
              <div className="font-display text-lg capitalize">{s.replace("-", " ")}</div>
              <span className="label-eyebrow text-[#333333]">
                {items.filter((i) => i.status === s).length}
              </span>
            </div>
            <div className="space-y-3">
              {items.filter((i) => i.status === s).map((i) => (
                <div key={i.inquiry_id} className="bg-[#FCFAF5] border border-[#EDE5DB] p-3" data-testid={`lead-${i.inquiry_id}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm truncate">{i.name}</div>
                      <div className="text-xs text-[#333333] mt-1">{i.mobile}</div>
                    </div>
                    <button
                      onClick={() => setOpen(i)}
                      className="text-[#0C1D42] hover:text-[#DA9E3E] shrink-0"
                      data-testid={`open-lead-${i.inquiry_id}`}
                      aria-label="open"
                    >
                      <MessageSquare size={15} />
                    </button>
                  </div>
                  <div className="text-xs text-[#666666] mt-1 line-clamp-2">{i.target_title}</div>
                  {(i.messages?.length > 0 || i.notes?.length > 0) && (
                    <div className="flex gap-3 mt-2 text-[10px] text-[#DA9E3E] tracking-widest uppercase">
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
    <div className="bg-white border border-[#EDE5DB] p-10 max-w-2xl">
      <div className="label-eyebrow mb-3">Listing Packages</div>
      <h2 className="font-display text-3xl mb-4">Get in touch with your Relationship Manager</h2>
      <p className="text-[#333333] mb-6">
        We've reserved a dedicated RM for every Homesqre agent. Tap below and we'll connect within a business day.
      </p>
      <a href="mailto:rm@homesqre.com" className="btn-gold inline-flex">Contact my RM</a>
    </div>
  );
}
