import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import api from "@/lib/api";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import InquiryForm from "@/components/InquiryForm";
import EmiCalculator from "@/components/EmiCalculator";
import MapView from "@/components/MapView";
import PropertyCard from "@/components/PropertyCard";
import { formatINR } from "@/lib/api";
import { MapPin, BedDouble, Bath, Maximize2, Home, Calendar } from "lucide-react";

export default function PropertyDetail() {
  const { id } = useParams();
  const [item, setItem] = useState(null);
  const [active, setActive] = useState(0);
  const [similar, setSimilar] = useState([]);

  useEffect(() => {
    api.get(`/listings/${id}`).then(({ data }) => setItem(data));
  }, [id]);

  useEffect(() => {
    if (!item) return;
    api
      .get("/listings", { params: { locality: item.locality, kind: item.kind, limit: 8 } })
      .then(({ data }) => setSimilar((data || []).filter((d) => d.listing_id !== item.listing_id).slice(0, 4)));
  }, [item]);

  if (!item) {
    return (
      <div className="App">
        <Header />
        <div className="max-w-[1400px] mx-auto px-6 py-32 text-center font-display text-3xl">Loading…</div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="App">
      <Header />

      <section className="max-w-[1400px] mx-auto px-6 lg:px-12 pt-8">
        <Link to="/properties" className="text-xs tracking-widest uppercase text-[#4A5D54] hover:text-[#B68D40]">
          ← Back to listings
        </Link>
      </section>

      <section className="max-w-[1400px] mx-auto px-6 lg:px-12 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 aspect-[16/10] overflow-hidden bg-[#F3F0E9]">
          {item.photos?.[active] && <img src={item.photos[active]} alt="" className="w-full h-full object-cover" />}
        </div>
        <div className="grid grid-cols-2 gap-2 max-h-[640px] overflow-auto no-scrollbar">
          {item.photos?.map((p, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              className={`aspect-square overflow-hidden border ${active === i ? "border-[#06402B]" : "border-transparent"}`}
            >
              <img src={p} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      </section>

      <section className="max-w-[1400px] mx-auto px-6 lg:px-12 py-10 grid grid-cols-1 lg:grid-cols-3 gap-10">
        <div className="lg:col-span-2">
          <div className="flex items-center gap-3 mb-3">
            <span className="bg-[#06402B] text-[#FAF9F6] text-[10px] tracking-widest uppercase px-2.5 py-1 font-semibold">
              For {item.kind}
            </span>
            <span className="text-xs text-[#4A5D54] flex items-center gap-1.5">
              <MapPin size={12} strokeWidth={1.5} /> {item.locality}, {item.city}
            </span>
          </div>
          <h1 className="font-display text-4xl sm:text-5xl text-[#1A2421] mb-4">{item.title}</h1>
          <div className="flex items-baseline gap-3 mb-8">
            <span className="font-display text-3xl text-[#06402B]">{formatINR(item.price)}</span>
            {item.kind === "rent" && <span className="text-sm text-[#4A5D54]">/month</span>}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-[#E8E4D9] border border-[#E8E4D9] mb-10">
            {[
              { icon: BedDouble, label: "Bedrooms", value: item.bedrooms || "—" },
              { icon: Bath, label: "Bathrooms", value: item.bathrooms || "—" },
              { icon: Maximize2, label: "Area", value: `${item.area_sqft} sqft` },
              { icon: Home, label: "Type", value: item.property_type || "—" },
            ].map((s, i) => (
              <div key={i} className="bg-white p-5">
                <s.icon size={18} strokeWidth={1.5} className="text-[#B68D40] mb-3" />
                <div className="label-eyebrow mb-1">{s.label}</div>
                <div className="font-display text-xl">{s.value}</div>
              </div>
            ))}
          </div>

          <div className="mb-10">
            <div className="label-eyebrow mb-3">About this property</div>
            <p className="text-[#1A2421] leading-relaxed">{item.description}</p>
          </div>

          {item.possession_status && (
            <div className="mb-10 flex items-center gap-2 text-sm text-[#4A5D54]">
              <Calendar size={14} strokeWidth={1.5} /> Possession: <span className="font-semibold text-[#1A2421]">{item.possession_status}</span>
            </div>
          )}

          <div className="mb-12">
            <div className="label-eyebrow mb-3">Location</div>
            <MapView items={[item]} center={[item.lat || 12.9716, item.lng || 77.5946]} zoom={13} height={360} />
            <p className="text-xs text-[#4A5D54] mt-2">{item.address}</p>
          </div>

          <div className="mb-12">
            <EmiCalculator initialPrice={item.price} />
          </div>
        </div>

        <div className="lg:col-span-1">
          <div className="lg:sticky lg:top-24">
            <InquiryForm listing_id={item.listing_id} />
          </div>
        </div>
      </section>

      {similar.length > 0 && (
        <section className="bg-[#F3F0E9] py-20">
          <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
            <div className="label-eyebrow mb-3">You might also like</div>
            <h2 className="font-display text-3xl sm:text-4xl mb-10">Similar homes nearby</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {similar.map((s) => <PropertyCard key={s.listing_id} listing={s} />)}
            </div>
          </div>
        </section>
      )}

      <Footer />
    </div>
  );
}
