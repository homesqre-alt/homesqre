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
              <div className="label-eyebrow text-[#DA9E3E] mb-4">{project.builder_name}</div>
              <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl leading-[1.02] mb-5">{project.name}</h1>
              <p className="text-white/85 text-lg max-w-2xl mb-6 italic">{project.tagline}</p>
              <div className="flex flex-wrap items-center gap-x-8 gap-y-3 text-sm text-white/80">
                <span className="flex items-center gap-2">
                  <MapPin size={14} strokeWidth={1.5} className="text-[#DA9E3E]" /> {project.locality}, {project.city}
                </span>
                <span className="flex items-center gap-2">
                  <Building size={14} strokeWidth={1.5} className="text-[#DA9E3E]" /> {project.unit_types}
                </span>
                <span className="flex items-center gap-2">
                  <Calendar size={14} strokeWidth={1.5} className="text-[#DA9E3E]" /> Updated {new Date(project.last_updated).toLocaleDateString()}
                </span>
              </div>
            </div>
            <div className="lg:col-span-4">
              <div className="bg-[#FCFAF5] border-l-2 border-[#DA9E3E] p-6">
                <div className="label-eyebrow mb-2">Starting from</div>
                <div className="font-display text-4xl text-[#0C1D42] mb-2">{formatINR(project.price_min)}</div>
                <div className="text-xs text-[#333333]">Up to {formatINR(project.price_max)}</div>
                {project.rera_number && (
                  <div className="mt-5 pt-5 border-t border-[#EDE5DB] flex items-center gap-2 text-xs">
                    <ShieldCheck size={14} strokeWidth={1.5} className="text-[#0C1D42]" />
                    <div>
                      <div className="label-eyebrow">RERA Verified</div>
                      <div className="text-[#0C1D42] font-mono mt-1 text-[10px]">{project.rera_number}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Body — 2-column layout with sticky inquiry rail on desktop */}
      <div className="max-w-[1400px] mx-auto px-6 lg:px-12 py-16 lg:py-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-start">
          {/* LEFT — scrollable content */}
          <main className="lg:col-span-8 space-y-20">
            {/* Overview */}
            <section id="overview">
              <div className="label-eyebrow mb-3">Project Overview</div>
              <h2 className="font-display text-4xl sm:text-5xl mb-6">A new chapter, beautifully written.</h2>
              <p className="text-[#0C1D42] leading-relaxed mb-8">{project.description}</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <Stat label="Unit Types" value={project.unit_types} />
                <Stat label="Sqft Range" value={`${project.sqft_min}–${project.sqft_max}`} />
                <Stat label="Approvals" value={(project.approvals || []).join(", ")} />
                <Stat label="RERA State" value={project.rera_state} />
              </div>
            </section>

            {/* Configurations / Floor Plans */}
            <section id="configurations">
              <div className="label-eyebrow mb-3">Configurations</div>
              <h2 className="font-display text-4xl sm:text-5xl mb-10">Floor plans & units.</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {(project.units || []).map((u, i) => (
                  <div key={i} className="bg-[#FCFAF5] p-7 border border-[#EDE5DB]">
                    <div className="font-display text-3xl text-[#0C1D42] mb-2">{u.type}</div>
                    <div className="text-sm text-[#333333] mb-5">{u.size_sqft} sqft · {u.availability}</div>
                    <div className="aspect-[5/3] bg-white border border-[#EDE5DB] mb-5 flex items-center justify-center text-xs text-[#666666]">
                      {u.floor_plan ? <img src={u.floor_plan} alt="" className="w-full h-full object-contain" /> : "Floor plan coming soon"}
                    </div>
                    <div className="flex items-baseline justify-between">
                      <div>
                        <div className="label-eyebrow mb-1">Price</div>
                        <div className="font-display text-2xl">{formatINR(u.price)}</div>
                      </div>
                      <a href="#inquire" className="text-xs tracking-widest uppercase text-[#DA9E3E]">Enquire →</a>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Amenities */}
            <section id="amenities">
              <div className="label-eyebrow mb-3">Lifestyle</div>
              <h2 className="font-display text-4xl sm:text-5xl mb-10">Amenities crafted around you.</h2>
              <div className="space-y-8">
                {Object.entries(amByCat).map(([cat, items]) => (
                  <div key={cat}>
                    <div className="font-display text-xl text-[#0C1D42] mb-3 flex items-center gap-3">
                      {cat}
                      <span className="flex-1 h-px bg-[#D4C9BE]" />
                      <span className="label-eyebrow">{items.length}</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {items.map((a) => (
                        <div key={a.amenity_id} className="bg-[#FCFAF5] border-l-2 border-[#DA9E3E] p-3 text-sm text-[#0C1D42]">
                          {a.name}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Location */}
            <section id="location">
              <div className="label-eyebrow mb-3">Location</div>
              <h2 className="font-display text-4xl sm:text-5xl mb-6">{project.locality}, {project.city}</h2>
              <MapView items={[project]} center={[project.lat || 12.9716, project.lng || 77.5946]} zoom={14} height={360} />
            </section>

            {/* Banks + EMI */}
            <section id="loans">
              <div className="label-eyebrow mb-3">Home Loans</div>
              <h2 className="font-display text-4xl sm:text-5xl mb-10">Approved bank partners.</h2>
              <div className="space-y-3 mb-8">
                {banks.map((b) => (
                  <button
                    key={b.bank_id}
                    onClick={() => setSelectedBank(b)}
                    className={`w-full text-left p-5 border transition-all ${
                      selectedBank?.bank_id === b.bank_id
                        ? "border-[#0C1D42] bg-white shadow-sm"
                        : "border-[#EDE5DB] bg-white/60 hover:bg-white"
                    }`}
                    data-testid={`bank-${b.bank_id}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-display text-xl">{b.name}</span>
                      <span className="text-xs text-[#DA9E3E] tracking-widest uppercase">{b.rate_min}% – {b.rate_max}%</span>
                    </div>
                    <div className="text-xs text-[#333333]">Floating rate · Last updated {new Date().toLocaleDateString()}</div>
                  </button>
                ))}
              </div>
              <EmiCalculator initialPrice={project.price_min} defaultBank={selectedBank?.bank_id} />
            </section>

            {/* Interior add-on */}
            <section id="interiors" className="bg-[#F5EDE8] -mx-6 lg:-mx-12 px-6 lg:px-12 py-14">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
                <div>
                  <div className="label-eyebrow mb-3">Move-in ready</div>
                  <h2 className="font-display text-3xl sm:text-4xl mb-5 leading-tight">
                    Design your home in <span className="italic text-[#DA9E3E]">{project.unit_types}</span>.
                  </h2>
                  <p className="text-[#333333] mb-2">Estimated interior budget:</p>
                  <div className="font-display text-2xl text-[#0C1D42] mb-5">
                    {formatINR(interiorBudget)} – {formatINR(interiorBudget * 2)}
                  </div>
                  <Link to="/interiors" className="btn-gold inline-flex">Design My Home <ChevronRight size={16} /></Link>
                </div>
                <img src="https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=1200&q=80" alt="" className="aspect-[5/4] object-cover w-full" />
              </div>
            </section>
          </main>

          {/* RIGHT — sticky inquiry form (desktop) */}
          <aside className="hidden lg:block lg:col-span-4">
            <div className="sticky top-24" id="inquire" data-testid="microsite-sticky-inquiry">
              <InquiryForm
                project_id={project.project_id}
                title={`Enquire about ${project.name}`}
                compact
              />
            </div>
          </aside>

          {/* Mobile inline inquiry form (above the fold of content) */}
          <div className="lg:hidden order-first" id="inquire-mobile">
            <InquiryForm project_id={project.project_id} title={`Enquire about ${project.name}`} compact />
          </div>
        </div>
      </div>

      <Footer />
      <StickyInquiryBar
        title={project.name}
        subtitle={project.builder_name}
        price={project.price_min}
        priceLabel="Starting from"
        project_id={project.project_id}
        mobileOnly
      />
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="border-t border-[#0C1D42] pt-3">
      <div className="label-eyebrow mb-1">{label}</div>
      <div className="font-display text-xl text-[#0C1D42]">{value || "—"}</div>
    </div>
  );
}
