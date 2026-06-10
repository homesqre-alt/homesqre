import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api, { formatINR } from "@/lib/api";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import PropertyCard from "@/components/PropertyCard";
import { X } from "lucide-react";

const FIELDS = [
  ["Price", (l) => formatINR(l.price)],
  ["Bedrooms", (l) => `${l.bedrooms || "—"} BHK`],
  ["Bathrooms", (l) => l.bathrooms || "—"],
  ["Area", (l) => `${l.area_sqft || "—"} sqft`],
  ["Property Type", (l) => l.property_type || "—"],
  ["Possession", (l) => l.possession_status || "—"],
  ["Locality", (l) => l.locality],
];

export default function Compare() {
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [pool, setPool] = useState([]);

  const ids = (params.get("ids") || "").split(",").filter(Boolean);

  useEffect(() => {
    api.get("/listings", { params: { limit: 12 } }).then(({ data }) => setPool(data || []));
  }, []);

  const idsKey = ids.join(",");
  useEffect(() => {
    if (!ids.length) {
      setItems([]);
      return;
    }
    Promise.all(ids.map((id) => api.get(`/listings/${id}`).then((r) => r.data).catch(() => null)))
      .then((res) => setItems(res.filter(Boolean)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  const add = (id) => {
    if (ids.includes(id) || ids.length >= 4) return;
    setParams({ ids: [...ids, id].join(",") });
  };

  const remove = (id) => {
    setParams({ ids: ids.filter((x) => x !== id).join(",") });
  };

  return (
    <div className="App">
      <Header />
      <section className="max-w-[1400px] mx-auto px-6 lg:px-12 py-16">
        <div className="label-eyebrow mb-3">Side by side</div>
        <h1 className="font-display text-5xl mb-12">Compare properties.</h1>

        {items.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] bg-white border border-[#EDE5DB]">
              <thead>
                <tr>
                  <th className="p-4 text-left label-eyebrow w-40"></th>
                  {items.map((it) => (
                    <th key={it.listing_id} className="p-4 text-left border-l border-[#EDE5DB] min-w-[220px]">
                      <button onClick={() => remove(it.listing_id)} className="float-right text-[#9B4A3A]">
                        <X size={16} />
                      </button>
                      <img src={it.photos?.[0]} alt="" className="w-full aspect-[4/3] object-cover mb-3" />
                      <div className="font-display text-lg">{it.title}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FIELDS.map(([label, fn], i) => (
                  <tr key={label} className={i % 2 ? "bg-[#FCFAF5]" : "bg-white"}>
                    <td className="p-4 label-eyebrow">{label}</td>
                    {items.map((it) => (
                      <td key={it.listing_id} className="p-4 border-l border-[#EDE5DB] text-sm">{fn(it)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-[#F5EDE8] p-12 text-center">
            <div className="font-display text-3xl mb-3">Pick listings to compare</div>
            <p className="text-[#333333]">Add up to 4 listings below to see them side by side.</p>
          </div>
        )}

        <div className="mt-16">
          <div className="label-eyebrow mb-4">Add from listings</div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {pool.filter((p) => !ids.includes(p.listing_id)).slice(0, 8).map((l) => (
              <div key={l.listing_id} className="relative group">
                <PropertyCard listing={l} />
                <button
                  onClick={() => add(l.listing_id)}
                  className="absolute top-3 left-3 btn-gold text-[10px]"
                  style={{ padding: "8px 14px" }}
                >
                  Add to compare
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>
      <Footer />
    </div>
  );
}
