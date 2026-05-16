import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import SearchBar from "@/components/SearchBar";
import PropertyCard from "@/components/PropertyCard";
import ProjectCard from "@/components/ProjectCard";
import { ShieldCheck, Sparkles, Compass, ArrowRight } from "lucide-react";

const HERO_IMG = "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1900&q=80";

export default function Home() {
  const [featuredProjects, setFeaturedProjects] = useState([]);
  const [featuredListings, setFeaturedListings] = useState([]);
  const [localities, setLocalities] = useState([]);

  useEffect(() => {
    api.get("/projects", { params: { featured: true, limit: 6 } }).then(({ data }) => setFeaturedProjects(data || []));
    api.get("/listings", { params: { featured: true, limit: 8 } }).then(({ data }) => setFeaturedListings(data || []));
    api.get("/localities", { params: { city: "Bangalore" } }).then(({ data }) => setLocalities((data || []).slice(0, 8)));
  }, []);

  return (
    <div className="App">
      <Header />

      {/* Hero */}
      <section className="relative min-h-[88vh] flex items-end overflow-hidden">
        <img src={HERO_IMG} alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/40 to-black/70" />
        <div className="absolute inset-0 hs-noise opacity-40 mix-blend-overlay" />
        <div className="relative z-10 max-w-[1400px] mx-auto w-full px-6 lg:px-12 pb-16 lg:pb-24">
          <div className="max-w-3xl">
            <div className="text-[11px] tracking-[0.3em] uppercase text-[#B68D40] mb-6 font-semibold">
              Bangalore · Curated Real Estate
            </div>
            <h1 className="font-display text-white text-5xl sm:text-6xl lg:text-[88px] leading-[0.95] mb-8" data-testid="hero-headline">
              The home that fits<br />
              <span className="italic text-[#B68D40]">your life.</span>
            </h1>
            <p className="text-white/80 text-base sm:text-lg max-w-xl mb-10 leading-relaxed">
              Discover premium apartments, villas and pre-launch projects across India's most loved city —
              verified, transparent and beautifully presented.
            </p>
          </div>

          <div className="max-w-4xl">
            <SearchBar />
          </div>

          <div className="mt-10 flex flex-wrap items-center gap-x-10 gap-y-3 text-white/80 text-xs tracking-widest uppercase">
            <span className="flex items-center gap-2">
              <ShieldCheck size={14} strokeWidth={1.5} className="text-[#B68D40]" /> RERA Verified
            </span>
            <span className="flex items-center gap-2">
              <Sparkles size={14} strokeWidth={1.5} className="text-[#B68D40]" /> 1200+ Listings
            </span>
            <span className="flex items-center gap-2">
              <Compass size={14} strokeWidth={1.5} className="text-[#B68D40]" /> 50+ Localities
            </span>
          </div>
        </div>
      </section>

      {/* Featured Projects */}
      <section className="max-w-[1400px] mx-auto px-6 lg:px-12 py-20 lg:py-28">
        <div className="flex items-end justify-between mb-12">
          <div>
            <div className="label-eyebrow mb-3">Featured · This Week</div>
            <h2 className="font-display text-4xl sm:text-5xl text-[#1A2421]">Hand-picked projects</h2>
          </div>
          <Link to="/projects" className="hidden sm:inline-flex items-center gap-2 text-[#06402B] text-sm tracking-widest uppercase hover:text-[#B68D40]">
            View all <ArrowRight size={14} />
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {featuredProjects.map((p) => <ProjectCard key={p.project_id} project={p} />)}
        </div>
      </section>

      {/* Localities */}
      <section className="bg-[#F3F0E9] py-20 lg:py-28">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 items-end mb-12">
            <div className="lg:col-span-7">
              <div className="label-eyebrow mb-3">Bangalore</div>
              <h2 className="font-display text-4xl sm:text-5xl lg:text-6xl leading-[1.05]">
                A city of <span className="italic text-[#B68D40]">neighbourhoods.</span>
              </h2>
            </div>
            <p className="lg:col-span-5 text-[#4A5D54] leading-relaxed">
              From the tech corridors of Whitefield and Sarjapur to the leafy charm of Indiranagar, find homes in
              the localities that match your rhythm.
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 lg:gap-6">
            {localities.map((loc, i) => (
              <Link
                key={loc.locality_id}
                to={`/properties?locality=${encodeURIComponent(loc.name)}`}
                className="group relative aspect-[4/5] overflow-hidden border border-[#D1CFC7]"
                data-testid={`locality-${loc.slug}`}
              >
                <img
                  src={`https://images.unsplash.com/photo-${
                    ["1564013799919-ab600027ffc6", "1605276374104-dee2a0ed3cd6", "1582407947304-fd86f028f716", "1519642918688-7e43b19245d8", "1518607183659-5c44d7c1cab2", "1571055107559-3e67626fa8be", "1572120360610-d971b9d7767c", "1554995207-c18c203602cb"][i % 8]
                  }?auto=format&fit=crop&w=600&q=70`}
                  alt={loc.name}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-4">
                  <div className="font-display text-white text-2xl">{loc.name}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Listings */}
      <section className="max-w-[1400px] mx-auto px-6 lg:px-12 py-20 lg:py-28">
        <div className="flex items-end justify-between mb-12">
          <div>
            <div className="label-eyebrow mb-3">Live Listings</div>
            <h2 className="font-display text-4xl sm:text-5xl text-[#1A2421]">Homes you'll love</h2>
          </div>
          <Link to="/properties" className="hidden sm:inline-flex items-center gap-2 text-[#06402B] text-sm tracking-widest uppercase hover:text-[#B68D40]">
            Browse all <ArrowRight size={14} />
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
          {featuredListings.map((l) => <PropertyCard key={l.listing_id} listing={l} />)}
        </div>
      </section>

      {/* Interior CTA */}
      <section className="relative overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-2">
          <div className="bg-[#06402B] text-[#FAF9F6] p-10 lg:p-20 flex flex-col justify-center">
            <div className="label-eyebrow text-[#B68D40] mb-4">Homesqre Interiors</div>
            <h2 className="font-display text-4xl sm:text-5xl lg:text-6xl leading-[1.05] mb-6">
              Move-in ready in <span className="italic text-[#B68D40]">45 days.</span>
            </h2>
            <p className="text-[#FAF9F6]/80 leading-relaxed mb-8 max-w-md">
              End-to-end interior design and execution. Award-winning designers, modular factory finish, 10-year
              warranty.
            </p>
            <div>
              <Link to="/interiors" className="btn-gold">Explore Interiors</Link>
            </div>
          </div>
          <div className="aspect-square md:aspect-auto md:min-h-[480px] relative">
            <img
              src="https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=1400&q=80"
              alt="Interior"
              className="absolute inset-0 w-full h-full object-cover"
            />
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
