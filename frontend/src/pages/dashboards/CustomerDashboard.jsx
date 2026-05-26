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

  // Modal States
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isDiscoveryOpen, setIsDiscoveryOpen] = useState(false); 
  const [isLoading, setIsLoading] = useState(false);
  
  // Form Details
  const [billingDetails, setBillingDetails] = useState({
    name: user?.name || "",
    email: user?.email || "",
    phone: "",
    address: ""
  });

  // Property Configuration
  const [propertyType, setPropertyType] = useState("apartment");
  const [sqft, setSqft] = useState("");
  const [bhkType, setBhkType] = useState("1-2");
  const [villaType, setVillaType] = useState("duplex");
  const [unitCount, setUnitCount] = useState(1);

  // Dynamic Price Calculator
  const calculatedPrice = useMemo(() => {
    if (propertyType === "apartment") {
      if (bhkType === "1-2") return 10000;
      if (bhkType === "3") return 12000;
      if (bhkType === "4+") return 15000;
    }
    if (propertyType === "villa") {
      if (villaType === "duplex") return 15000;
      if (villaType === "triplex") return 18000;
    }
    if (propertyType === "independent") {
      const units = parseInt(unitCount) || 1;
      if (units === 1) return 12000;
      return Math.max(20000, 6000 * units);
    }
    return 10000; 
  }, [propertyType, bhkType, villaType, unitCount]);

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

  // ----- Payment completion -----
  const handleConfirmPayment = async () => {
    setIsLoading(true);
    try {
      await api.put("/me/phase", { phase: "briefing" });
      toast.success(`Payment of ₹${calculatedPrice.toLocaleString("en-IN")} verified.`);
      await refresh();
      setIsCheckoutOpen(false);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setIsLoading(false);
    }
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
        
        {/* PHASE 0: THE PAYWALL */}
        {currentPhase === "unpaid" && (
          <div className="animate-in fade-in text-center py-6">
            <span className="inline-block bg-[#F3F0E9] text-[#06402B] text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-6">
              Next Step: Unlock Your Design Journey
            </span>
            <h2 className="font-display text-3xl text-[#06402B] mb-4">See your home before you build it.</h2>
            <p className="text-[#4A5D54] max-w-xl mx-auto mb-10 text-lg">
              Stop guessing what your home will look like. Secure your design slot today, and our team will craft your exact vision in stunning 3D.
            </p>
            
            <div className="flex flex-col items-center gap-4">
              <button 
                onClick={() => setIsCheckoutOpen(true)}
                className="bg-[#06402B] text-white px-10 py-4 uppercase tracking-widest text-sm font-bold hover:bg-[#042c1e] transition w-full max-w-md"
              >
                Unlock Your Design Potential (Starts at ₹10,000)
              </button>
              <p className="text-xs text-[#B68D40] font-medium tracking-wide mb-6">
                Fully adjustable against your final execution quote. Zero hidden costs.
              </p>
              
              <div className="w-full max-w-md border-t border-[#E8E4D9] pt-6 mt-2">
                <button 
                  onClick={() => setIsDiscoveryOpen(true)}
                  className="text-sm text-[#4A5D54] hover:text-[#06402B] font-medium underline underline-offset-4"
                >
                  Not sure yet? Schedule a Discovery Call with our Expert.
                </button>
              </div>
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

        {/* PHASE 2: SCHEDULING */}
        {currentPhase === "scheduling" && (
          <div className="animate-in fade-in">
            <h2 className="font-display text-2xl text-[#06402B] mb-2">Floor plan approved. Let&apos;s map your space.</h2>
            <p className="text-[#4A5D54] mb-8">To ensure your 3D designs are millimetre-perfect, select a time for our founder to visit your site for exact measurements.</p>
            
            <div className="max-w-md">
              <label className="block text-xs uppercase tracking-widest font-bold text-[#06402B] mb-2">Preferred Date &amp; Time</label>
              <input type="datetime-local" className="w-full p-3 border border-[#E8E4D9] focus:outline-none focus:border-[#06402B] text-sm mb-4" />
              <button className="bg-[#06402B] text-white px-8 py-3 w-full uppercase tracking-widest text-xs font-bold hover:bg-[#042c1e] transition">
                Request Site Visit
              </button>
            </div>
          </div>
        )}

        {/* PHASE 3: CONFIRMED */}
        {currentPhase === "confirmed" && (
          <div className="animate-in fade-in">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-full bg-[#F3F0E9] flex items-center justify-center text-[#06402B]">✓</div>
              <div>
                <h2 className="font-display text-2xl text-[#06402B]">Site Visit Confirmed</h2>
                <p className="text-[#4A5D54]">We will see you at your property.</p>
              </div>
            </div>
            <div className="bg-[#F3F0E9] p-4 border border-[#E8E4D9] max-w-md">
              <p className="text-sm mb-2"><strong className="text-[#06402B]">Date:</strong> Thursday, 28th May, 10:00 AM</p>
              <p className="text-sm"><strong className="text-[#06402B]">Assigned Lead Engineer:</strong> Girish Balaji</p>
            </div>
          </div>
        )}

        {/* PHASE 4: DESIGNING */}
        {(currentPhase === "designing" || currentPhase === "ready_for_quotation") && (
          <div className="animate-in fade-in">
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

      {/* CHECKOUT MODAL OVERLAY */}
      {isCheckoutOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-2xl shadow-xl max-h-[90vh] overflow-y-auto">
            
            <div className="bg-[#06402B] text-white p-6 flex justify-between items-center">
              <div>
                <h3 className="font-display text-xl">Generate Design Invoice</h3>
                <p className="text-xs opacity-80 mt-1">Configure your property for accurate pricing.</p>
              </div>
              <button onClick={() => setIsCheckoutOpen(false)} className="text-white hover:text-gray-300 text-2xl">&times;</button>
            </div>

            <div className="p-8">
              <h4 className="text-xs uppercase tracking-widest font-bold text-[#06402B] mb-4 border-b border-[#E8E4D9] pb-2">1. Billing Details</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                <input type="text" placeholder="Full Name" value={billingDetails.name} className="p-3 border border-[#E8E4D9] focus:outline-none focus:border-[#06402B] text-sm" onChange={(e) => setBillingDetails({...billingDetails, name: e.target.value})} />
                <input type="email" placeholder="Email Address" value={billingDetails.email} className="p-3 border border-[#E8E4D9] focus:outline-none focus:border-[#06402B] text-sm" onChange={(e) => setBillingDetails({...billingDetails, email: e.target.value})} />
                <input type="tel" placeholder="Phone Number" value={billingDetails.phone} className="p-3 border border-[#E8E4D9] focus:outline-none focus:border-[#06402B] text-sm" onChange={(e) => setBillingDetails({...billingDetails, phone: e.target.value})} />
                <input type="text" placeholder="Billing Address" className="p-3 border border-[#E8E4D9] focus:outline-none focus:border-[#06402B] text-sm" />
              </div>

              <h4 className="text-xs uppercase tracking-widest font-bold text-[#06402B] mb-4 border-b border-[#E8E4D9] pb-2">2. Property Configuration</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                
                <div className="col-span-1 md:col-span-3 grid grid-cols-3 gap-2 mb-2">
                  <button onClick={() => setPropertyType('apartment')} className={`p-3 text-sm border ${propertyType === 'apartment' ? 'bg-[#F3F0E9] border-[#06402B] text-[#06402B] font-medium' : 'border-[#E8E4D9] text-[#4A5D54]'}`}>Apartment / Flat</button>
                  <button onClick={() => setPropertyType('villa')} className={`p-3 text-sm border ${propertyType === 'villa' ? 'bg-[#F3F0E9] border-[#06402B] text-[#06402B] font-medium' : 'border-[#E8E4D9] text-[#4A5D54]'}`}>Villa</button>
                  <button onClick={() => setPropertyType('independent')} className={`p-3 text-sm border ${propertyType === 'independent' ? 'bg-[#F3F0E9] border-[#06402B] text-[#06402B] font-medium' : 'border-[#E8E4D9] text-[#4A5D54]'}`}>Independent / Rental</button>
                </div>

                <input type="number" placeholder="Total Sqft" value={sqft} onChange={(e) => setSqft(e.target.value)} className="p-3 border border-[#E8E4D9] focus:outline-none focus:border-[#06402B] text-sm col-span-1" />

                <div className="col-span-1 md:col-span-2">
                  {propertyType === "apartment" && (
                    <select value={bhkType} onChange={(e) => setBhkType(e.target.value)} className="w-full p-3 border border-[#E8E4D9] focus:outline-none focus:border-[#06402B] text-sm bg-white">
                      <option value="1-2">1 BHK / 2 BHK</option>
                      <option value="3">3 BHK</option>
                      <option value="4+">4 BHK +</option>
                    </select>
                  )}
                  {propertyType === "villa" && (
                    <select value={villaType} onChange={(e) => setVillaType(e.target.value)} className="w-full p-3 border border-[#E8E4D9] focus:outline-none focus:border-[#06402B] text-sm bg-white">
                      <option value="duplex">Duplex</option>
                      <option value="triplex">Triplex / Luxury</option>
                    </select>
                  )}
                  {propertyType === "independent" && (
                    <input type="number" min="1" placeholder="Number of Units" value={unitCount} onChange={(e) => setUnitCount(e.target.value)} className="w-full p-3 border border-[#E8E4D9] focus:outline-none focus:border-[#06402B] text-sm" />
                  )}
                </div>
              </div>

              <div className="bg-[#F3F0E9] border border-[#E8E4D9] p-6 text-center">
                <p className="text-sm text-[#4A5D54] mb-2 uppercase tracking-widest font-bold">Total Design Retainer</p>
                <p className="font-display text-4xl text-[#06402B] mb-6">₹{calculatedPrice.toLocaleString('en-IN')}</p>
                
                <button 
                  onClick={handleConfirmPayment}
                  disabled={isLoading}
                  data-testid="confirm-payment-btn"
                  className="bg-[#B68D40] text-white px-8 py-4 uppercase tracking-widest text-sm font-bold hover:bg-[#9d7936] transition w-full shadow-md disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isLoading ? "Confirming…" : "Proceed to Secure Payment"}
                </button>
                <p className="text-[10px] text-gray-500 mt-3 uppercase tracking-wide">100% Secure Payment • Instant Invoice Generation</p>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* LOWER DASHBOARD: JOURNEY MAP & VAULT */}
      {currentPhase !== "unpaid" && (
        <div className="animate-in fade-in">
          <h3 className="font-display text-xl mb-6 text-[#06402B]">Project Journey</h3>
          <div className="flex flex-col md:flex-row gap-2 justify-between items-center text-center text-sm mb-12">
            <div className={`flex-1 border-b-4 pb-2 w-full ${currentPhase === 'briefing' ? 'border-[#06402B]' : 'border-[#B68D40]'}`}>1. Briefing &amp; Review</div>
            <div className={`flex-1 border-b-4 pb-2 w-full ${currentPhase === 'confirmed' || currentPhase === 'designing' ? 'border-[#06402B]' : currentPhase === 'scheduling' || currentPhase === 'verification' ? 'border-[#B68D40]' : 'border-[#E8E4D9] opacity-40'}`}>2. Measurement</div>
            <div className={`flex-1 border-b-4 pb-2 w-full ${currentPhase === 'designing' ? 'border-[#B68D40]' : 'border-[#E8E4D9] opacity-40'}`}>3. 3D Design</div>
            <div className="flex-1 border-b-4 border-[#E8E4D9] pb-2 w-full opacity-40">4. Approvals &amp; Quote</div>
          </div>

          <div className="bg-white border border-[#E8E4D9] p-6">
            <h3 className="font-display text-lg mb-4 text-[#06402B]">Document Vault</h3>
            <p className="text-sm text-gray-400">No documents uploaded yet. Approved designs and Razorpay receipts will appear here.</p>
          </div>
        </div>
      )}

      {/* DEV MODE TOGGLE */}
      <div className="mt-16 p-4 border border-red-200 bg-red-50 rounded text-xs flex flex-wrap gap-4 items-center">
        <span className="font-bold text-red-600">Dev Tool (Test the UI Flow):</span>
        <button onClick={() => setCurrentPhase('unpaid')} className="underline">0. Unpaid</button>
        <button onClick={() => setCurrentPhase('briefing')} className="underline">1. Briefing</button>
        <button onClick={() => setCurrentPhase('verification')} className="underline">1.5 Verification</button>
        <button onClick={() => setCurrentPhase('scheduling')} className="underline">2. Scheduling</button>
        <button onClick={() => setCurrentPhase('confirmed')} className="underline">3. Confirmed</button>
        <button onClick={() => setCurrentPhase('designing')} className="underline">4. Designing</button>
        <div className="w-full border-t border-red-200 my-2"></div>
        <span className="font-bold text-red-600">Test CRM Alerts:</span>
        <button onClick={() => setCallStatus('missed')} className="underline bg-white px-2 py-1 rounded">Trigger &apos;Missed Call&apos; Banner</button>
        <button onClick={() => setCallStatus('none')} className="underline bg-white px-2 py-1 rounded">Clear Banner</button>
      </div>

    </DashShell>
  );
}
