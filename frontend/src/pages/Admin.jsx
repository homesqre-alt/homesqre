import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import {
  Building2,
  MapPin,
  Home,
  LogOut,
  ShieldCheck,
  ExternalLink,
} from "lucide-react";

const TABS = [
  { id: "city", label: "City", icon: Building2 },
  { id: "locality", label: "Locality", icon: MapPin },
  { id: "listing", label: "Listing", icon: Home },
];

export default function Admin() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [tab, setTab] = useState("city");
  const [cities, setCities] = useState([]);
  const [counts, setCounts] = useState({ cities: 0, localities: 0, listings: 0 });

  const loadCities = async () => {
    try {
      const { data } = await api.get("/cities");
      setCities(data || []);
    } catch (e) {
      console.warn("loadCities failed", e);
    }
  };

  const loadCounts = async () => {
    try {
      const [c, l, lst] = await Promise.all([
        api.get("/cities"),
        api.get("/localities"),
        api.get("/listings", { params: { limit: 200 } }),
      ]);
      setCounts({
        cities: (c.data || []).length,
        localities: (l.data || []).length,
        listings: (lst.data || []).length,
      });
    } catch (e) {
      console.warn("loadCounts failed", e);
    }
  };

  useEffect(() => {
    loadCities();
    loadCounts();
  }, []);

  const onCreated = () => {
    loadCities();
    loadCounts();
  };

  const handleLogout = async () => {
    await logout();
    nav("/admin/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#1A2421]">
      {/* Top bar */}
      <header className="bg-[#0E1815] text-[#FAF9F6] border-b border-[#B68D40]/30">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-10 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 grid place-items-center bg-[#B68D40]">
              <ShieldCheck size={18} strokeWidth={1.5} className="text-[#0E1815]" />
            </div>
            <div>
              <div className="label-eyebrow text-[#B68D40]">Homesqre</div>
              <div className="font-display text-lg leading-none">Admin Console</div>
            </div>
          </div>
          <div className="flex items-center gap-6 text-sm">
            <Link to="/dashboard/admin" className="text-white/70 hover:text-[#B68D40] inline-flex items-center gap-1">
              Full Dashboard <ExternalLink size={12} />
            </Link>
            <div className="hidden sm:block text-white/60">{user?.email}</div>
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-2 text-xs tracking-widest uppercase text-white/80 hover:text-[#B68D40]"
              data-testid="admin-logout"
            >
              <LogOut size={14} /> Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1280px] mx-auto px-6 lg:px-10 py-12">
        <div className="mb-10">
          <div className="label-eyebrow mb-2">Quick add</div>
          <h1 className="font-display text-4xl sm:text-5xl mb-3">Manage platform data.</h1>
          <p className="text-[#4A5D54] max-w-2xl">
            Add cities, localities, and listings directly. The auth token is attached
            automatically — you should never see a 401 from this page.
          </p>
        </div>

        {/* Stat strip */}
        <div className="grid grid-cols-3 gap-4 mb-12">
          <Stat label="Cities" value={counts.cities} />
          <Stat label="Localities" value={counts.localities} />
          <Stat label="Listings" value={counts.listings} />
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2 mb-8 border-b border-[#E8E4D9]">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`inline-flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  active
                    ? "border-[#06402B] text-[#06402B]"
                    : "border-transparent text-[#4A5D54] hover:text-[#06402B]"
                }`}
                data-testid={`admin-tab-${t.id}`}
              >
                <Icon size={16} strokeWidth={1.5} />
                Add {t.label}
              </button>
            );
          })}
        </div>

        {tab === "city" && <CityForm onCreated={onCreated} />}
        {tab === "locality" && <LocalityForm cities={cities} onCreated={onCreated} />}
        {tab === "listing" && <ListingForm onCreated={onCreated} />}
      </main>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="bg-white border-l-2 border-[#B68D40] p-5">
      <div className="label-eyebrow mb-1">{label}</div>
      <div className="font-display text-3xl text-[#06402B]">{value}</div>
    </div>
  );
}

// --- Reusable input wrappers ---
function Field({ label, children, hint }) {
  return (
    <label className="block">
      <div className="label-eyebrow mb-2">{label}</div>
      {children}
      {hint && <div className="text-xs text-[#758A80] mt-1">{hint}</div>}
    </label>
  );
}
const inputCls =
  "w-full bg-white border border-[#E8E4D9] focus:border-[#06402B] outline-none px-4 py-3 text-sm";

// --- City ---
function CityForm({ onCreated }) {
  const [form, setForm] = useState({ name: "", state: "", intro: "" });
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("City name is required");
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post("/cities", form);
      toast.success(`City "${data.name}" created`);
      setForm({ name: "", state: "", intro: "" });
      onCreated?.();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-3xl" data-testid="admin-city-form">
      <Field label="City Name">
        <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="city-name" />
      </Field>
      <Field label="State">
        <input className={inputCls} value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} data-testid="city-state" />
      </Field>
      <div className="md:col-span-2">
        <Field label="Intro / Description" hint="Shown on the city landing page.">
          <textarea rows={3} className={inputCls} value={form.intro} onChange={(e) => setForm({ ...form, intro: e.target.value })} data-testid="city-intro" />
        </Field>
      </div>
      <div className="md:col-span-2">
        <button disabled={busy} className="btn-primary" data-testid="city-submit">
          {busy ? "Creating…" : "Create City"}
        </button>
      </div>
    </form>
  );
}

// --- Locality ---
function LocalityForm({ cities, onCreated }) {
  const [form, setForm] = useState({ name: "", city: "" });
  const [busy, setBusy] = useState(false);

  // Default city to first available
  useEffect(() => {
    if (!form.city && cities.length) setForm((f) => ({ ...f, city: cities[0].name }));
  }, [cities, form.city]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.city) {
      toast.error("Name and parent city are required");
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post("/localities", form);
      toast.success(`Locality "${data.name}" added to ${data.city}`);
      setForm({ name: "", city: form.city });
      onCreated?.();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-3xl" data-testid="admin-locality-form">
      <Field label="Parent City">
        <select className={inputCls} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} data-testid="locality-city">
          <option value="">— Select —</option>
          {cities.map((c) => (
            <option key={c.city_id} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Locality Name">
        <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="locality-name" />
      </Field>
      <div className="md:col-span-2">
        <button disabled={busy} className="btn-primary" data-testid="locality-submit">
          {busy ? "Creating…" : "Create Locality"}
        </button>
      </div>
    </form>
  );
}

// --- Listing ---
function ListingForm({ onCreated }) {
  const [form, setForm] = useState({
    title: "",
    kind: "sale",
    property_type: "Apartment",
    city: "Bangalore",
    locality: "",
    price: "",
    bedrooms: 2,
    bathrooms: 2,
    area_sqft: 1000,
    description: "",
    photos: "",
    status: "approved",
  });
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.locality.trim() || !form.price) {
      toast.error("Title, locality and price are required");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        ...form,
        price: Number(form.price),
        bedrooms: Number(form.bedrooms),
        bathrooms: Number(form.bathrooms),
        area_sqft: Number(form.area_sqft),
        photos: form.photos
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
      };
      const { data } = await api.post("/listings", payload);
      toast.success(`Listing "${data.title}" created`);
      setForm({
        ...form,
        title: "",
        locality: "",
        price: "",
        description: "",
        photos: "",
      });
      onCreated?.();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-4xl" data-testid="admin-listing-form">
      <div className="md:col-span-2">
        <Field label="Title">
          <input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} data-testid="listing-title" />
        </Field>
      </div>
      <Field label="Kind">
        <select className={inputCls} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} data-testid="listing-kind">
          <option value="sale">For Sale</option>
          <option value="rent">For Rent</option>
        </select>
      </Field>
      <Field label="Property Type">
        <select className={inputCls} value={form.property_type} onChange={(e) => setForm({ ...form, property_type: e.target.value })} data-testid="listing-type">
          <option>Apartment</option>
          <option>Villa</option>
          <option>Plot</option>
          <option>Independent House</option>
          <option>Commercial</option>
        </select>
      </Field>
      <Field label="City">
        <input className={inputCls} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} data-testid="listing-city" />
      </Field>
      <Field label="Locality">
        <input className={inputCls} value={form.locality} onChange={(e) => setForm({ ...form, locality: e.target.value })} data-testid="listing-locality" />
      </Field>
      <Field label="Price (₹)" hint="Sale price or monthly rent — plain rupees.">
        <input type="number" min="0" className={inputCls} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} data-testid="listing-price" />
      </Field>
      <Field label="Area (sqft)">
        <input type="number" min="0" className={inputCls} value={form.area_sqft} onChange={(e) => setForm({ ...form, area_sqft: e.target.value })} data-testid="listing-area" />
      </Field>
      <Field label="Bedrooms">
        <input type="number" min="0" className={inputCls} value={form.bedrooms} onChange={(e) => setForm({ ...form, bedrooms: e.target.value })} data-testid="listing-beds" />
      </Field>
      <Field label="Bathrooms">
        <input type="number" min="0" className={inputCls} value={form.bathrooms} onChange={(e) => setForm({ ...form, bathrooms: e.target.value })} data-testid="listing-baths" />
      </Field>
      <Field label="Status">
        <select className={inputCls} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} data-testid="listing-status">
          <option value="approved">Approved (Live)</option>
          <option value="pending">Pending Review</option>
          <option value="rejected">Rejected</option>
          <option value="draft">Draft</option>
        </select>
      </Field>
      <div className="md:col-span-2">
        <Field label="Description">
          <textarea rows={3} className={inputCls} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} data-testid="listing-desc" />
        </Field>
      </div>
      <div className="md:col-span-2">
        <Field label="Photos" hint="One URL per line.">
          <textarea rows={3} className={inputCls} value={form.photos} onChange={(e) => setForm({ ...form, photos: e.target.value })} data-testid="listing-photos" />
        </Field>
      </div>
      <div className="md:col-span-2">
        <button disabled={busy} className="btn-primary" data-testid="listing-submit">
          {busy ? "Creating…" : "Create Listing"}
        </button>
      </div>
    </form>
  );
}
