import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { Navigate } from "react-router-dom";
import DashShell from "@/components/layout/DashShell";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import CustomerDesignReview from "@/components/customer/CustomerDesignReview";

export default function CustomerDashboard() {
  const { user, refresh } = useAuth();

  // Project phase is driven by `user.project_phase` on the server.
  // We keep a local mirror so dev-mode toggles can preview UI without a round-trip.
  const [currentPhase, setCurrentPhase] = useState(user?.project_phase || "unpaid");
  const [callStatus, setCallStatus] = useState("none"); 

  // Keep the local phase in sync if the user record updates (e.g. after refresh()).
  useEffect(() => {
    if (user?.project_phase) setCurrentPhase(user.project_phase);
  }, [user?.project_phase]);

  // Onboarding Form States (Phase 1)
  const [budgetType, setBudgetType] = useState("");
  const [customBudget, setCustomBudget] = useState("");
  const [styles, setStyles] = useState({ design: "" });
  const [roomRequirements, setRoomRequirements] = useState("");

  // Floor plan upload state (Briefing phase)
  // Supports multiple files. Each entry: { url, name, file_id }
  const [floorPlans, setFloorPlans] = useState([]);
  const [isUploadingPlan, setIsUploadingPlan] = useState(false);
  const [projectName, setProjectName] = useState(user?.project_name || "");
  const [siteVisitInput, setSiteVisitInput] = useState("");

  // Modal States
  const [isDiscoveryOpen, setIsDiscoveryOpen] = useState(false); 
  const [isLoading, setIsLoading] = useState(false);
  
  // Form Details (kept for Discovery Call & Briefing forms)
  const [billingDetails, setBillingDetails] = useState({
    name: user?.name || "",
    email: user?.email || "",
    phone: "",
    address: ""
  });

  // Available packages (kept in sync with backend packages.py)
  const PACKAGE_CATALOGUE = useMemo(() => ([
    {
      group: "Apartment / Flat",
      property_type: "apartment",
      options: [
        { value: "1-2", label: "1–2 BHK", price: 10000, blurb: "Compact apartments up to 2 bedrooms." },
        { value: "3",   label: "3 BHK",   price: 12000, blurb: "Mid-size families. Most popular package." },
        { value: "4+",  label: "4+ BHK",  price: 15000, blurb: "Large apartments / penthouse layouts." },
      ],
    },
    {
      group: "Villa",
      property_type: "villa",
      options: [
        { value: "duplex",  label: "Duplex Villa",   price: 15000, blurb: "Two-storey independent villa." },
        { value: "triplex", label: "Triplex / Luxury", price: 18000, blurb: "Three-storey or luxury villa." },
      ],
    },
    {
      group: "Independent / Rental",
      property_type: "independent",
      options: [
        { value: "1", label: "1 unit",  price: 12000, blurb: "Single rental / studio." },
        { value: "2", label: "2 units", price: 20000, blurb: "Duplex rental." },
        { value: "3", label: "3 units", price: 20000, blurb: "Triple rental." },
        { value: "4", label: "4 units", price: 24000, blurb: "Quad rental." },
        { value: "5", label: "5 units", price: 30000, blurb: "5-unit rental block." },
      ],
    },
  ]), []);

  // Selected package (in unpaid phase)
  const [selectedPkg, setSelectedPkg] = useState(null); // { property_type, value, label, price, blurb }
  // Briefing phase still needs property/BHK; default from selected pkg if any.
  const [propertyType, setPropertyType] = useState("apartment");
  const [bhkType, setBhkType] = useState("1-2");
  const [villaType, setVillaType] = useState("duplex");
  const [unitCount, setUnitCount] = useState(1);

  // The price the customer is paying (driven by the selected package)
  const calculatedPrice = selectedPkg?.price || 0;

  if (user === undefined) return null;
  if (user === null) return <Navigate to="/login" />;

  const INTERIOR_LINKS = [
    { to: "/dashboard/customer", label: "My Project" },
    { to: "/designs", label: "Designs & Renders" },
    { to: "/invoices", label: "Quotations & Billing" },
  ];

  const renderStyleCard = (styleName, description) => {
    const isSelected = styles.design === styleName;
    return (
      <div 
        onClick={() => setStyles({ design: styleName })}
        className={`border p-4 cursor-pointer transition ${isSelected ? 'border-[#06402B] bg-[#F3F0E9] ring-1 ring-[#06402B]' : 'border-[#E8E4D9] hover:border-[#B68D40]'}`}
      >
        <div className="w-full h-24 bg-gray-200 mb-3 flex items-center justify-center text-xs text-gray-400">
          [Image: {styleName}]
        </div>
        <h4 className="font-medium text-[#06402B] text-sm">{styleName}</h4>
        <p className="text-xs text-[#4A5D54] mt-1">{description}</p>
      </div>
    );
  };

  // --- API HANDLERS ---
  
  const handleDiscoverySubmit = async () => {
    if (!billingDetails.name || !billingDetails.phone) {
      toast.error("Please provide both name and phone number.");
      return;
    }
    setIsLoading(true);
    try {
      await api.post("/discovery-calls", { 
        name: billingDetails.name, 
        phone: billingDetails.phone 
      });
      toast.success("Request received! An expert will call you shortly.");
      setIsDiscoveryOpen(false);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitBrief = async () => {
    if (!projectName.trim()) {
      toast.error("Please enter a project name (e.g. 'Lotus Apartment 4BHK').");
      return;
    }
    if (floorPlans.length === 0) {
      toast.error("Please upload at least one floor plan (PDF, PNG, JPG, JPEG or WEBP) before submitting.");
      return;
    }
    setIsLoading(true);
    try {
      await api.post("/verifications", {
        project_name: projectName.trim(),
        property_type: propertyType,
        bhk_or_units: propertyType === "apartment" ? bhkType : (propertyType === "villa" ? villaType : unitCount.toString()),
        invoice_paid: calculatedPrice,
        pdf_urls: floorPlans.map(f => f.url),
        pdf_url: floorPlans[0]?.url,
        room_requirements: roomRequirements || "None provided"
      });
      toast.success("Brief submitted successfully for verification.");
      // Backend already set project_phase="verification"; refresh user to pick it up.
      await refresh();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setIsLoading(false);
    }
  };

  // ----- Floor-plan upload (multi-file) -----
  const ALLOWED_FLOOR_PLAN_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp", "application/pdf"];
  const handleFloorPlanChange = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const valid = [];
    for (const f of files) {
      if (!ALLOWED_FLOOR_PLAN_TYPES.includes(f.type)) {
        toast.error(`${f.name}: only PDF, PNG, JPG, JPEG or WEBP allowed.`);
        continue;
      }
      if (f.size > 15 * 1024 * 1024) {
        toast.error(`${f.name}: file too large (max 15 MB).`);
        continue;
      }
      valid.push(f);
    }
    if (valid.length === 0) { e.target.value = ""; return; }
    setIsUploadingPlan(true);
    try {
      const uploaded = [];
      for (const file of valid) {
        const form = new FormData();
        form.append("file", file);
        const { data } = await api.post("/upload", form, {
          headers: { "Content-Type": "multipart/form-data" }
        });
        uploaded.push({ url: data.url, file_id: data.file_id, name: file.name });
      }
      setFloorPlans(prev => [...prev, ...uploaded]);
      toast.success(`${uploaded.length} floor plan${uploaded.length > 1 ? "s" : ""} uploaded.`);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setIsUploadingPlan(false);
      e.target.value = "";
    }
  };

  const handleRemoveFloorPlan = (idx) => {
    setFloorPlans(prev => prev.filter((_, i) => i !== idx));
  };

  // ----- Payment completion (MOCKED — real gateway integrates later) -----
  const handleConfirmPayment = async () => {
    if (!selectedPkg) {
      toast.error("Please choose a package first.");
      return;
    }
    setIsLoading(true);
    try {
      // Sync briefing-phase property fields to the chosen package so the
      // verification form below pre-fills correctly.
      setPropertyType(selectedPkg.property_type);
      if (selectedPkg.property_type === "apartment") setBhkType(selectedPkg.value);
      else if (selectedPkg.property_type === "villa") setVillaType(selectedPkg.value);
      else if (selectedPkg.property_type === "independent") setUnitCount(parseInt(selectedPkg.value) || 1);

      await api.put("/me/phase", { phase: "briefing" });
      toast.success(`Payment of ₹${selectedPkg.price.toLocaleString("en-IN")} confirmed (mocked).`);
      await refresh();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setIsLoading(false);
    }
  };

  // ----- Site visit scheduling (post-approval) -----
  const handleSubmitSiteVisit = async () => {
    if (!siteVisitInput) return toast.error("Pick a date & time first.");
    setIsLoading(true);
    try {
      await api.put("/me/site-visit", { site_visit_at: siteVisitInput });
      toast.success("Site visit scheduled. Our team will confirm shortly.");
      await refresh();
    } catch (err) { toast.error(formatApiError(err)); }
    finally { setIsLoading(false); }
  };

  // ----- Package adjustment payment (designer flagged a mismatch) -----
  const handlePayPackageAdjustment = async () => {
    setIsLoading(true);
    try {
      await api.post("/me/pay-package-adjustment");
      toast.success("Package adjustment paid. Your designer is on it!");
      await refresh();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <DashShell links={INTERIOR_LINKS} title="Welcome to Homesqre Interiors.">
      
      {/* MISSED CALL BANNER */}
      {callStatus === "missed" && (
        <div className="bg-[#F3F0E9] border-l-4 border-[#B68D40] p-4 mb-8 flex justify-between items-start animate-in fade-in slide-in-from-top-4">
          <div>
            <h4 className="text-[#06402B] font-bold text-sm uppercase tracking-widest">We missed you!</h4>
            <p className="text-[#4A5D54] text-sm mt-1">
              Rajendra from Homesqre tried to reach you for your Discovery Call. We could not connect. Please call us back directly at <strong>+91 98765 43210</strong>.
            </p>
          </div>
          <button onClick={() => setCallStatus("none")} className="text-[#06402B] opacity-50 hover:opacity-100 text-xl leading-none">&times;</button>
        </div>
      )}

      {currentPhase !== "unpaid" && (
        <blockquote className="border-l-4 border-[#B68D40] pl-4 mb-10">
          <p className="text-sm uppercase tracking-widest text-[#06402B] font-bold">The Homesqre Promise</p>
          <p className="text-[#4A5D54]">Design first. The most accurate quotation after design approval.</p>
        </blockquote>
      )}

      {/* PACKAGE ADJUSTMENT BANNER — designer flagged a mismatch */}
      {currentPhase === "package_adjustment" && user?.package_adjustment && (
        <div className="bg-[#FFF8EC] border-2 border-[#B68D40] p-6 mb-10 animate-in fade-in" data-testid="package-adjustment-banner">
          <h3 className="font-display text-2xl text-[#06402B] mb-2">Package Adjustment Required</h3>
          <p className="text-sm text-[#4A5D54] mb-4">
            Your designer reviewed your floor plan and recommends upgrading to a{" "}
            <strong className="capitalize">
              {user.package_adjustment.corrected_bhk_or_units} {user.package_adjustment.corrected_property_type}
            </strong>{" "}
            package to match the layout you uploaded.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
            <div className="bg-white border border-[#E8E4D9] p-3 text-center">
              <p className="text-[10px] uppercase tracking-widest text-[#4A5D54]">You paid</p>
              <p className="font-display text-xl text-[#06402B]">₹{Number(user.package_adjustment.invoice_paid).toLocaleString("en-IN")}</p>
            </div>
            <div className="bg-white border border-[#E8E4D9] p-3 text-center">
              <p className="text-[10px] uppercase tracking-widest text-[#4A5D54]">Correct package</p>
              <p className="font-display text-xl text-[#06402B]">₹{Number(user.package_adjustment.corrected_price).toLocaleString("en-IN")}</p>
            </div>
            <div className="bg-[#F3F0E9] border border-[#06402B] p-3 text-center">
              <p className="text-[10px] uppercase tracking-widest text-[#06402B] font-bold">You owe</p>
              <p className="font-display text-2xl text-[#06402B]" data-testid="differential-amount">
                ₹{Number(user.package_adjustment.differential_amount).toLocaleString("en-IN")}
              </p>
            </div>
          </div>
          <button
            onClick={handlePayPackageAdjustment}
            disabled={isLoading}
            data-testid="pay-package-adjustment-btn"
            className="bg-[#B68D40] text-white px-8 py-3 uppercase tracking-widest text-sm font-bold hover:bg-[#9d7936] transition disabled:opacity-60"
          >
            {isLoading ? "Processing…" : `Pay ₹${Number(user.package_adjustment.differential_amount).toLocaleString("en-IN")} & Continue`}
          </button>
          <p className="text-[11px] text-gray-500 mt-3">After payment, your designer begins work immediately. No further verification needed.</p>
        </div>
      )}

      <div className="bg-white border border-[#E8E4D9] p-8 mb-10 shadow-sm relative">
        
        {/* PHASE 0: THE PAYWALL — package picker + mocked payment */}
        {currentPhase === "unpaid" && (
          <div className="animate-in fade-in" data-testid="unpaid-package-picker">
            <div className="text-center mb-8">
              <span className="inline-block bg-[#F3F0E9] text-[#06402B] text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-4">
                Step 1 of 4 — Choose Your Design Package
              </span>
              <h2 className="font-display text-3xl text-[#06402B] mb-3">See your home before you build it.</h2>
              <p className="text-[#4A5D54] max-w-xl mx-auto text-base">
                Pick the package that matches your property. The retainer is fully adjustable against your final execution quote.
              </p>
            </div>

            {/* Package catalogue */}
            <div className="space-y-8 mb-8">
              {PACKAGE_CATALOGUE.map(group => (
                <div key={group.group}>
                  <h3 className="text-xs uppercase tracking-widest font-bold text-[#06402B] mb-3 border-b border-[#E8E4D9] pb-2">
                    {group.group}
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {group.options.map(opt => {
                      const isSelected = selectedPkg?.property_type === group.property_type && selectedPkg?.value === opt.value;
                      return (
                        <button
                          key={`${group.property_type}-${opt.value}`}
                          type="button"
                          onClick={() => setSelectedPkg({ ...opt, property_type: group.property_type })}
                          data-testid={`pkg-${group.property_type}-${opt.value}`}
                          className={`text-left border p-4 transition ${
                            isSelected
                              ? "border-[#06402B] bg-[#F3F0E9] ring-2 ring-[#06402B]"
                              : "border-[#E8E4D9] bg-white hover:border-[#B68D40]"
                          }`}
                        >
                          <div className="flex items-baseline justify-between mb-1">
                            <h4 className="font-display text-lg text-[#06402B]">{opt.label}</h4>
                            <span className="font-display text-xl text-[#B68D40]">₹{opt.price.toLocaleString("en-IN")}</span>
                          </div>
                          <p className="text-xs text-[#4A5D54]">{opt.blurb}</p>
                          {isSelected && (
                            <p className="mt-2 text-[10px] uppercase tracking-widest font-bold text-[#06402B]">✓ Selected</p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Selected package summary + Pay CTA */}
            <div className="bg-[#F3F0E9] border border-[#E8E4D9] p-6" data-testid="unpaid-payment-summary">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-[#4A5D54] font-bold">Selected Package</p>
                  {selectedPkg ? (
                    <p className="font-display text-xl text-[#06402B]" data-testid="selected-package-label">
                      {selectedPkg.label}{" "}
                      <span className="text-sm text-[#4A5D54] capitalize">({selectedPkg.property_type})</span>
                    </p>
                  ) : (
                    <p className="text-sm text-[#4A5D54] italic">No package chosen yet.</p>
                  )}
                </div>
                <div className="text-left sm:text-right">
                  <p className="text-[10px] uppercase tracking-widest text-[#4A5D54] font-bold">Design Retainer</p>
                  <p className="font-display text-3xl text-[#06402B]" data-testid="selected-package-price">
                    ₹{calculatedPrice.toLocaleString("en-IN")}
                  </p>
                </div>
              </div>
              <button
                onClick={handleConfirmPayment}
                disabled={!selectedPkg || isLoading}
                data-testid="confirm-payment-btn"
                className="bg-[#B68D40] text-white px-8 py-4 uppercase tracking-widest text-sm font-bold hover:bg-[#9d7936] transition w-full shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? "Processing…" : selectedPkg ? `Proceed to Payment — ₹${calculatedPrice.toLocaleString("en-IN")}` : "Select a package to continue"}
              </button>
              <p className="text-[10px] text-gray-500 mt-3 text-center uppercase tracking-wide">
                Mocked payment — Razorpay/Stripe integrates later. Phase advances on click.
              </p>
            </div>

            <div className="mt-8 pt-6 border-t border-[#E8E4D9] text-center">
              <button
                onClick={() => setIsDiscoveryOpen(true)}
                data-testid="discovery-cta-btn"
                className="text-sm text-[#4A5D54] hover:text-[#06402B] font-medium underline underline-offset-4"
              >
                Not sure yet? Schedule a Discovery Call with our Expert.
              </button>
            </div>
          </div>
        )}

        {/* PHASE 1: BRIEFING */}
        {currentPhase === "briefing" && (
          <div className="animate-in fade-in">
            <h2 className="font-display text-2xl text-[#06402B] mb-2">Let&apos;s define your vision.</h2>
            <p className="text-[#4A5D54] mb-8">Tell us about your space and style preferences to kick off the design process.</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div className="md:col-span-2">
                <label className="block text-xs uppercase tracking-widest font-bold text-[#06402B] mb-2">
                  Project Name <span className="text-red-500">*</span>
                  <span className="text-gray-400 font-normal lowercase tracking-normal ml-1">(How you&apos;ll refer to this project)</span>
                </label>
                <input
                  type="text"
                  data-testid="project-name-input"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="e.g. Lotus Apartment 3BHK, My Whitefield Villa"
                  className="w-full p-3 border border-[#E8E4D9] focus:outline-none focus:border-[#06402B] text-sm"
                />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-widest font-bold text-[#06402B] mb-2">Estimated Budget</label>
                <select 
                  className="w-full p-3 border border-[#E8E4D9] focus:outline-none focus:border-[#06402B] text-sm mb-2"
                  value={budgetType}
                  onChange={(e) => setBudgetType(e.target.value)}
                >
                  <option value="">Select a range...</option>
                  <option value="8-12">₹8 Lakhs - ₹12 Lakhs</option>
                  <option value="12-18">₹12 Lakhs - ₹18 Lakhs</option>
                  <option value="18+">₹18 Lakhs+</option>
                  <option value="custom">Custom Budget</option>
                </select>
                {budgetType === "custom" && (
                  <input 
                    type="number" 
                    placeholder="Enter exact budget in INR" 
                    value={customBudget}
                    onChange={(e) => setCustomBudget(e.target.value)}
                    className="w-full p-3 border border-[#06402B] focus:outline-none bg-[#F3F0E9] text-sm animate-in fade-in" 
                  />
                )}
              </div>
              <div>
                <label className="block text-xs uppercase tracking-widest font-bold text-[#06402B] mb-2">
                  Upload Floor Plan(s) <span className="text-gray-400 font-normal lowercase tracking-normal">(PDF, PNG, JPG, JPEG or WEBP — max 15 MB each. Multiple files allowed.)</span>
                </label>
                <input
                  type="file"
                  multiple
                  accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
                  onChange={handleFloorPlanChange}
                  disabled={isUploadingPlan}
                  data-testid="floor-plan-upload-input"
                  className="w-full p-2 border border-[#E8E4D9] text-sm file:mr-4 file:py-2 file:px-4 file:border-0 file:text-sm file:font-semibold file:bg-[#F3F0E9] file:text-[#06402B] hover:file:bg-[#E8E4D9] disabled:opacity-50"
                />
                {isUploadingPlan && (
                  <p className="mt-2 text-xs text-[#4A5D54]">Uploading…</p>
                )}
                {floorPlans.length > 0 && !isUploadingPlan && (
                  <ul className="mt-2 space-y-1" data-testid="floor-plan-upload-success">
                    {floorPlans.map((f, idx) => (
                      <li key={idx} className="text-xs text-[#06402B] font-semibold flex items-center gap-2">
                        <span>✓ {f.name}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveFloorPlan(idx)}
                          data-testid={`remove-floor-plan-${idx}`}
                          className="underline text-[#B68D40] hover:text-[#9d7936]"
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <h3 className="font-display text-xl text-[#06402B] mb-4 border-b border-[#E8E4D9] pb-2">Overall Design Style</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              {renderStyleCard('Modern Minimalist', 'Clean lines, neutral tones, clutter-free.')}
              {renderStyleCard('Warm Contemporary', 'Rich timber textures, cozy warm lighting.')}
              {renderStyleCard('Ultra-Luxury', 'High-gloss finishes, statement profiles.')}
            </div>

            <div className="mb-8">
              <label className="block text-xs uppercase tracking-widest font-bold text-[#06402B] mb-2">
                Room-by-Room Must-Haves <span className="text-gray-400 font-normal lowercase tracking-normal">(Optional but Recommended)</span>
              </label>
              <textarea 
                rows="4"
                className="w-full p-4 border border-[#E8E4D9] focus:outline-none focus:border-[#06402B] text-sm resize-y"
                placeholder="e.g., &quot;Living Room: Needs a dedicated Pooja unit. Master Bedroom: Include a small workstation. Kitchen: We prefer closed overhead cabinets and a tall pantry.&quot;"
                value={roomRequirements}
                onChange={(e) => setRoomRequirements(e.target.value)}
              ></textarea>
            </div>

            <button 
              onClick={handleSubmitBrief}
              disabled={isLoading}
              className="bg-[#06402B] text-white px-8 py-3 uppercase tracking-widest text-xs font-bold hover:bg-[#042c1e] transition disabled:opacity-50"
            >
              {isLoading ? "Submitting..." : "Submit Brief"}
            </button>
          </div>
        )}

        {/* PHASE 1.5: VERIFICATION */}
        {currentPhase === "verification" && (
          <div className="animate-in fade-in text-center py-10">
            <div className="inline-block w-12 h-12 border-4 border-[#F3F0E9] border-t-[#06402B] rounded-full animate-spin mb-4"></div>
            <h2 className="font-display text-2xl text-[#06402B] mb-2">Verifying your project details.</h2>
            <p className="text-[#4A5D54] max-w-md mx-auto">
              Our team is currently reviewing your uploaded floor plan to ensure it matches the selected property type. This usually takes a few hours. We will unlock your site visit scheduling momentarily.
            </p>
          </div>
        )}

        {/* PHASE 4: DESIGNING
            Also handles legacy phases: "scheduling" and "confirmed" were removed
            from the phase flow in Feb 2026. Users with those phases in the DB
            are shown the designing UI so they are not stuck on a blank screen. */}
        {(currentPhase === "designing" || currentPhase === "ready_for_quotation" ||
          currentPhase === "scheduling" || currentPhase === "confirmed") && (
          <div className="animate-in fade-in space-y-6">
            {/* Design started banner */}
            <div className="bg-[#F3F0E9] border-l-4 border-[#06402B] p-4" data-testid="design-started-banner">
              <h4 className="text-[#06402B] font-bold text-sm uppercase tracking-widest">Design has started</h4>
              <p className="text-[#4A5D54] text-sm mt-1">
                Your floor plan is approved. Your designer is crafting your 3D renders right now — they&apos;ll appear below the moment they&apos;re uploaded for your review.
              </p>
            </div>

            {/* Site visit scheduler */}
            {user?.site_visit_at ? (
              <div className="bg-white border border-[#E8E4D9] p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3" data-testid="site-visit-confirmed">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-[#06402B] font-bold">Site Visit Scheduled</p>
                  <p className="font-display text-lg text-[#06402B]">{new Date(user.site_visit_at).toLocaleString()}</p>
                  <p className="text-xs text-[#4A5D54]">Our lead engineer will visit your property for precise measurements.</p>
                </div>
                <button
                  onClick={() => { setSiteVisitInput(""); /* allow reschedule */ }}
                  data-testid="reschedule-site-visit-btn"
                  className="text-xs underline text-[#B68D40]"
                >Reschedule</button>
              </div>
            ) : (
              <div className="bg-white border border-[#B68D40] p-5" data-testid="site-visit-picker">
                <p className="text-[10px] uppercase tracking-widest text-[#B68D40] font-bold mb-2">Schedule your site visit</p>
                <p className="text-sm text-[#4A5D54] mb-3">
                  We&apos;ll send a lead engineer to take exact measurements at your property — this happens in parallel with the design work.
                </p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="datetime-local"
                    value={siteVisitInput}
                    onChange={(e) => setSiteVisitInput(e.target.value)}
                    min={new Date().toISOString().slice(0, 16)}
                    data-testid="site-visit-input"
                    className="flex-1 p-3 border border-[#E8E4D9] focus:outline-none focus:border-[#06402B] text-sm"
                  />
                  <button
                    onClick={handleSubmitSiteVisit}
                    disabled={isLoading || !siteVisitInput}
                    data-testid="site-visit-submit-btn"
                    className="bg-[#06402B] text-white px-6 py-3 uppercase tracking-widest text-xs font-bold hover:bg-[#042c1e] disabled:opacity-50"
                  >
                    {isLoading ? "Saving…" : "Confirm Site Visit"}
                  </button>
                </div>
              </div>
            )}

            <CustomerDesignReview phase={currentPhase} onProjectAdvance={refresh} />
          </div>
        )}

      </div>

      {/* DISCOVERY CALL MODAL OVERLAY */}
      {isDiscoveryOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md shadow-xl animate-in zoom-in-95">
            <div className="bg-[#06402B] text-white p-6 flex justify-between items-center">
              <div>
                <h3 className="font-display text-xl">Talk to a Real Human</h3>
              </div>
              <button onClick={() => setIsDiscoveryOpen(false)} className="text-white hover:text-gray-300 text-2xl">&times;</button>
            </div>
            <div className="p-8">
              <p className="text-sm text-[#4A5D54] mb-6 leading-relaxed">
                Enter your number. If it is between 9:00 AM and 7:00 PM, an expert will call you back in under 30 minutes with zero sales pressure.
              </p>
              <div className="space-y-4 mb-8">
                <input 
                  type="text" 
                  placeholder="Your Full Name" 
                  value={billingDetails.name}
                  onChange={(e) => setBillingDetails({...billingDetails, name: e.target.value})}
                  className="w-full p-3 border border-[#E8E4D9] focus:outline-none focus:border-[#06402B] text-sm" 
                />
                <input 
                  type="tel" 
                  placeholder="Your Phone Number" 
                  value={billingDetails.phone}
                  onChange={(e) => setBillingDetails({...billingDetails, phone: e.target.value})}
                  className="w-full p-3 border border-[#E8E4D9] focus:outline-none focus:border-[#06402B] text-sm" 
                />
              </div>
              <button 
                onClick={handleDiscoverySubmit}
                disabled={isLoading}
                className="bg-[#B68D40] text-white px-8 py-4 uppercase tracking-widest text-sm font-bold hover:bg-[#9d7936] transition w-full shadow-md disabled:opacity-50"
              >
                {isLoading ? "Sending..." : "Request Instant Call"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CHECKOUT MODAL removed — package selection is now inline in the unpaid phase. */}

      {/* LOWER DASHBOARD: JOURNEY MAP & VAULT */}
      {currentPhase !== "unpaid" && (
        <div className="animate-in fade-in">
          <h3 className="font-display text-xl mb-6 text-[#06402B]">Project Journey</h3>
          <div className="flex flex-col md:flex-row gap-2 justify-between items-center text-center text-sm mb-12">
            <div className={`flex-1 border-b-4 pb-2 w-full ${currentPhase === 'briefing' ? 'border-[#06402B]' : ['verification','scheduling','confirmed','designing','ready_for_quotation'].includes(currentPhase) ? 'border-[#B68D40]' : 'border-[#E8E4D9] opacity-40'}`}>1. Briefing &amp; Review</div>
            <div className={`flex-1 border-b-4 pb-2 w-full ${['designing','ready_for_quotation'].includes(currentPhase) ? 'border-[#06402B]' : ['verification','scheduling','confirmed'].includes(currentPhase) ? 'border-[#B68D40]' : 'border-[#E8E4D9] opacity-40'}`}>2. Site Visit &amp; Design</div>
            <div className={`flex-1 border-b-4 pb-2 w-full ${currentPhase === 'designing' ? 'border-[#B68D40]' : currentPhase === 'ready_for_quotation' ? 'border-[#06402B]' : 'border-[#E8E4D9] opacity-40'}`}>3. 3D Design</div>
            <div className={`flex-1 border-b-4 pb-2 w-full ${currentPhase === 'ready_for_quotation' ? 'border-[#B68D40]' : 'border-[#E8E4D9] opacity-40'}`}>4. Approvals &amp; Quote</div>
          </div>

          <div className="bg-white border border-[#E8E4D9] p-6">
            <h3 className="font-display text-lg mb-4 text-[#06402B]">Document Vault</h3>
            <p className="text-sm text-gray-400">No documents uploaded yet. Approved designs and Razorpay receipts will appear here.</p>
          </div>
        </div>
      )}

      {/* DEV MODE TOGGLE — only rendered outside production builds */}
      {process.env.NODE_ENV !== "production" && (
        <div className="mt-16 p-4 border border-red-200 bg-red-50 rounded text-xs flex flex-wrap gap-4 items-center">
          <span className="font-bold text-red-600">Dev Tool (Test the UI Flow):</span>
          <button onClick={() => setCurrentPhase('unpaid')} className="underline">0. Unpaid</button>
          <button onClick={() => setCurrentPhase('briefing')} className="underline">1. Briefing</button>
          <button onClick={() => setCurrentPhase('verification')} className="underline">1.5 Verification</button>
          <button onClick={() => setCurrentPhase('designing')} className="underline">4. Designing</button>
          <div className="w-full border-t border-red-200 my-2"></div>
          <span className="font-bold text-red-600">Test CRM Alerts:</span>
          <button onClick={() => setCallStatus('missed')} className="underline bg-white px-2 py-1 rounded">Trigger &apos;Missed Call&apos; Banner</button>
          <button onClick={() => setCallStatus('none')} className="underline bg-white px-2 py-1 rounded">Clear Banner</button>
        </div>
      )}

    </DashShell>
  );
}
