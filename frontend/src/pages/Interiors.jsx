import { useEffect, useState } from "react";
import api, { formatINR, formatApiError } from "@/lib/api";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { toast } from "sonner";
import {
  CalendarCheck,
  ShieldCheck,
  Home,
  CreditCard,
  Palette,
  Hammer,
  Pencil,
  MessageCircle,
  KeyRound,
  ChefHat,
  Shirt,
  Lamp,
  Bath,
  Briefcase,
  Star,
} from "lucide-react";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";

const ICONS = {
  "message-circle": MessageCircle,
  "pencil-ruler": Pencil,
  hammer: Hammer,
  "key-round": KeyRound,
  home: Home,
  "chef-hat": ChefHat,
  shirt: Shirt,
  lamp: Lamp,
  bath: Bath,
  briefcase: Briefcase,
  "calendar-check": CalendarCheck,
  "shield-check": ShieldCheck,
  "credit-card": CreditCard,
  palette: Palette,
};

export default function Interiors() {
  const [content, setContent] = useState(null);
  const [tab, setTab] = useState("");
  const [bhk, setBhk] = useState("3BHK");
  const [tier, setTier] = useState("Standard");
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    whatsapp: true,
    property_type: "Apartment",
    flat_size: "",
    budget: "",
    style: "Contemporary",
    move_in: "",
    locality: "",
  });
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    api.get("/content/interiors").then(({ data }) => {
      setContent(data);
      setTab(data.gallery?.[0]?.room || "");
    });
  }, []);

  if (!content) {
    return (
      <div className="App">
        <Header />
        <div className="max-w-[1400px] mx-auto px-6 py-32 text-center font-display text-3xl">Loading…</div>
        <Footer />
      </div>
    );
  }

  const rooms = [...new Set((content.gallery || []).map((g) => g.room))];
  const rawRange = content.cost_matrix?.[bhk]?.[tier];
  const costRange = Array.isArray(rawRange)
    ? rawRange
    : typeof rawRange === "number"
    ? [rawRange, rawRange]
    : [0, 0];

  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post("/interior-leads", form);
      toast.success("Thank you! Our designer will reach out shortly.");
      setShowForm(false);
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  return (
    <div className="App">
      <Header />

      {/* Hero */}
      <section className="relative min-h-[88vh] grid grid-cols-1 lg:grid-cols-12 items-stretch">
        <div className="lg:col-span-8 relative min-h-[60vh] lg:min-h-[88vh]">
          <img src={content.hero?.backgrounds?.[0]} alt="" className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-tr from-black/55 to-transparent" />
          <div className="relative z-10 h-full flex flex-col justify-end p-8 lg:p-20 text-white">
            {content.hero?.show_offer && content.hero?.offer && (
              <div className="inline-flex items-center gap-2 self-start bg-[#DA9E3E] text-white text-xs tracking-widest uppercase px-3 py-2 mb-6 font-semibold">
                {content.hero.offer}
              </div>
            )}
            <div className="label-eyebrow text-[#DA9E3E] mb-5">Homesqre Interiors</div>
            <h1 className="font-display text-5xl sm:text-6xl lg:text-[88px] leading-[0.95] max-w-3xl" data-testid="interiors-headline">
              {(content.hero?.headline || "Interiors that feel like home.").split(" ").slice(0, -1).join(" ")}{" "}
              <span className="italic text-[#DA9E3E]">{(content.hero?.headline || "Interiors that feel like home.").split(" ").slice(-1)}</span>
            </h1>
            <p className="text-white/85 mt-6 max-w-xl text-lg">{content.hero?.subheadline || ""}</p>
            <div className="mt-8">
              <button onClick={() => setShowForm(true)} className="btn-gold" data-testid="interior-hero-cta">
                {content.hero?.cta || "Get a Free Design Consultation"}
              </button>
            </div>
          </div>
        </div>

        {/* Sticky form (desktop) */}
        <aside className="lg:col-span-4 bg-[#FCFAF5] p-8 lg:p-12 flex flex-col justify-center">
          <InteriorForm form={form} setForm={setForm} onSubmit={submit} />
        </aside>
      </section>

      {/* How it works */}
      <section className="max-w-[1400px] mx-auto px-6 lg:px-12 py-24">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 mb-12 items-end">
          <div className="lg:col-span-7">
            <div className="label-eyebrow mb-3">Process</div>
            <h2 className="font-display text-5xl">How it works.</h2>
          </div>
          <p className="lg:col-span-5 text-[#333333] leading-relaxed">
            A studio-quality experience — without the studio drama. Four clear steps from idea to handover.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-px bg-[#EDE5DB] border border-[#EDE5DB]">
          {(content.how_it_works || []).map((s) => {
            const Ic = ICONS[s.icon] || Home;
            return (
              <div key={`step-${s.step}`} className="bg-white p-8">
                <div className="font-display text-5xl text-[#DA9E3E] mb-4">0{s.step}</div>
                <Ic size={22} strokeWidth={1.5} className="text-[#0C1D42] mb-4" />
                <div className="font-display text-2xl mb-2">{s.title}</div>
                <p className="text-sm text-[#333333]">{s.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Gallery */}
      <section className="bg-[#F5EDE8] py-24">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
          <div className="label-eyebrow mb-3">Design Gallery</div>
          <h2 className="font-display text-5xl mb-10">Real homes, beautifully done.</h2>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="flex flex-wrap justify-start gap-2 bg-transparent p-0 h-auto mb-8">
              {rooms.map((r) => (
                <TabsTrigger
                  key={r}
                  value={r}
                  className="data-[state=active]:bg-[#0C1D42] data-[state=active]:text-white border border-[#D4C9BE] rounded-none px-5 py-2 text-xs tracking-widest uppercase"
                  data-testid={`tab-${r.replace(/\s/g, "-").toLowerCase()}`}
                >
                  {r}
                </TabsTrigger>
              ))}
            </TabsList>
            {rooms.map((r) => (
              <TabsContent key={r} value={r}>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {(content.gallery || []).filter((g) => g.room === r).map((g) => (
                    <div key={`${g.room}-${g.title}-${g.url}`} className="group relative aspect-[4/5] overflow-hidden">
                      <img src={g.url} alt={g.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent opacity-90" />
                      <div className="absolute bottom-0 left-0 right-0 p-6">
                        <div className="label-eyebrow text-[#DA9E3E] mb-1">{g.room}</div>
                        <div className="font-display text-2xl text-white">{g.title}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </section>

      {/* Services */}
      <section className="max-w-[1400px] mx-auto px-6 lg:px-12 py-24">
        <div className="label-eyebrow mb-3">Services</div>
        <h2 className="font-display text-5xl mb-12">Everything, end-to-end.</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {(content.services || []).map((s) => {
            const Ic = ICONS[s.icon] || Home;
            return (
              <div key={s.title} className="bg-white border border-[#EDE5DB] p-8 group hover:bg-[#0C1D42] hover:text-white transition-colors">
                <Ic size={26} strokeWidth={1.5} className="text-[#DA9E3E] mb-5" />
                <div className="font-display text-2xl mb-2">{s.title}</div>
                <p className="text-sm text-[#333333] group-hover:text-white/70">{s.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Why us */}
      <section className="bg-[#0C1D42] text-[#FCFAF5] py-20">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
          <div className="label-eyebrow text-[#DA9E3E] mb-3">Why Homesqre</div>
          <h2 className="font-display text-5xl mb-12">Built to make life easier.</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-px bg-[#FCFAF5]/15">
            {(content.why_choose_us || []).map((s) => {
              const Ic = ICONS[s.icon] || ShieldCheck;
              return (
                <div key={`${s.value}-${s.label}`} className="bg-[#0C1D42] p-6 lg:p-8">
                  <Ic size={22} strokeWidth={1.5} className="text-[#DA9E3E] mb-5" />
                  <div className="font-display text-3xl mb-1">{s.value}</div>
                  <div className="text-xs tracking-widest uppercase text-[#FCFAF5]/70">{s.label}</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Cost Estimator */}
      <section className="max-w-[1400px] mx-auto px-6 lg:px-12 py-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
          <div>
            <div className="label-eyebrow mb-3">Cost Estimator</div>
            <h2 className="font-display text-5xl mb-6">What will it cost?</h2>
            <p className="text-[#333333] leading-relaxed mb-8">
              Pick your apartment size and package to see an estimated range. Final pricing depends on materials,
              customisation, and add-ons.
            </p>
            <div className="space-y-6">
              <div>
                <label className="label-eyebrow mb-3 block">Apartment size</label>
                <div className="flex flex-wrap gap-2">
                  {Object.keys(content.cost_matrix || {}).map((b) => (
                    <button
                      key={b}
                      onClick={() => setBhk(b)}
                      className={`px-4 py-2 text-xs tracking-widest uppercase border ${
                        bhk === b ? "bg-[#0C1D42] text-white border-[#0C1D42]" : "border-[#D4C9BE]"
                      }`}
                      data-testid={`bhk-${b}`}
                    >
                      {b}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label-eyebrow mb-3 block">Package tier</label>
                <div className="flex flex-wrap gap-2">
                  {["Basic", "Standard", "Premium"].map((t) => (
                    <button
                      key={t}
                      onClick={() => setTier(t)}
                      className={`px-4 py-2 text-xs tracking-widest uppercase border ${
                        tier === t ? "bg-[#DA9E3E] text-white border-[#DA9E3E]" : "border-[#D4C9BE]"
                      }`}
                      data-testid={`tier-${t}`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="bg-[#0C1D42] text-[#FCFAF5] p-10 lg:p-12">
            <div className="label-eyebrow text-[#DA9E3E] mb-4">Estimated Range</div>
            <div className="font-display text-5xl lg:text-6xl mb-2 leading-none">
              {formatINR(costRange[0])}
            </div>
            <div className="text-[#FCFAF5]/70 text-lg mb-8">to {formatINR(costRange[1])}</div>
            <p className="text-sm text-[#FCFAF5]/70 mb-8">
              For a {bhk} home with the {tier} package, including design, manufacturing and installation.
            </p>
            <button onClick={() => setShowForm(true)} className="btn-gold w-full justify-center" data-testid="estimator-cta">
              Get a detailed quote
            </button>
          </div>
        </div>
      </section>

      {/* Reviews */}
      <section className="bg-[#F5EDE8] py-24">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
          <div className="label-eyebrow mb-3">Testimonials</div>
          <h2 className="font-display text-5xl mb-12">Love letters from our clients.</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {(content.reviews || []).map((r) => (
              <div key={`${r.name}-${r.locality}`} className="bg-white p-8 border-l-2 border-[#DA9E3E]">
                <div className="flex gap-0.5 mb-4">
                  {[...Array(r.rating || 5)].map((_, j) => (
                    <Star key={`star-${r.name}-${j}`} size={14} className="text-[#DA9E3E] fill-[#DA9E3E]" />
                  ))}
                </div>
                <p className="text-[#0C1D42] leading-relaxed mb-5">"{r.text}"</p>
                <div className="text-xs">
                  <div className="font-semibold">{r.name}</div>
                  <div className="text-[#666666] mt-0.5">{r.flat} · {r.locality}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-[1000px] mx-auto px-6 lg:px-12 py-24">
        <div className="label-eyebrow mb-3 text-center">FAQ</div>
        <h2 className="font-display text-5xl text-center mb-12">Good questions, good answers.</h2>
        <Accordion type="single" collapsible className="border-t border-[#EDE5DB]">
          {(content.faq || []).map((f) => (
            <AccordionItem key={f.q} value={f.q} className="border-b border-[#EDE5DB]">
              <AccordionTrigger className="font-display text-xl text-left hover:no-underline">{f.q}</AccordionTrigger>
              <AccordionContent className="text-[#333333] leading-relaxed">{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      {/* Final CTA */}
      <section className="relative min-h-[60vh] flex items-center justify-center">
        <img src={content.final_cta?.background} alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-[#0C1D42]/85" />
        <div className="relative z-10 text-center text-white max-w-3xl px-6">
          <div className="label-eyebrow text-[#DA9E3E] mb-4">Let's begin</div>
          <h2 className="font-display text-5xl sm:text-6xl mb-6 leading-tight">{content.final_cta?.headline || "Ready to design your dream home?"}</h2>
          <p className="text-white/80 mb-10 text-lg">{content.final_cta?.subtext || ""}</p>
          <button onClick={() => setShowForm(true)} className="btn-gold" data-testid="final-cta">{content.final_cta?.cta || "Book Free Consultation"}</button>
        </div>
      </section>

      <Footer />

      {showForm && (
        <div className="fixed inset-0 z-[100] bg-black/60 flex items-end sm:items-center justify-center p-4">
          <div className="bg-[#FCFAF5] w-full sm:max-w-xl max-h-[90vh] overflow-auto">
            <div className="p-6 border-b border-[#EDE5DB] flex items-center justify-between">
              <div className="font-display text-2xl">Tell us about your home</div>
              <button onClick={() => setShowForm(false)} className="text-2xl">×</button>
            </div>
            <div className="p-6">
              <InteriorForm form={form} setForm={setForm} onSubmit={submit} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InteriorForm({ form, setForm, onSubmit }) {
  return (
    <form onSubmit={onSubmit} className="space-y-5" data-testid="interior-form">
      <div>
        <div className="label-eyebrow mb-2">Free Design Consultation</div>
        <h3 className="font-display text-3xl">Book a designer.</h3>
      </div>
      <input className="hs-input" placeholder="Full name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="int-name" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <input className="hs-input" placeholder="Phone" required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} data-testid="int-phone" />
        <input className="hs-input" placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="int-email" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <select className="hs-input" value={form.property_type} onChange={(e) => setForm({ ...form, property_type: e.target.value })}>
          <option>Apartment</option><option>Villa</option><option>Independent House</option>
        </select>
        <input className="hs-input" placeholder="Flat size (sqft)" value={form.flat_size} onChange={(e) => setForm({ ...form, flat_size: e.target.value })} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <input className="hs-input" placeholder="Budget (₹)" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} />
        <input className="hs-input" placeholder="Locality" value={form.locality} onChange={(e) => setForm({ ...form, locality: e.target.value })} />
      </div>
      <label className="flex items-center gap-2 text-sm text-[#333333]">
        <input type="checkbox" checked={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.checked })} /> Updates on WhatsApp
      </label>
      <button className="btn-primary w-full justify-center" data-testid="int-submit">Book Free Consultation</button>
    </form>
  );
}
