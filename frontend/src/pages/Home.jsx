import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import api, { formatINR, formatApiError } from "@/lib/api";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import LeadCaptureModal from "@/components/LeadCaptureModal";
import { toast } from "sonner";
import {
  CalendarCheck,
  ShieldCheck,
  Home as HomeIcon,
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
  Check,
  X,
  ArrowRight,
  Sparkles,
  Clock,
  BadgeCheck,
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
  home: HomeIcon,
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

// ─── Interactive How It Works Steps ────────────────────────────────────────
const HOW_IT_WORKS_STEPS = [
  {
    number: "01",
    title: "Book & Retain",
    subtitle: "Starting from ₹10,000",
    description:
      "Sign up and pay a nominal, fully-adjustable design retainer. This small commitment unlocks your dedicated designer, your personal project dashboard, and the design journey. Every rupee is adjusted against your final execution cost.",
    badge: "Low Risk",
    icon: CreditCard,
    visual: {
      type: "dashboard",
      img: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=900&q=80",
      label: "Your design dashboard",
    },
  },
  {
    number: "02",
    title: "Briefing & Site Visit",
    subtitle: "We come to you",
    description:
      "Upload your floor plan and tell us about your lifestyle, preferences, and move-in timeline. Your dedicated designer conducts a thorough site visit — measuring every corner so the design is pixel-perfect to your actual space.",
    badge: "Personalised",
    icon: Hammer,
    visual: {
      type: "floorplan",
      img: "https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=900&q=80",
      label: "Floor plan to wireframe",
    },
  },
  {
    number: "03",
    title: "Unlimited 3D Renders",
    subtitle: "Until you love it",
    description:
      "This is where we are different. We create photorealistic 3D renders of every room. You review, suggest changes, and we revise — as many times as it takes. No caps, no extra charges. We only proceed to execution when you say yes.",
    badge: "Unlimited",
    icon: Palette,
    visual: {
      type: "render",
      img: "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=900&q=80",
      label: "Photorealistic 3D render",
    },
  },
  {
    number: "04",
    title: "Fixed Quote & 45-Day Build",
    subtitle: "Zero surprises",
    description:
      "Once you approve the final design, we issue a 100% fixed execution quote — no hidden charges, no inflation. Factory-precision manufacturing begins immediately. Your home is ready in 45 days, exactly as designed.",
    badge: "Guaranteed",
    icon: KeyRound,
    visual: {
      type: "completed",
      img: "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=900&q=80",
      label: "Factory-finish delivery",
    },
  },
];

// ─── Comparison table data ──────────────────────────────────────────────────
const COMPARISON = [
  {
    feature: "Initial commitment",
    them: "5–10% of total project\n(₹25,000–₹50,000+)",
    us: "Starting from ₹10,000\n(fully adjustable)",
  },
  {
    feature: "3D render revisions",
    them: "Capped at 2–3 iterations",
    us: "Unlimited until you love it",
  },
  {
    feature: "Costing accuracy",
    them: "\"Estimate\" — can inflate 20–30%",
    us: "100% fixed after design approval",
  },
  {
    feature: "Cancellation policy",
    them: "Strict — often non-refundable",
    us: "Exit before execution with no pressure",
  },
  {
    feature: "Design timeline",
    them: "Often 4–6 weeks before 3D",
    us: "3D renders within days of briefing",
  },
  {
    feature: "Execution delivery",
    them: "60–120 days, often delayed",
    us: "45 days. Guaranteed.",
  },
];

export default function Home() {
  const { user } = useAuth();
  const [content, setContent] = useState(null);
  const [tab, setTab] = useState("");
  const [bhk, setBhk] = useState("3BHK");
  const [tier, setTier] = useState("Standard");
  const [showLeadForm, setShowLeadForm] = useState(false);

  const dashHref =
    user?.role === "admin" ? "/dashboard/admin"
    : user?.role === "sales" ? "/dashboard/sales"
    : user?.role === "designer" ? "/dashboard/designer"
    : "/dashboard/customer";

  // Scroll-spy state for interactive "How It Works"
  const [activeStep, setActiveStep] = useState(0);
  const stepRefs = useRef([]);

  useEffect(() => {
    api.get("/content/interiors").then(({ data }) => {
      setContent(data);
      setTab(data.gallery?.[0]?.room || "");
    });
  }, []);

  // Intersection observer for scroll-triggered step activation
  useEffect(() => {
    const observers = stepRefs.current.map((ref, i) => {
      if (!ref) return null;
      const obs = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) setActiveStep(i);
        },
        { threshold: 0.5, rootMargin: "-20% 0px -20% 0px" }
      );
      obs.observe(ref);
      return obs;
    });
    return () => observers.forEach((o) => o?.disconnect());
  }, [content]);

  if (!content) {
    return (
      <div className="App">
        <Header />
        <div className="max-w-[1400px] mx-auto px-6 py-32 text-center font-display text-3xl">
          Loading…
        </div>
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


  return (
    <div className="App">
      <Header />

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section className="relative min-h-screen flex items-center overflow-hidden">
        <img
          src={content.hero?.backgrounds?.[0] || "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=1900&q=80"}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
        {/* Rich layered overlay */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#0C1D42]/95 via-[#0C1D42]/75 to-[#0C1D42]/30" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />

        <div className="relative z-10 max-w-[1400px] mx-auto w-full px-6 lg:px-12 py-32 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <div className="label-eyebrow text-[#DA9E3E] mb-4">
              Ready to begin?
            </div>
            <h1
              className="font-display text-white leading-[0.92] mb-8"
              style={{ fontSize: "clamp(3rem, 6vw, 5.5rem)" }}
              data-testid="interiors-headline"
            >
              See your home before
              <br />
              <span className="italic text-[#DA9E3E]">it's built.</span>
            </h1>
            <p className="text-white/80 text-lg max-w-xl mb-4 leading-relaxed">
              Start with a design retainer from ₹10,000 — fully adjustable against execution. No hidden costs. No pressure. Just your dream home, designed to perfection.
            </p>

            <div className="mt-8 lg:hidden">
              {user ? (
                <Link to={dashHref} className="btn-gold shadow-lg" data-testid="home-hero-cta">
                  GO TO DASHBOARD
                </Link>
              ) : (
                <button onClick={() => setShowLeadForm(true)} className="btn-gold shadow-lg" data-testid="home-hero-cta">
                  Start Designing Risk-Free
                </button>
              )}
            </div>
            {/* Trust Badges - New */}
            <div className="hidden lg:flex items-center gap-6 mt-6">
              <div className="flex flex-col">
                <div className="flex items-center gap-1 text-[#DA9E3E]">
                  <Star className="fill-current w-4 h-4" />
                  <Star className="fill-current w-4 h-4" />
                  <Star className="fill-current w-4 h-4" />
                  <Star className="fill-current w-4 h-4" />
                  <Star className="fill-current w-4 h-4" />
                </div>
                <span className="text-white/80 text-xs mt-1">Google Reviews 4.9/5</span>
              </div>
              <div className="h-8 w-px bg-white/20"></div>
              <div className="flex flex-col">
                <span className="text-white font-semibold tracking-wide">100+</span>
                <span className="text-white/80 text-xs">Homes Delivered</span>
              </div>
            </div>

            {/* Trust signals */}
            <div className="mt-12 space-y-4">
              {[
                "Unlimited 3D renders until you love it",
                "100% fixed execution quote after approval",
                "45-day delivery — factory precision",
                "10-year material warranty",
              ].map((item) => (
                <div key={item} className="flex items-center gap-3 text-white/80 text-sm font-medium tracking-wide">
                  <Check size={18} className="text-[#DA9E3E] shrink-0" />
                  {item}
                </div>
              ))}
            </div>
          </div>

          {/* Right — Floating Glass CTA (Desktop Only) */}
          <div className="hidden lg:flex bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl p-8 lg:p-12 shadow-2xl flex-col justify-center text-center h-fit self-center max-w-md mx-auto w-full relative overflow-hidden transform lg:-translate-y-4">
            <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none" />
            
            <div className="label-eyebrow text-[#DA9E3E] mb-4 relative tracking-[0.2em]">Free Design Consultation</div>
            <h3 className="font-display text-4xl text-white mb-6 relative drop-shadow-md">Ready to design your dream home?</h3>
            <p className="text-sm text-white/80 mb-8 relative font-light leading-relaxed">Begin our seamless onboarding process and get connected with an award-winning designer today.</p>
            
            {user ? (
              <Link to={dashHref} className="btn-gold w-full justify-center text-center relative shadow-[0_0_30px_rgba(218,158,62,0.25)] hover:shadow-[0_0_40px_rgba(218,158,62,0.4)] transition-all duration-300">
                GO TO DASHBOARD
              </Link>
            ) : (
              <button onClick={() => setShowLeadForm(true)} className="btn-gold w-full justify-center text-center relative shadow-[0_0_30px_rgba(218,158,62,0.25)] hover:shadow-[0_0_40px_rgba(218,158,62,0.4)] transition-all duration-300">
                START DESIGNING RISK-FREE
              </button>
            )}
            <p className="text-[10px] text-white/50 mt-4 leading-tight">Get a 100% fixed quote after design approval.<br/>Zero blind commitments. No bump-up pricing later.</p>
          </div>
        </div>
      </section>

      {/* ── PARADIGM SHIFT: US VS THEM ───────────────────────────────────── */}
      <section className="bg-[#0C1D42] text-[#FCFAF5] py-24">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
          <div className="text-center mb-16">
            <div className="label-eyebrow text-[#DA9E3E] mb-4">
              The Homesqre Difference
            </div>
            <h2 className="font-display text-5xl sm:text-6xl leading-tight max-w-3xl mx-auto">
              Why settle for{" "}
              <span className="italic text-[#DA9E3E]">blind commitments?</span>
            </h2>
            <p className="mt-6 text-[#FCFAF5]/70 max-w-2xl mx-auto text-lg leading-relaxed">
              Traditional studios ask you to pay lakhs before you see a single
              realistic render. We flipped the model — design first, execution
              only after you love every detail.
            </p>
          </div>

          {/* Comparison table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th className="text-left p-4 text-[#FCFAF5]/50 text-xs uppercase tracking-widest w-1/3">
                    What you care about
                  </th>
                  <th className="p-4 text-center">
                    <div className="bg-[#FCFAF5]/10 rounded px-4 py-2 inline-block">
                      <X size={16} className="inline-block mr-2 text-red-400" />
                      <span className="text-xs uppercase tracking-widest text-[#FCFAF5]/70">
                        Traditional Interior Firms
                      </span>
                    </div>
                  </th>
                  <th className="p-4 text-center relative">
                    <div className="absolute inset-0 bg-[#DA9E3E]/20 blur-xl rounded-full" />
                    <div className="bg-[#DA9E3E] border-2 border-[#F9C978] shadow-[0_0_20px_rgba(218,158,62,0.4)] rounded px-5 py-2.5 inline-block relative z-10 transform scale-110">
                      <Check size={18} className="inline-block mr-2 text-white font-bold" />
                      <span className="text-xs uppercase tracking-widest text-white font-bold">
                        Homesqre
                      </span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((row, i) => (
                  <tr
                    key={row.feature}
                    className={`border-t border-[#FCFAF5]/10 ${i % 2 === 0 ? "bg-[#FCFAF5]/5" : ""}`}
                  >
                    <td className="p-4 font-medium text-[#FCFAF5]/90">
                      {row.feature}
                    </td>
                    <td className="p-4 text-center text-[#FCFAF5]/55 text-xs whitespace-pre-line">
                      {row.them}
                    </td>
                    <td className="p-4 text-center text-[#DA9E3E] font-semibold text-xs whitespace-pre-line">
                      {row.us}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── INTERACTIVE HOW IT WORKS ─────────────────────────────────────── */}
      <section id="how-it-works" className="py-24 bg-[#FCFAF5]">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
          <div className="text-center mb-20">
            <div className="label-eyebrow mb-4">Process</div>
            <h2 className="font-display text-5xl sm:text-6xl">
              How it works.
            </h2>
            <p className="mt-6 text-[#333333] max-w-xl mx-auto leading-relaxed">
              A studio-quality experience — with radical transparency. Four clear
              steps from idea to move-in.
            </p>
          </div>

          {/* Desktop: sticky visual + scrolling steps */}
          <div className="hidden lg:flex gap-16 relative">
            {/* Sticky visual panel */}
            <div className="w-1/2 sticky top-24 self-start h-[520px]">
              {HOW_IT_WORKS_STEPS.map((step, i) => (
                <div
                  key={i}
                  className={`absolute inset-0 transition-all duration-700 ${
                    activeStep === i
                      ? "opacity-100 scale-100"
                      : "opacity-0 scale-95 pointer-events-none"
                  }`}
                >
                  <img
                    src={step.visual.img}
                    alt={step.visual.label}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                  <div className="absolute bottom-6 left-6 right-6">
                    <div className="inline-flex items-center gap-2 bg-[#DA9E3E] text-white text-xs tracking-widest uppercase px-3 py-1.5 font-semibold mb-3">
                      {step.badge}
                    </div>
                    <div className="text-white font-display text-2xl">
                      {step.visual.label}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Scrollable steps */}
            <div className="w-1/2 space-y-4">
              {HOW_IT_WORKS_STEPS.map((step, i) => {
                const Icon = step.icon;
                return (
                  <div
                    key={i}
                    ref={(el) => (stepRefs.current[i] = el)}
                    className={`p-10 border-l-4 transition-all duration-500 cursor-pointer ${
                      activeStep === i
                        ? "border-[#DA9E3E] bg-white shadow-lg"
                        : "border-transparent bg-[#F5EDE8] opacity-60 hover:opacity-80"
                    }`}
                    onClick={() => setActiveStep(i)}
                  >
                    <div className="flex items-start gap-6">
                      <div className="font-display text-4xl text-[#DA9E3E] leading-none w-12 shrink-0">
                        {step.number}
                      </div>
                      <div>
                        <div className="label-eyebrow text-[#DA9E3E] mb-1">
                          {step.subtitle}
                        </div>
                        <h3 className="font-display text-3xl text-[#333333] mb-3">
                          {step.title}
                        </h3>
                        <p className="text-[#333333] leading-relaxed text-sm">
                          {step.description}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Mobile: swipeable carousel */}
          <div className="lg:hidden">
            <div className="hs-carousel">
              {HOW_IT_WORKS_STEPS.map((step, i) => (
                <div key={i} className="hs-carousel-item bg-white border border-[#EDE5DB] overflow-hidden">
                  <div className="relative h-44">
                    <img src={step.visual.img} alt={step.visual.label} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                    <div className="absolute inset-0 flex items-end p-5">
                      <div>
                        <div className="font-display text-white/30 text-5xl leading-none mb-1">{step.number}</div>
                        <div className="inline-flex items-center gap-1 bg-[#DA9E3E] text-white text-[10px] tracking-widest uppercase px-2 py-1 font-semibold">
                          {step.badge}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="p-5">
                    <div className="label-eyebrow text-[#DA9E3E] mb-1">{step.subtitle}</div>
                    <h3 className="font-display text-xl text-[#333333] mb-2">{step.title}</h3>
                    <p className="text-[#333333] text-sm leading-relaxed">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-center text-[#333333] text-xs tracking-widest uppercase mt-3">
              swipe to explore
            </p>
          </div>
        </div>
      </section>

      {/* ── GALLERY ──────────────────────────────────────────────────────── */}
      <section className="bg-[#F5EDE8] py-24">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
          <div className="label-eyebrow mb-3">Design Gallery</div>
          <h2 className="font-display text-5xl mb-10">
            Real homes, beautifully done.
          </h2>
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
                  {(content.gallery || [])
                    .filter((g) => g.room === r)
                    .map((g) => (
                      <div
                        key={`${g.room}-${g.title}-${g.url}`}
                        className="group relative aspect-[4/5] overflow-hidden"
                      >
                        <img
                          src={g.url}
                          alt={g.title}
                          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent opacity-90" />
                        <div className="absolute bottom-0 left-0 right-0 p-6">
                          <div className="label-eyebrow text-[#DA9E3E] mb-1">
                            {g.room}
                          </div>
                          <div className="font-display text-2xl text-white">
                            {g.title}
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </section>

      {/* ── WHY CHOOSE US (STATS) ─────────────────────────────────────────── */}
      <section className="bg-[#333333] text-[#FCFAF5] py-20">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
          <div className="label-eyebrow text-[#DA9E3E] mb-3">Why Homesqre</div>
          <h2 className="font-display text-5xl mb-12">
            Built to make life easier.
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-px bg-[#FCFAF5]/10">
            {(content.why_choose_us || []).map((s) => {
              const Ic = ICONS[s.icon] || ShieldCheck;
              return (
                <div key={`${s.value}-${s.label}`} className="bg-[#333333] p-6 lg:p-8">
                  <Ic size={22} strokeWidth={1.5} className="text-[#DA9E3E] mb-5" />
                  <div className="font-display text-3xl mb-1">{s.value}</div>
                  <div className="text-xs tracking-widest uppercase text-[#FCFAF5]/60">
                    {s.label}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── COST ESTIMATOR ───────────────────────────────────────────────── */}
      <section className="max-w-[1400px] mx-auto px-6 lg:px-12 py-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
          <div>
            <div className="label-eyebrow mb-3">Cost Estimator</div>
            <h2 className="font-display text-5xl mb-6">What will it cost?</h2>
            <p className="text-[#333333] leading-relaxed mb-8">
              Pick your apartment size and package to see an estimated range.
              Final pricing is fixed only after design approval — no surprises.
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
                        bhk === b
                          ? "bg-[#0C1D42] text-white border-[#0C1D42]"
                          : "border-[#D4C9BE]"
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
                        tier === t
                          ? "bg-[#DA9E3E] text-white border-[#DA9E3E]"
                          : "border-[#D4C9BE]"
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
            <div className="label-eyebrow text-[#DA9E3E] mb-4">
              Estimated Range
            </div>
            <div className="font-display text-5xl lg:text-6xl mb-2 leading-none">
              {formatINR(costRange[0])}
            </div>
            <div className="text-[#FCFAF5]/70 text-lg mb-8">
              to {formatINR(costRange[1])}
            </div>
            <p className="text-sm text-[#FCFAF5]/70 mb-8">
              For a {bhk} home with the {tier} package, including design,
              manufacturing and installation.
            </p>
            {user ? (
              <Link
                to={dashHref}
                className="btn-gold w-full justify-center text-center relative shadow-[0_0_30px_rgba(218,158,62,0.25)] hover:shadow-[0_0_40px_rgba(218,158,62,0.4)] transition-all duration-300 flex items-center"
                data-testid="estimator-cta"
              >
                GO TO DASHBOARD
              </Link>
            ) : (
              <button
                onClick={() => setShowLeadForm(true)}
                className="btn-gold w-full justify-center text-center relative shadow-[0_0_30px_rgba(218,158,62,0.25)] hover:shadow-[0_0_40px_rgba(218,158,62,0.4)] transition-all duration-300"
                data-testid="estimator-cta"
              >
                START DESIGNING RISK-FREE
              </button>
            )}
            <p className="text-xs text-[#FCFAF5]/50 mt-4 text-center leading-relaxed">
              Get a 100% fixed quote after you approve the design.<br/>Zero blind commitments. No bump-up pricing later.
            </p>
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ─────────────────────────────────────────────────── */}
      <section className="bg-[#F5EDE8] py-24">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
          <div className="label-eyebrow mb-3">Testimonials</div>
          <h2 className="font-display text-5xl mb-12">
            Love letters from our clients.
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {(content.reviews || []).map((r) => (
              <div
                key={`${r.name}-${r.locality}`}
                className="bg-white p-8 border-l-2 border-[#DA9E3E]"
              >
                <div className="flex gap-0.5 mb-4">
                  {[...Array(r.rating || 5)].map((_, j) => (
                    <Star
                      key={`star-${r.name}-${j}`}
                      size={14}
                      className="text-[#DA9E3E] fill-[#DA9E3E]"
                    />
                  ))}
                </div>
                <p className="text-[#333333] leading-relaxed mb-5">
                  "{r.text}"
                </p>
                <div className="text-xs">
                  <div className="font-semibold">{r.name}</div>
                  <div className="text-[#456C9A] mt-0.5">
                    {r.flat} · {r.locality}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <section className="max-w-[1000px] mx-auto px-6 lg:px-12 py-24">
        <div className="label-eyebrow mb-3 text-center">FAQ</div>
        <h2 className="font-display text-5xl text-center mb-12">
          Good questions, good answers.
        </h2>
        <Accordion type="single" collapsible className="border-t border-[#EDE5DB]">
          {(content.faq || []).map((f) => (
            <AccordionItem
              key={f.q}
              value={f.q}
              className="border-b border-[#EDE5DB]"
            >
              <AccordionTrigger className="font-display text-xl text-left hover:no-underline">
                {f.q}
              </AccordionTrigger>
              <AccordionContent className="text-[#333333] leading-relaxed">
                {f.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      {/* ── FINAL CTA — The Close ─────────────────────────────────────────── */}
      <section className="relative min-h-[70vh] flex items-center justify-center overflow-hidden">
        <img
          src={
            content.final_cta?.background ||
            "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1900&q=80"
          }
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-[#0C1D42]/90" />
        <div className="relative z-10 w-full max-w-[1200px] mx-auto px-6 lg:px-12 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center py-24">
          <div>
            <div className="label-eyebrow text-[#DA9E3E] mb-4">
              Homesqre Interiors · Bangalore
            </div>
            <h2 className="font-display text-5xl sm:text-6xl mb-6 leading-tight">
              We design it first.
              <br />
              You approve.
              <br />
              <span className="italic text-[#DA9E3E]">Then we build.</span>
            </h2>
            <p className="text-white/75 text-lg leading-relaxed mb-8 max-w-xl">
              Experience your future home with{" "}
              <span className="text-[#DA9E3E] font-semibold">
                unlimited 3D renders
              </span>{" "}
              — no blind commitments, no hidden costs. The most transparent
              interior design process in Bangalore.
            </p>
            {/* Trust signals */}
            <div className="mt-8 flex flex-wrap gap-6">
              {[
                { icon: BadgeCheck, text: "45-Day Delivery" },
                { icon: Sparkles, text: "Unlimited Renders" },
                { icon: ShieldCheck, text: "10-Year Warranty" },
                { icon: Clock, text: "Fixed Quote. Zero Surprise." },
              ].map(({ icon: Icon, text }) => (
                <span
                  key={text}
                  className="flex items-center gap-2 text-white/70 text-xs tracking-widest uppercase"
                >
                  <Icon size={14} className="text-[#DA9E3E]" />
                  {text}
                </span>
              ))}
            </div>
          </div>
          
          <div className="text-center max-w-2xl mx-auto">
            <div className="label-eyebrow text-[#DA9E3E] mb-4 relative tracking-[0.2em]">Free Design Consultation</div>
            <h3 className="font-display text-4xl md:text-5xl text-white mb-6 relative drop-shadow-md">Ready to design your dream home?</h3>
            <p className="text-lg text-white/80 mb-10 relative font-light leading-relaxed">Begin our seamless onboarding process and get connected with an award-winning designer today.</p>
            
            {user ? (
              <Link to={dashHref} className="btn-gold px-10 py-5 text-sm justify-center text-center relative shadow-[0_0_30px_rgba(218,158,62,0.25)] hover:shadow-[0_0_40px_rgba(218,158,62,0.4)] transition-all duration-300">
                GO TO DASHBOARD
              </Link>
            ) : (
              <button onClick={() => setShowLeadForm(true)} className="btn-gold px-10 py-5 text-sm justify-center text-center relative shadow-[0_0_30px_rgba(218,158,62,0.25)] hover:shadow-[0_0_40px_rgba(218,158,62,0.4)] transition-all duration-300">
                START DESIGNING RISK-FREE
              </button>
            )}
            <p className="text-xs text-white/50 mt-6 leading-relaxed">Get a 100% fixed quote after design approval.<br/>Zero blind commitments. No bump-up pricing later.</p>
          </div>
        </div>
      </section>

      <Footer />

      {/* ── Sticky mobile bottom CTA ─────────────────────────────────── */}
      <div className="mobile-sticky-cta">
        <div>
          <p className="text-[#FCFAF5] font-display text-lg leading-tight">Free Consultation</p>
          <p className="text-[#DA9E3E] text-xs tracking-wide">Starting from ₹10,000</p>
        </div>
        {user ? (
          <Link
            to={dashHref}
            className="btn-gold"
            style={{ padding: "12px 22px", fontSize: "11px", minHeight: "auto" }}
            data-testid="sticky-cta-btn"
          >
            Dashboard
          </Link>
        ) : (
          <button
            onClick={() => setShowLeadForm(true)}
            className="btn-gold"
            style={{ padding: "12px 22px", fontSize: "11px", minHeight: "auto" }}
            data-testid="sticky-cta-btn"
          >
            Book Now
          </button>
        )}
      </div>

      <LeadCaptureModal open={showLeadForm} onOpenChange={setShowLeadForm} />
    </div>
  );
}
