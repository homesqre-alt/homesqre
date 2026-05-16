import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import PropertyCard from "@/components/PropertyCard";
import MapView from "@/components/MapView";
import { Filter, Map as MapIcon, Grid3x3 } from "lucide-react";

export default function Properties() {
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [localities, setLocalities] = useState([]);
  const [view, setView] = useState("grid");
  const [loading, setLoading] = useState(true);

  const filters = useMemo(() => ({
    kind: params.get("kind") || "",
    locality: params.get("locality") || "",
    bedrooms: params.get("bedrooms") || "",
    price_min: params.get("price_min") || "",
    price_max: params.get("price_max") || "",
    sort: params.get("sort") || "newest",
    q: params.get("q") || "",
  }), [params]);

  useEffect(() => {
    api.get("/localities", { params: { city: "Bangalore" } }).then(({ data }) => setLocalities(data || []));
  }, []);

  useEffect(() => {
    setLoading(true);
    const p = { status: "live", limit: 60 };
    if (filters.kind) p.kind = filters.kind;
    if (filters.locality) p.locality = filters.locality;
    if (filters.bedrooms) p.bedrooms = filters.bedrooms;
    if (filters.price_min) p.price_min = filters.price_min;
    if (filters.price_max) p.price_max = filters.price_max;
    if (filters.sort) p.sort = filters.sort;
    if (filters.q) p.q = filters.q;
    api
      .get("/listings", { params: p })
      .then(({ data }) => setItems(data || []))
      .finally(() => setLoading(false));
  }, [filters]);

  const update = (k, v) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next);
  };

  return (
    <div className="App">
      <Header />
      <section className="bg-[#F3F0E9] border-b border-[#E8E4D9]">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12 py-10">
          <div className="flex items-end justify-between flex-wrap gap-4">
            <div>
              <div className="label-eyebrow mb-2">Browse</div>
              <h1 className="font-display text-4xl sm:text-5xl">Properties in Bangalore</h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setView("grid")}
                className={`p-3 border ${view === "grid" ? "bg-[#06402B] text-white border-[#06402B]" : "border-[#E8E4D9]"}`}
                data-testid="view-grid"
                aria-label="grid view"
              >
                <Grid3x3 size={16} strokeWidth={1.5} />
              </button>
              <button
                onClick={() => setView("map")}
                className={`p-3 border ${view === "map" ? "bg-[#06402B] text-white border-[#06402B]" : "border-[#E8E4D9]"}`}
                data-testid="view-map"
                aria-label="map view"
              >
                <MapIcon size={16} strokeWidth={1.5} />
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-[1400px] mx-auto px-6 lg:px-12 py-10">
        {/* Filters */}
        <div className="bg-white border border-[#E8E4D9] p-5 mb-8 grid grid-cols-2 md:grid-cols-6 gap-4" data-testid="filters">
          <div>
            <label className="label-eyebrow mb-1 block">Kind</label>
            <select className="hs-input" value={filters.kind} onChange={(e) => update("kind", e.target.value)} data-testid="filter-kind">
              <option value="">Any</option>
              <option value="sale">For Sale</option>
              <option value="rent">For Rent</option>
            </select>
          </div>
          <div>
            <label className="label-eyebrow mb-1 block">Locality</label>
            <select className="hs-input" value={filters.locality} onChange={(e) => update("locality", e.target.value)} data-testid="filter-locality">
              <option value="">All</option>
              {localities.map((l) => <option key={l.locality_id}>{l.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label-eyebrow mb-1 block">Bedrooms</label>
            <select className="hs-input" value={filters.bedrooms} onChange={(e) => update("bedrooms", e.target.value)} data-testid="filter-beds">
              <option value="">Any</option>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}+ BHK</option>)}
            </select>
          </div>
          <div>
            <label className="label-eyebrow mb-1 block">Min ₹</label>
            <input className="hs-input" type="number" value={filters.price_min} onChange={(e) => update("price_min", e.target.value)} placeholder="0" data-testid="filter-min" />
          </div>
          <div>
            <label className="label-eyebrow mb-1 block">Max ₹</label>
            <input className="hs-input" type="number" value={filters.price_max} onChange={(e) => update("price_max", e.target.value)} placeholder="0" data-testid="filter-max" />
          </div>
          <div>
            <label className="label-eyebrow mb-1 block">Sort</label>
            <select className="hs-input" value={filters.sort} onChange={(e) => update("sort", e.target.value)} data-testid="filter-sort">
              <option value="newest">Newest</option>
              <option value="price_asc">Price: Low → High</option>
              <option value="price_desc">Price: High → Low</option>
              <option value="popular">Most Viewed</option>
            </select>
          </div>
        </div>

        <div className="mb-6 flex items-center justify-between">
          <p className="text-sm text-[#4A5D54]">
            {loading ? "Loading…" : `${items.length} ${items.length === 1 ? "result" : "results"}`}
          </p>
        </div>

        {view === "grid" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            {items.map((l) => <PropertyCard key={l.listing_id} listing={l} />)}
            {!loading && items.length === 0 && (
              <div className="col-span-full text-center py-20 text-[#758A80]">
                <Filter className="mx-auto mb-4" strokeWidth={1.5} />
                No properties match your filters.
              </div>
            )}
          </div>
        ) : (
          <MapView items={items} height={620} />
        )}
      </section>
      <Footer />
    </div>
  );
}
