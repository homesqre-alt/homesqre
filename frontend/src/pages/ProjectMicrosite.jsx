import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import api, { formatINR } from "@/lib/api";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import InquiryForm from "@/components/InquiryForm";
import EmiCalculator from "@/components/EmiCalculator";
import MapView from "@/components/MapView";
import StickyInquiryBar from "@/components/StickyInquiryBar";
import { ShieldCheck, MapPin, Building, Calendar, ChevronRight } from "lucide-react";

export default function ProjectMicrosite() {
  const { city, locality, slug } = useParams();
  const [project, setProject] = useState(null);
  const [allAmenities, setAllAmenities] = useState([]);
  const [allBanks, setAllBanks] = useState([]);
  const [selectedBank, setSelectedBank] = useState(null);

  useEffect(() => {
    api.get(`/projects/by-slug/${city}/${locality}/${slug}`).then(({ data }) => setProject(data));
    api.get("/amenities").then(({ data }) => setAllAmenities(data || []));
    api.get("/banks").then(({ data }) => {
      setAllBanks(data || []);
      if (data?.length) setSelectedBank(data[0]);
    });
  }, [city, locality, slug]);

  if (!project) {
    return (
      <div className="App">
        <Header />
        <div className="max-w-[1400px] mx-auto px-6 py-32 text-center font-display text-3xl">Loading…</div>
        <Footer />
      </div>
    );
  }

  const amenities = allAmenities.filter((a) => project.amenity_ids?.includes(a.amenity_id));
  const amByCat = amenities.reduce((acc, a) => {
    (acc[a.category] = acc[a.category] || []).push(a);
    return acc;
  }, {});
  const banks = allBanks.filter((b) => project.bank_ids?.includes(b.bank_id));
  const interiorBudget = Math.round((project.price_min || 5000000) * 0.08);

  return (
    <div className="App">
      <Header />

      {/* Hero */}
      <section className="relative min-h-[78vh] flex items-end">
        <img src={project.banner_image} alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/30" />
        <div className="relative z-10 max-w-[1400px] mx-auto w-full px-6 lg:px-12 py-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-end">
            <div className="lg:col-span-8 text-white">
              <div className="label-eyebrow text-[#B68D40] mb-4">{project.builder_name}</div>
              <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl leading-[1.02] mb-5">{project.name}</h1>
              <p className="text-white/85 text-lg max-w-2xl mb-6 italic">{project.tagline}</p>
              <div className="flex flex-wrap items-center gap-x-8 gap-y-3 text-sm text-white/80">
                <span className="flex items-center gap-2">
                  <MapPin size={14} strokeWidth={1.5} className="text-[#B68D40]" /> {project.locality}, {project.city}
                </span>
                <span className="flex items-center gap-2">
                  <Building size={14} strokeWidth={1.5} className="text-[#B68D40]" /> {project.unit_types}
                </span>
                <span className="flex items-center gap-2">
                  <Calendar size={14} strokeWidth={1.5} className="text-[#B68D40]" /> Updated {new Date(project.last_updated).toLocaleDateString()}
                </span>
              </div>
            </div>
            <div className="lg:col-span-4">
              <div className="bg-[#FAF9F6] border-l-2 border-[#B68D40] p-6">
                <div className="label-eyebrow mb-2">Starting from</div>
                <div className="font-display text-4xl text-[#06402B] mb-2">{formatINR(project.price_min)}</div>
                <div className="text-xs text-[#4A5D54]">Up to {formatINR(project.price_max)}</div>
                {project.rera_number && (
                  <div className="mt-5 pt-5 border-t border-[#E8E4D9] flex items-center gap-2 text-xs">
                    <ShieldCheck size={14} strokeWidth={1.5} className="text-[#06402B]" />
                    <div>
                      <div className="label-eyebrow">RERA Verified</div>
                      <div className="text-[#1A2421] font-mono mt-1 text-[10px]">{project.rera_number}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Description */}
      <section className="max-w-[1400px] mx-auto px-6 lg:px-12 py-20 grid grid-cols-1 lg:grid-cols-12 gap-12">
        <div className="lg:col-span-8">
          <div className="label-eyebrow mb-3">Project Overview</div>
          <h2 className="font-display text-4xl sm:text-5xl mb-6">A new chapter, beautifully written.</h2>
          <p className="text-[#1A2421] leading-relaxed mb-8">{project.description}</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <Stat label="Unit Types" value={project.unit_types} />
            <Stat label="Sqft Range" value={`${project.sqft_min}–${project.sqft_max}`} />
            <Stat label="Approvals" value={(project.approvals || []).join(", ")} />
            <Stat label="RERA State" value={project.rera_state} />
          </div>
        </div>
        <div className="lg:col-span-4">
          <InquiryForm project_id={project.project_id} title="Request a callback" />
        </div>
      </section>

      {/* Amenities */}
      <section className="bg-[#F3F0E9] py-20">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
          <div className="label-eyebrow mb-3">Lifestyle</div>
          <h2 className="font-display text-4xl sm:text-5xl mb-12">Amenities crafted around you.</h2>
          <div className="space-y-10">
            {Object.entries(amByCat).map(([cat, items]) => (
              <div key={cat}>
                <div className="font-display text-2xl text-[#06402B] mb-4 flex items-center gap-3">
                  {cat}
                  <span className="flex-1 h-px bg-[#D1CFC7]" />
                  <span className="label-eyebrow">{items.length}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {items.map((a) => (
                    <div key={a.amenity_id} className="bg-white border-l-2 border-[#B68D40] p-4 text-sm text-[#1A2421]">
                      {a.name}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Banks + EMI */}
      <section className="max-w-[1400px] mx-auto px-6 lg:px-12 py-20">
        <div className="label-eyebrow mb-3">Home Loans</div>
        <h2 className="font-display text-4xl sm:text-5xl mb-12">Approved bank partners.</h2>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          <div className="lg:col-span-5 space-y-3">
            {banks.map((b) => (
              <button
                key={b.bank_id}
                onClick={() => setSelectedBank(b)}
                className={`w-full text-left p-5 border transition-all ${
                  selectedBank?.bank_id === b.bank_id
                    ? "border-[#06402B] bg-white shadow-sm"
                    : "border-[#E8E4D9] bg-white/60 hover:bg-white"
                }`}
                data-testid={`bank-${b.bank_id}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-display text-xl">{b.name}</span>
                  <span className="text-xs text-[#B68D40] tracking-widest uppercase">{b.rate_min}% – {b.rate_max}%</span>
                </div>
                <div className="text-xs text-[#4A5D54]">Floating rate · Last updated {new Date().toLocaleDateString()}</div>
              </button>
            ))}
          </div>
          <div className="lg:col-span-7">
            <EmiCalculator initialPrice={project.price_min} defaultBank={selectedBank?.bank_id} />
          </div>
        </div>
      </section>

      {/* Units / Floor Plans */}
      <section className="bg-[#F3F0E9] py-20">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
          <div className="label-eyebrow mb-3">Configurations</div>
          <h2 className="font-display text-4xl sm:text-5xl mb-12">Floor plans & units.</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {(project.units || []).map((u, i) => (
              <div key={i} className="bg-white p-8 border border-[#E8E4D9]">
                <div className="font-display text-3xl text-[#06402B] mb-2">{u.type}</div>
                <div className="text-sm text-[#4A5D54] mb-5">{u.size_sqft} sqft · {u.availability}</div>
                <div className="aspect-[5/3] bg-[#F3F0E9] mb-5 flex items-center justify-center text-xs text-[#758A80]">
                  {u.floor_plan ? <img src={u.floor_plan} alt="" className="w-full h-full object-contain" /> : "Floor plan coming soon"}
                </div>
                <div className="flex items-baseline justify-between">
                  <div>
                    <div className="label-eyebrow mb-1">Price</div>
                    <div className="font-display text-2xl">{formatINR(u.price)}</div>
                  </div>
                  <a href="#inquire" className="text-xs tracking-widest uppercase text-[#B68D40]">Enquire →</a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Interior suggestion */}
      <section className="max-w-[1400px] mx-auto px-6 lg:px-12 py-20 grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
        <div>
          <div className="label-eyebrow mb-3">Move-in ready</div>
          <h2 className="font-display text-4xl sm:text-5xl mb-6 leading-tight">
            Design your home in <span className="italic text-[#B68D40]">{project.unit_types}</span>.
          </h2>
          <p className="text-[#4A5D54] mb-3">Estimated interior budget for this project:</p>
          <div className="font-display text-3xl text-[#06402B] mb-6">
            {formatINR(interiorBudget)} – {formatINR(interiorBudget * 2)}
          </div>
          <p className="text-sm text-[#4A5D54] mb-8 max-w-md">
            Based on average sqft and Homesqre's curated package range. Final pricing depends on materials and customisation.
          </p>
          <Link to="/interiors" className="btn-gold inline-flex">Design My Home <ChevronRight size={16} /></Link>
        </div>
        <img src="https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=1200&q=80" alt="" className="aspect-[5/4] object-cover" />
      </section>

      {/* Location map */}
      <section className="max-w-[1400px] mx-auto px-6 lg:px-12 py-10">
        <div className="label-eyebrow mb-3">Location</div>
        <h2 className="font-display text-4xl mb-6">{project.locality}, {project.city}</h2>
        <MapView items={[project]} center={[project.lat || 12.9716, project.lng || 77.5946]} zoom={14} height={420} />
      </section>

      <Footer />
      <StickyInquiryBar
        title={project.name}
        subtitle={project.builder_name}
        price={project.price_min}
        priceLabel="Starting from"
        project_id={project.project_id}
      />
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="border-t border-[#1A2421] pt-3">
      <div className="label-eyebrow mb-1">{label}</div>
      <div className="font-display text-xl text-[#1A2421]">{value || "—"}</div>
    </div>
  );
}
