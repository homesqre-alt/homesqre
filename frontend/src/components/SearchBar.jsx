import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { Search, MapPin, Home, Building2 } from "lucide-react";

export default function SearchBar({ size = "lg" }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null);
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (!q || q.length < 2) {
      setResults(null);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get("/search", { params: { q } });
        setResults(data);
        setOpen(true);
      } catch {
        setResults(null);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const onSubmit = (e) => {
    e.preventDefault();
    if (q) nav(`/properties?q=${encodeURIComponent(q)}`);
  };

  const isLg = size === "lg";

  return (
    <div ref={ref} className="relative w-full" data-testid="search-bar">
      <form onSubmit={onSubmit} className={`flex items-center bg-white border border-[#E8E4D9] ${isLg ? "px-6 py-4" : "px-4 py-3"}`}>
        <Search size={isLg ? 18 : 16} strokeWidth={1.5} className="text-[#4A5D54] mr-3 shrink-0" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => results && setOpen(true)}
          placeholder="Search by locality, project, builder or property type…"
          className={`flex-1 outline-none bg-transparent ${isLg ? "text-base" : "text-sm"}`}
          data-testid="search-input"
        />
        <button type="submit" className="btn-primary ml-3 shrink-0" data-testid="search-submit">
          Search
        </button>
      </form>
      {open && results && (
        <div className="absolute left-0 right-0 top-full mt-2 bg-white border border-[#E8E4D9] z-40 shadow-xl max-h-[420px] overflow-auto">
          {results.projects?.length > 0 && (
            <div className="p-4 border-b border-[#E8E4D9]">
              <div className="label-eyebrow mb-3">Projects</div>
              {results.projects.map((p) => (
                <button
                  key={p.project_id}
                  onClick={() => {
                    setOpen(false);
                    nav(`/projects/${p.city_slug}/${p.locality_slug}/${p.slug}`);
                  }}
                  className="flex items-center gap-3 py-2 w-full text-left hover:bg-[#FAF9F6]"
                  data-testid={`search-project-${p.project_id}`}
                >
                  <Building2 size={14} strokeWidth={1.5} className="text-[#B68D40]" />
                  <span className="text-sm">{p.name}</span>
                  <span className="text-xs text-[#758A80] ml-auto">{p.locality}</span>
                </button>
              ))}
            </div>
          )}
          {results.listings?.length > 0 && (
            <div className="p-4 border-b border-[#E8E4D9]">
              <div className="label-eyebrow mb-3">Listings</div>
              {results.listings.map((l) => (
                <button
                  key={l.listing_id}
                  onClick={() => {
                    setOpen(false);
                    nav(`/properties/${l.listing_id}`);
                  }}
                  className="flex items-center gap-3 py-2 w-full text-left hover:bg-[#FAF9F6]"
                  data-testid={`search-listing-${l.listing_id}`}
                >
                  <Home size={14} strokeWidth={1.5} className="text-[#06402B]" />
                  <span className="text-sm">{l.title}</span>
                </button>
              ))}
            </div>
          )}
          {results.localities?.length > 0 && (
            <div className="p-4">
              <div className="label-eyebrow mb-3">Localities</div>
              {results.localities.map((loc) => (
                <button
                  key={loc.locality_id}
                  onClick={() => {
                    setOpen(false);
                    nav(`/properties?locality=${encodeURIComponent(loc.name)}`);
                  }}
                  className="flex items-center gap-3 py-2 w-full text-left hover:bg-[#FAF9F6]"
                >
                  <MapPin size={14} strokeWidth={1.5} />
                  <span className="text-sm">{loc.name}</span>
                </button>
              ))}
            </div>
          )}
          {!results.projects?.length && !results.listings?.length && !results.localities?.length && (
            <div className="p-6 text-sm text-[#758A80] text-center">No results yet — try another keyword.</div>
          )}
        </div>
      )}
    </div>
  );
}
