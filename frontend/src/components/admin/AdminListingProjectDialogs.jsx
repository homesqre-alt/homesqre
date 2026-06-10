import { useEffect, useMemo, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Search, X } from "lucide-react";

/** Searchable owner picker — fetches admin users list, filters by role(s). */
export function OwnerCombobox({ users, value, onChange, allowedRoles = ["agent", "builder", "admin"] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const eligible = useMemo(
    () => (users || []).filter((u) => allowedRoles.includes(u.role)),
    [users, allowedRoles]
  );
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return eligible.slice(0, 25);
    return eligible
      .filter(
        (u) =>
          (u.name || "").toLowerCase().includes(q) ||
          (u.email || "").toLowerCase().includes(q)
      )
      .slice(0, 25);
  }, [eligible, query]);

  const selected = useMemo(
    () => eligible.find((u) => u.user_id === value),
    [eligible, value]
  );

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="hs-input w-full text-left flex items-center justify-between"
        data-testid="owner-picker-trigger"
      >
        <span className={selected ? "text-[#0C1D42]" : "text-[#666666]"}>
          {selected ? (
            <>
              {selected.name || selected.email}
              <span className="text-xs text-[#666666] ml-2">
                ({selected.role})
              </span>
            </>
          ) : (
            "Default → current admin"
          )}
        </span>
        {selected && (
          <X
            size={14}
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
            }}
            className="hover:text-[#9B4A3A] shrink-0"
          />
        )}
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-[#EDE5DB] shadow-lg max-h-72 overflow-hidden flex flex-col">
          <div className="flex items-center gap-2 border-b border-[#EDE5DB] px-3 py-2">
            <Search size={14} className="text-[#666666]" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or email…"
              className="flex-1 bg-transparent outline-none text-sm"
              data-testid="owner-picker-search"
            />
          </div>
          <div className="overflow-auto flex-1">
            {matches.length === 0 ? (
              <div className="p-4 text-sm text-[#666666]">No matches.</div>
            ) : (
              matches.map((u) => (
                <button
                  type="button"
                  key={u.user_id}
                  onClick={() => {
                    onChange(u.user_id);
                    setOpen(false);
                    setQuery("");
                  }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-[#F5EDE8] border-b border-[#EDE5DB] last:border-b-0 ${
                    u.user_id === value ? "bg-[#F5EDE8]" : ""
                  }`}
                  data-testid={`owner-option-${u.user_id}`}
                >
                  <div className="font-medium">{u.name || "—"}</div>
                  <div className="text-xs text-[#666666]">
                    {u.email} · {u.role}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
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

const emptyListing = {
  title: "",
  description: "",
  kind: "sale",
  city: "Bangalore",
  locality: "",
  address: "",
  price: 0,
  area_sqft: 0,
  area_type: "super_builtup",
  bedrooms: 2,
  bathrooms: 2,
  property_type: "Apartment",
  possession_status: "Ready to Move",
  photos: ["https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200"],
  lat: 12.9716,
  lng: 77.5946,
  agent_id: "",
  status: "approved",
};

export function AdminListingDialog({ open, setOpen, editing, onSaved }) {
  const [form, setForm] = useState(emptyListing);
  const [localities, setLocalities] = useState([]);
  const [users, setUsers] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        ...emptyListing,
        ...editing,
        agent_id: editing.agent_id || "",
      });
    } else {
      setForm(emptyListing);
    }
    api.get("/localities", { params: { city: "Bangalore", status: "all" } })
      .then(({ data }) => setLocalities(data || []));
    api.get("/admin/users")
      .then(({ data }) => setUsers(data || []));
  }, [open, editing]);

  const save = async () => {
    setBusy(true);
    try {
      const payload = { ...form };
      if (!payload.agent_id) delete payload.agent_id; // backend will default to admin
      if (editing) await api.put(`/listings/${editing.listing_id}`, payload);
      else await api.post("/listings", payload);
      toast.success(editing ? "Listing updated" : "Listing created");
      setOpen(false);
      onSaved?.();
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-3xl bg-[#FCFAF5]">
        <DialogHeader>
          <DialogTitle className="font-display text-3xl">
            {editing ? "Edit Listing" : "New Listing"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[60vh] overflow-auto pr-2">
          <F label="Title">
            <input
              className="hs-input"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              data-testid="admin-lst-title"
            />
          </F>
          <F label="Kind">
            <select className="hs-input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              <option value="sale">For Sale</option>
              <option value="rent">For Rent</option>
            </select>
          </F>
          <F label="Locality">
            <select className="hs-input" value={form.locality} onChange={(e) => setForm({ ...form, locality: e.target.value })}>
              <option value="">Select</option>
              {localities.map((l) => (
                <option key={l.locality_id}>{l.name}</option>
              ))}
            </select>
          </F>
          <F label="Property Type">
            <input className="hs-input" value={form.property_type} onChange={(e) => setForm({ ...form, property_type: e.target.value })} />
          </F>
          <F label="Price (₹)">
            <input type="number" className="hs-input" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} data-testid="admin-lst-price" />
          </F>
          <F label="Area (sqft)">
            <input type="number" className="hs-input" value={form.area_sqft} onChange={(e) => setForm({ ...form, area_sqft: Number(e.target.value) })} />
          </F>
          <F label="Bedrooms">
            <input type="number" className="hs-input" value={form.bedrooms} onChange={(e) => setForm({ ...form, bedrooms: Number(e.target.value) })} />
          </F>
          <F label="Bathrooms">
            <input type="number" className="hs-input" value={form.bathrooms} onChange={(e) => setForm({ ...form, bathrooms: Number(e.target.value) })} />
          </F>
          <F label="Possession">
            <input className="hs-input" value={form.possession_status} onChange={(e) => setForm({ ...form, possession_status: e.target.value })} />
          </F>
          <F label="Area Type">
            <select className="hs-input" value={form.area_type} onChange={(e) => setForm({ ...form, area_type: e.target.value })}>
              <option value="carpet">Carpet</option>
              <option value="builtup">Built-up</option>
              <option value="super_builtup">Super Built-up</option>
            </select>
          </F>
          <F label="Address" full>
            <input className="hs-input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </F>
          <F label="Photo URLs (comma separated)" full>
            <input
              className="hs-input"
              value={(form.photos || []).join(",")}
              onChange={(e) => setForm({ ...form, photos: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })}
            />
          </F>
          <F label="Description" full>
            <textarea className="hs-input min-h-[80px]" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </F>

          {/* Admin-only block */}
          <div className="md:col-span-2 mt-2 pt-4 border-t border-[#DA9E3E]/40">
            <div className="label-eyebrow text-[#DA9E3E] mb-3">Admin Overrides</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <F label="Assign Owner">
                <OwnerCombobox
                  users={users}
                  value={form.agent_id}
                  onChange={(v) => setForm({ ...form, agent_id: v })}
                  allowedRoles={["agent", "builder", "admin"]}
                />
              </F>
              <F label="Status">
                <select
                  className="hs-input"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  data-testid="admin-lst-status"
                >
                  <option value="approved">Approved (Live)</option>
                  <option value="pending">Pending</option>
                  <option value="rejected">Rejected</option>
                  <option value="draft">Draft</option>
                </select>
              </F>
            </div>
          </div>
        </div>
        <div className="flex gap-3 justify-end pt-4 border-t border-[#EDE5DB]">
          <button onClick={() => setOpen(false)} className="btn-secondary">Cancel</button>
          <button onClick={save} disabled={busy} className="btn-primary" data-testid="admin-lst-save">
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const emptyProject = {
  name: "",
  builder_name: "",
  city: "Bangalore",
  locality: "",
  price_min: 0,
  price_max: 0,
  sqft_min: 0,
  sqft_max: 0,
  unit_types: "2BHK & 3BHK",
  approvals: ["BBMP"],
  rera_number: "",
  rera_state: "Karnataka",
  rera_date: "",
  rera_expiry: "",
  description: "",
  tagline: "",
  banner_image: "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=1600",
  brochure_url: "",
  builder_id: "",
  status: "approved",
};

export function AdminProjectDialog({ open, setOpen, editing, onSaved }) {
  const [form, setForm] = useState(emptyProject);
  const [localities, setLocalities] = useState([]);
  const [users, setUsers] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        ...emptyProject,
        ...editing,
        builder_id: editing.builder_id || "",
      });
    } else {
      setForm(emptyProject);
    }
    api.get("/localities", { params: { city: "Bangalore", status: "all" } })
      .then(({ data }) => setLocalities(data || []));
    api.get("/admin/users").then(({ data }) => setUsers(data || []));
  }, [open, editing]);

  const save = async () => {
    setBusy(true);
    try {
      const payload = {
        ...form,
        approvals: typeof form.approvals === "string"
          ? form.approvals.split(",").map((x) => x.trim()).filter(Boolean)
          : form.approvals,
      };
      if (!payload.builder_id) delete payload.builder_id;
      if (editing) await api.put(`/projects/${editing.project_id}`, payload);
      else await api.post("/projects", payload);
      toast.success(editing ? "Project updated" : "Project created");
      setOpen(false);
      onSaved?.();
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-3xl bg-[#FCFAF5]">
        <DialogHeader>
          <DialogTitle className="font-display text-3xl">
            {editing ? "Edit Project" : "New Project"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[60vh] overflow-auto pr-2">
          <F label="Project Name">
            <input className="hs-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="admin-prj-name" />
          </F>
          <F label="Builder Name (display)">
            <input className="hs-input" value={form.builder_name} onChange={(e) => setForm({ ...form, builder_name: e.target.value })} />
          </F>
          <F label="Tagline">
            <input className="hs-input" value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} />
          </F>
          <F label="Locality">
            <select className="hs-input" value={form.locality} onChange={(e) => setForm({ ...form, locality: e.target.value })}>
              <option value="">Select</option>
              {localities.map((l) => (
                <option key={l.locality_id}>{l.name}</option>
              ))}
            </select>
          </F>
          <F label="Unit Types">
            <input className="hs-input" value={form.unit_types} onChange={(e) => setForm({ ...form, unit_types: e.target.value })} />
          </F>
          <F label="Approvals (comma)">
            <input
              className="hs-input"
              value={Array.isArray(form.approvals) ? form.approvals.join(",") : form.approvals}
              onChange={(e) => setForm({ ...form, approvals: e.target.value })}
            />
          </F>
          <F label="Price Min (₹)">
            <input type="number" className="hs-input" value={form.price_min} onChange={(e) => setForm({ ...form, price_min: Number(e.target.value) })} />
          </F>
          <F label="Price Max (₹)">
            <input type="number" className="hs-input" value={form.price_max} onChange={(e) => setForm({ ...form, price_max: Number(e.target.value) })} />
          </F>
          <F label="Sqft Min">
            <input type="number" className="hs-input" value={form.sqft_min} onChange={(e) => setForm({ ...form, sqft_min: Number(e.target.value) })} />
          </F>
          <F label="Sqft Max">
            <input type="number" className="hs-input" value={form.sqft_max} onChange={(e) => setForm({ ...form, sqft_max: Number(e.target.value) })} />
          </F>
          <F label="RERA Number" full>
            <input className="hs-input" value={form.rera_number} onChange={(e) => setForm({ ...form, rera_number: e.target.value })} />
          </F>
          <F label="Banner Image URL" full>
            <input className="hs-input" value={form.banner_image} onChange={(e) => setForm({ ...form, banner_image: e.target.value })} />
          </F>
          <F label="Brochure URL (optional)" full>
            <input className="hs-input" value={form.brochure_url} onChange={(e) => setForm({ ...form, brochure_url: e.target.value })} />
          </F>
          <F label="Description" full>
            <textarea className="hs-input min-h-[80px]" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </F>

          {/* Admin-only block */}
          <div className="md:col-span-2 mt-2 pt-4 border-t border-[#DA9E3E]/40">
            <div className="label-eyebrow text-[#DA9E3E] mb-3">Admin Overrides</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <F label="Assign Owner (Builder)">
                <OwnerCombobox
                  users={users}
                  value={form.builder_id}
                  onChange={(v) => setForm({ ...form, builder_id: v })}
                  allowedRoles={["builder", "admin"]}
                />
              </F>
              <F label="Status">
                <select
                  className="hs-input"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  data-testid="admin-prj-status"
                >
                  <option value="approved">Approved (Live)</option>
                  <option value="pending">Pending</option>
                  <option value="rejected">Rejected</option>
                  <option value="draft">Draft</option>
                </select>
              </F>
            </div>
          </div>
        </div>
        <div className="flex gap-3 justify-end pt-4 border-t border-[#EDE5DB]">
          <button onClick={() => setOpen(false)} className="btn-secondary">Cancel</button>
          <button onClick={save} disabled={busy} className="btn-primary" data-testid="admin-prj-save">
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
