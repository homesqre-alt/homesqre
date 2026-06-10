import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { Navigate } from "react-router-dom";
import DashShell from "@/components/layout/DashShell";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import CustomerDesignReview from "@/components/customer/CustomerDesignReview";
import DocumentVault from "@/components/DocumentVault";

export default function CustomerDashboard() {
  const { user, refresh } = useAuth();

  // Project phase is driven by `user.project_phase` on the server.
  // We keep a local mirror so dev-mode toggles can preview UI without a round-trip.
  const [currentPhase, setCurrentPhase] = useState(user?.project_phase || "unpaid");
  const [callStatus, setCallStatus] = useState("none"); 

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
  const [selectedVisitDate, setSelectedVisitDate] = useState(null);
  const [selectedVisitSlot, setSelectedVisitSlot] = useState(null);
  const [isRescheduling, setIsRescheduling] = useState(false);

  // Modal States
  const [isDiscoveryOpen, setIsDiscoveryOpen] = useState(false); 
  const [isLoading, setIsLoading] = useState(false);

  // Quotation hub state
  const [quotation, setQuotation] = useState(null);
  const [isPayingAdvance, setIsPayingAdvance] = useState(false);

  // Document vault state
  const [vaultDocs, setVaultDocs] = useState([]);
  
  // Form Details (kept for Discovery Call & Briefing forms)
  const [billingDetails, setBillingDetails] = useState({
    name: user?.name || "",
    email: user?.email || "",
    phone: "",
    address: ""
  });

  // Packages fetched dynamically from CMS
  const [packages, setPackages] = useState([]);
  const [loadingPackages, setLoadingPackages] = useState(true);

  // Selected package wizard
  const [selectedPropertyGroup, setSelectedPropertyGroup] = useState(null);

  // Selected package (in unpaid phase)
  const [selectedPkg, setSelectedPkg] = useState(null); // { property_type, value, label, price, blurb }
  // Briefing phase still needs property/BHK; default from selected pkg if any.
  const [propertyType, setPropertyType] = useState("apartment");
  const [bhkType, setBhkType] = useState("1-2");
  const [villaType, setVillaType] = useState("duplex");
  const [unitCount, setUnitCount] = useState(1);

  // The price the customer is paying (driven by the selected package)
  const calculatedPrice = selectedPkg?.price || 0;

  const [unavailableSlots, setUnavailableSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  useEffect(() => {
    if (!selectedVisitDate) return;
    const fetchSlots = async () => {
      setLoadingSlots(true);
      try {
        const d = selectedVisitDate.toISOString().split('T')[0];
        const res = await api.get(`/site-visits/slots?start_date=${d}&end_date=${d}`);
        setUnavailableSlots(res.data.unavailable_slots || []);
      } catch (err) {
        console.error("Failed to fetch slots", err);
      } finally {
        setLoadingSlots(false);
      }
    };
    fetchSlots();
  }, [selectedVisitDate]);

  // Generate next 3 days for the slot scheduler
  const getNext3Days = () => {
    const days = [];
    const now = new Date();
    for (let i = 0; i < 3; i++) {
      const d = new Date();
      d.setDate(now.getDate() + i);
      days.push(d);
    }
    return days;
  };

  const formatDayLabel = (d) => {
    if (!d) return "";
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);

    if (d.toDateString() === today.toDateString()) return "Today";
    if (d.toDateString() === tomorrow.toDateString()) return "Tomorrow";

    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  };

  const allTimeSlots = [
    { label: "08:00 AM", value: "08:00" },
    { label: "08:30 AM", value: "08:30" },
    { label: "09:00 AM", value: "09:00" },
    { label: "09:30 AM", value: "09:30" },
    { label: "10:00 AM", value: "10:00" },
    { label: "10:30 AM", value: "10:30" },
    { label: "11:00 AM", value: "11:00" },
    { label: "11:30 AM", value: "11:30" },
    { label: "12:00 PM", value: "12:00" },
    { label: "12:30 PM", value: "12:30" },
    { label: "01:00 PM", value: "13:00" },
    { label: "01:30 PM", value: "13:30" },
    { label: "02:00 PM", value: "14:00" },
    { label: "02:30 PM", value: "14:30" },
    { label: "03:00 PM", value: "15:00" },
    { label: "03:30 PM", value: "15:30" },
    { label: "04:00 PM", value: "16:00" },
    { label: "04:30 PM", value: "16:30" },
    { label: "05:00 PM", value: "17:00" },
    { label: "05:30 PM", value: "17:30" },
    { label: "06:00 PM", value: "18:00" },
    { label: "06:30 PM", value: "18:30" },
    { label: "07:00 PM", value: "19:00" },
    { label: "07:30 PM", value: "19:30" },
  ];

  const getAvailableSlots = (dateObj) => {
    if (!dateObj) return [];
    const today = new Date();
    let validSlots = allTimeSlots;
    
    if (dateObj.toDateString() === today.toDateString()) {
      const currentHour = today.getHours();
      const currentMinute = today.getMinutes();
      validSlots = allTimeSlots.filter(slot => {
        const [h, m] = slot.value.split(":").map(Number);
        if (h > currentHour) return true;
        if (h === currentHour && m > currentMinute + 30) return true;
        return false;
      });
    }

    const dStr = dateObj.toISOString().split('T')[0];
    return validSlots.filter(slot => {
      const dateTimeStr = `${dStr}T${slot.value}:00`;
      return !unavailableSlots.includes(dateTimeStr);
    });
  };

  // Keep the local phase in sync if the user record updates (e.g. after refresh()).
  useEffect(() => {
    if (user?.project_phase) setCurrentPhase(user.project_phase);
  }, [user?.project_phase]);

  // Load quotation when customer reaches quotation or production phase
  useEffect(() => {
    if (!['ready_for_quotation', 'production'].includes(currentPhase)) return;
    (async () => {
      try {
        const { data } = await api.get('/design/my-project/quotation');
        setQuotation(data || null);
      } catch (_) {
        // Quotation not yet created by admin
      }
    })();
  }, [currentPhase]);

  useEffect(() => {
    if (currentPhase !== 'unpaid') return;
    (async () => {
      try {
        const { data } = await api.get('/packages');
        setPackages(data || []);
      } catch (err) {
        toast.error("Failed to load property packages.");
      } finally {
        setLoadingPackages(false);
      }
    })();
  }, [currentPhase]);

  useEffect(() => {
    if (['designing', 'scheduling', 'confirmed'].includes(currentPhase)) {
      const days = getNext3Days();
      if (days.length > 0) {
        setSelectedVisitDate(days[0]);
      }
    }
  }, [currentPhase]);

  if (user === undefined) return null;
  if (user === null) return <Navigate to="/login" />;
  if (user.role !== "customer") {
    if (user.role === "admin") return <Navigate to="/dashboard/admin" replace />;
    if (user.role === "designer") return <Navigate to="/dashboard/designer" replace />;
    if (user.role === "sales") return <Navigate to="/dashboard/sales" replace />;
    return <Navigate to="/" replace />;
  }

  const INTERIOR_LINKS = [
    { to: "/dashboard/customer", label: "My Project" },
    { to: "#designs", label: "Designs & Renders" },
    { to: "#invoices", label: "Quotations & Billing" },
    { to: "/dashboard/profile", label: "Profile & Settings" },
  ];

  const renderStyleCard = (styleName, description) => {
    const isSelected = styles.design === styleName;
    return (
      <div 
        onClick={() => setStyles({ design: styleName })}
        className={`border p-4 cursor-pointer transition ${isSelected ? 'border-[#0C1D42] bg-[#F5EDE8] ring-1 ring-[#0C1D42]' : 'border-[#EDE5DB] hover:border-[#DA9E3E]'}`}
      >
        <div className="w-full h-24 bg-gray-200 mb-3 flex items-center justify-center text-xs text-gray-400">
          [Image: {styleName}]
        </div>
        <h4 className="font-medium text-[#0C1D42] text-sm">{styleName}</h4>
        <p className="text-xs text-[#333333] mt-1">{description}</p>
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

  // ----- Payment Gateway Integration (Razorpay) -----
  const loadScript = (src) => {
    return new Promise((resolve) => {
      if (document.querySelector(`script[src="${src}"]`)) return resolve(true);
      const script = document.createElement("script");
      script.src = src;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const initRazorpayPayment = async (paymentType, amount, metadata = {}) => {
    setIsLoading(true);
    try {
      const { data: orderData } = await api.post("/payments/create-order", {
        payment_type: paymentType,
        amount: amount,
        metadata: metadata
      });

      const res = await loadScript("https://checkout.razorpay.com/v1/checkout.js");
      if (!res) {
        toast.error("Razorpay SDK failed to load. Are you online?");
        return;
      }

      const options = {
        key: orderData.key_id,
        amount: orderData.amount,
        currency: orderData.currency,
        name: "Homesqre Interiors",
        description: "Payment",
        order_id: orderData.order_id,
        handler: async function (response) {
          try {
            await api.post("/payments/verify", {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature
            });
            toast.success("Payment successful!");
            await refresh();
            if (paymentType === "quotation_milestone") {
              const { data: qData } = await api.get("/design/my-project/quotation");
              setQuotation(qData || null);
            }
          } catch (err) {
            toast.error(formatApiError(err) || "Payment verification failed");
          }
        },
        prefill: {
          name: user?.name,
          email: user?.email,
          contact: user?.mobile
        },
        theme: {
          color: "#0C1D42"
        }
      };

      const paymentObject = new window.Razorpay(options);
      paymentObject.open();
    } catch (err) {
      toast.error(formatApiError(err) || "Could not initiate payment");
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmPayment = async () => {
    if (!selectedPkg) {
      toast.error("Please choose a package first.");
      return;
    }
    // Sync briefing-phase property fields to the chosen package
    setPropertyType(selectedPkg.property_type);
    if (selectedPkg.property_type === "apartment") setBhkType(selectedPkg.value);
    else if (selectedPkg.property_type === "villa") setVillaType(selectedPkg.value);
    else if (selectedPkg.property_type === "independent") setUnitCount(parseInt(selectedPkg.value) || 1);

    await initRazorpayPayment("initial_package", selectedPkg.price);
  };

  const handlePayPackageAdjustment = async () => {
    await initRazorpayPayment("package_adjustment", 0);
  };

  const handlePayQuotationMilestone = async (milestoneId) => {
    setIsPayingAdvance(true);
    await initRazorpayPayment("quotation_milestone", 0, { milestone_id: milestoneId });
    setIsPayingAdvance(false);
  };

  // ----- Site visit scheduling (post-approval) -----
  const handleSubmitSiteVisit = async () => {
    if (!selectedVisitDate || !selectedVisitSlot) {
      return toast.error("Please select a date and a time slot first.");
    }
    setIsLoading(true);
    try {
      const datePart = selectedVisitDate.toISOString().split("T")[0];
      const combinedDateTime = `${datePart}T${selectedVisitSlot.value}:00`;
      await api.put("/me/site-visit", { site_visit_at: combinedDateTime });
      toast.success("Site visit scheduled. Our team will confirm shortly.");
      setIsRescheduling(false);
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
        <div className="bg-[#F5EDE8] border-l-4 border-[#DA9E3E] p-4 mb-8 flex justify-between items-start animate-in fade-in slide-in-from-top-4">
          <div>
            <h4 className="text-[#0C1D42] font-bold text-sm uppercase tracking-widest">We missed you!</h4>
            <p className="text-[#333333] text-sm mt-1">
              Rajendra from Homesqre tried to reach you for your Discovery Call. We could not connect. Please call us back directly at <strong>+91 98765 43210</strong>.
            </p>
          </div>
          <button onClick={() => setCallStatus("none")} className="text-[#0C1D42] opacity-50 hover:opacity-100 text-xl leading-none">&times;</button>
        </div>
      )}

      {/* DEFICIT REJECTION BANNER */}
      {currentPhase === 'unpaid' && user?.deficit_due > 0 && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-8 animate-in fade-in slide-in-from-top-4">
          <h4 className="text-red-700 font-bold text-sm uppercase tracking-widest mb-1">Floor Plan Verification Rejected</h4>
          <p className="text-red-600 text-sm">
            Your submitted floor plan could not be verified. A deficit payment of{' '}
            <strong>₹{Number(user.deficit_due).toLocaleString('en-IN')}</strong> is required to resubmit.
          </p>
          <button
            onClick={handlePayPackageAdjustment}
            disabled={isLoading}
            className="mt-3 bg-red-600 text-white px-6 py-2 text-xs uppercase tracking-widest font-bold hover:bg-red-700 transition disabled:opacity-50"
          >
            {isLoading ? 'Processing…' : `Pay ₹${Number(user.deficit_due).toLocaleString('en-IN')} & Resume`}
          </button>
        </div>
      )}

      {currentPhase !== "unpaid" && (
        <blockquote className="border-l-4 border-[#DA9E3E] pl-4 mb-10">
          <p className="text-sm uppercase tracking-widest text-[#0C1D42] font-bold">The Homesqre Promise</p>
          <p className="text-[#333333]">Design first. The most accurate quotation after design approval.</p>
        </blockquote>
      )}

      {/* PACKAGE ADJUSTMENT BANNER — designer flagged a mismatch */}
      {currentPhase === "package_adjustment" && user?.package_adjustment && (
        <div className="bg-[#FCFAF5] border-2 border-[#DA9E3E] p-6 mb-10 animate-in fade-in" data-testid="package-adjustment-banner">
          <h3 className="font-display text-2xl text-[#0C1D42] mb-2">Package Adjustment Required</h3>
          <p className="text-sm text-[#333333] mb-4">
            Your designer reviewed your floor plan and recommends upgrading to a{" "}
            <strong className="capitalize">
              {user.package_adjustment.corrected_bhk_or_units} {user.package_adjustment.corrected_property_type}
            </strong>{" "}
            package to match the layout you uploaded.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
            <div className="bg-white border border-[#EDE5DB] p-3 text-center">
              <p className="text-[10px] uppercase tracking-widest text-[#333333]">You paid</p>
              <p className="font-display text-xl text-[#0C1D42]">₹{Number(user.package_adjustment.invoice_paid).toLocaleString("en-IN")}</p>
            </div>
            <div className="bg-white border border-[#EDE5DB] p-3 text-center">
              <p className="text-[10px] uppercase tracking-widest text-[#333333]">Correct package</p>
              <p className="font-display text-xl text-[#0C1D42]">₹{Number(user.package_adjustment.corrected_price).toLocaleString("en-IN")}</p>
            </div>
            <div className="bg-[#F5EDE8] border border-[#0C1D42] p-3 text-center">
              <p className="text-[10px] uppercase tracking-widest text-[#0C1D42] font-bold">You owe</p>
              <p className="font-display text-2xl text-[#0C1D42]" data-testid="differential-amount">
                ₹{Number(user.package_adjustment.differential_amount).toLocaleString("en-IN")}
              </p>
            </div>
          </div>
          <button
            onClick={handlePayPackageAdjustment}
            disabled={isLoading}
            data-testid="pay-package-adjustment-btn"
            className="bg-[#DA9E3E] text-white px-8 py-3 uppercase tracking-widest text-sm font-bold hover:bg-[#C88C2F] transition disabled:opacity-60"
          >
            {isLoading ? "Processing…" : `Pay ₹${Number(user.package_adjustment.differential_amount).toLocaleString("en-IN")} & Continue`}
          </button>
          <p className="text-[11px] text-gray-500 mt-3">After payment, your designer begins work immediately. No further verification needed.</p>
        </div>
      )}

      <div className="bg-white border border-[#EDE5DB] p-8 mb-10 shadow-sm relative">
        
        {/* PHASE 0: THE PAYWALL — package picker + mocked payment */}
        {currentPhase === "unpaid" && (
          <div className="animate-in fade-in" data-testid="unpaid-package-picker">
            <div className="text-center mb-8">
              <span className="inline-block bg-[#F5EDE8] text-[#0C1D42] text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-4">
                Step 1 of 4 — Choose Your Design Package
              </span>
              <h2 className="font-display text-3xl text-[#0C1D42] mb-3">See your home before you build it.</h2>
              <p className="text-[#333333] max-w-xl mx-auto text-base">
                Pick the package that matches your property. The retainer is fully adjustable against your final execution quote.
              </p>
            </div>

            {/* Package catalogue */}
            <div className="space-y-8 mb-8">
              {loadingPackages ? (
                <p className="text-center text-[#333333] py-8">Loading packages...</p>
              ) : !selectedPropertyGroup ? (
                // Step 1: Choose Property Type
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 animate-in fade-in slide-in-from-bottom-4">
                  {packages.map(group => (
                    <button
                      key={group.property_type}
                      onClick={() => setSelectedPropertyGroup(group.property_type)}
                      className="border border-[#EDE5DB] bg-white p-6 hover:border-[#DA9E3E] hover:shadow-md transition text-center group"
                    >
                      <h3 className="font-display text-2xl text-[#0C1D42] mb-2 group-hover:text-[#DA9E3E]">{group.group}</h3>
                      <p className="text-xs text-[#333333]">Click to view options</p>
                    </button>
                  ))}
                </div>
              ) : (
                // Step 2: Choose Size/Configuration
                <div className="animate-in fade-in slide-in-from-right-4">
                  <div className="flex items-center gap-4 mb-4 border-b border-[#EDE5DB] pb-4">
                    <button 
                      onClick={() => { setSelectedPropertyGroup(null); setSelectedPkg(null); }}
                      className="text-xs font-bold uppercase tracking-widest text-[#DA9E3E] hover:text-[#0C1D42] transition"
                    >
                      ← Back
                    </button>
                    <h3 className="text-sm uppercase tracking-widest font-bold text-[#0C1D42]">
                      {packages.find(g => g.property_type === selectedPropertyGroup)?.group}
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {packages.find(g => g.property_type === selectedPropertyGroup)?.options.map(opt => {
                      const group = packages.find(g => g.property_type === selectedPropertyGroup);
                      const isSelected = selectedPkg?.property_type === group.property_type && selectedPkg?.value === opt.value;
                      return (
                        <button
                          key={`${group.property_type}-${opt.value}`}
                          type="button"
                          onClick={() => setSelectedPkg({ ...opt, property_type: group.property_type })}
                          data-testid={`pkg-${group.property_type}-${opt.value}`}
                          className={`text-left border p-4 transition ${
                            isSelected
                              ? "border-[#0C1D42] bg-[#F5EDE8] ring-2 ring-[#0C1D42]"
                              : "border-[#EDE5DB] bg-white hover:border-[#DA9E3E]"
                          }`}
                        >
                          <div className="flex items-baseline justify-between mb-1">
                            <h4 className="font-display text-lg text-[#0C1D42]">{opt.label}</h4>
                            <span className="font-display text-xl text-[#DA9E3E]">₹{opt.price.toLocaleString("en-IN")}</span>
                          </div>
                          <p className="text-xs text-[#333333]">{opt.blurb}</p>
                          {isSelected && (
                            <p className="mt-2 text-[10px] uppercase tracking-widest font-bold text-[#0C1D42]">✓ Selected</p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Selected package summary + Pay CTA */}
            <div className="bg-[#F5EDE8] border border-[#EDE5DB] p-6" data-testid="unpaid-payment-summary">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-[#333333] font-bold">Selected Package</p>
                  {selectedPkg ? (
                    <p className="font-display text-xl text-[#0C1D42]" data-testid="selected-package-label">
                      {selectedPkg.label}{" "}
                      <span className="text-sm text-[#333333] capitalize">({selectedPkg.property_type})</span>
                    </p>
                  ) : (
                    <p className="text-sm text-[#333333] italic">No package chosen yet.</p>
                  )}
                </div>
                <div className="text-left sm:text-right">
                  <p className="text-[10px] uppercase tracking-widest text-[#333333] font-bold">Design Retainer</p>
                  <p className="font-display text-3xl text-[#0C1D42]" data-testid="selected-package-price">
                    ₹{calculatedPrice.toLocaleString("en-IN")}
                  </p>
                </div>
              </div>
              <button
                onClick={handleConfirmPayment}
                disabled={!selectedPkg || isLoading}
                data-testid="confirm-payment-btn"
                className="bg-[#DA9E3E] text-white px-8 py-4 uppercase tracking-widest text-sm font-bold hover:bg-[#C88C2F] transition w-full shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? "Processing…" : selectedPkg ? `Pay ₹${calculatedPrice.toLocaleString("en-IN")} via Razorpay` : "Select a package to continue"}
              </button>
              <p className="text-[10px] text-gray-500 mt-3 text-center uppercase tracking-wide">
                Secure payment powered by Razorpay.
              </p>
            </div>

            <div className="mt-8 pt-6 border-t border-[#EDE5DB] text-center">
              <button
                onClick={() => setIsDiscoveryOpen(true)}
                data-testid="discovery-cta-btn"
                className="text-sm text-[#333333] hover:text-[#0C1D42] font-medium underline underline-offset-4"
              >
                Not sure yet? Schedule a Discovery Call with our Expert.
              </button>
            </div>
          </div>
        )}

        {/* PHASE 1: BRIEFING */}
        {currentPhase === "briefing" && (
          <div className="animate-in fade-in">
            <h2 className="font-display text-2xl text-[#0C1D42] mb-2">Let&apos;s define your vision.</h2>
            <p className="text-[#333333] mb-8">Tell us about your space and style preferences to kick off the design process.</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div className="md:col-span-2">
                <label className="block text-xs uppercase tracking-widest font-bold text-[#0C1D42] mb-2">
                  Project Name <span className="text-red-500">*</span>
                  <span className="text-gray-400 font-normal lowercase tracking-normal ml-1">(How you&apos;ll refer to this project)</span>
                </label>
                <input
                  type="text"
                  data-testid="project-name-input"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="e.g. Lotus Apartment 3BHK, My Whitefield Villa"
                  className="w-full p-3 border border-[#EDE5DB] focus:outline-none focus:border-[#0C1D42] text-sm"
                />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-widest font-bold text-[#0C1D42] mb-2">Estimated Budget</label>
                <select 
                  className="w-full p-3 border border-[#EDE5DB] focus:outline-none focus:border-[#0C1D42] text-sm mb-2"
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
                    className="w-full p-3 border border-[#0C1D42] focus:outline-none bg-[#F5EDE8] text-sm animate-in fade-in" 
                  />
                )}
              </div>
              <div>
                <label className="block text-xs uppercase tracking-widest font-bold text-[#0C1D42] mb-2">
                  Upload Floor Plan(s) <span className="text-gray-400 font-normal lowercase tracking-normal">(PDF, PNG, JPG, JPEG or WEBP — max 15 MB each. Multiple files allowed.)</span>
                </label>
                <input
                  type="file"
                  multiple
                  accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
                  onChange={handleFloorPlanChange}
                  disabled={isUploadingPlan}
                  data-testid="floor-plan-upload-input"
                  className="w-full p-2 border border-[#EDE5DB] text-sm file:mr-4 file:py-2 file:px-4 file:border-0 file:text-sm file:font-semibold file:bg-[#F5EDE8] file:text-[#0C1D42] hover:file:bg-[#EDE5DB] disabled:opacity-50"
                />
                {isUploadingPlan && (
                  <p className="mt-2 text-xs text-[#333333]">Uploading…</p>
                )}
                {floorPlans.length > 0 && !isUploadingPlan && (
                  <ul className="mt-2 space-y-1" data-testid="floor-plan-upload-success">
                    {floorPlans.map((f, idx) => (
                      <li key={idx} className="text-xs text-[#0C1D42] font-semibold flex items-center gap-2">
                        <span>✓ {f.name}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveFloorPlan(idx)}
                          data-testid={`remove-floor-plan-${idx}`}
                          className="underline text-[#DA9E3E] hover:text-[#C88C2F]"
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <h3 className="font-display text-xl text-[#0C1D42] mb-4 border-b border-[#EDE5DB] pb-2">Overall Design Style</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              {renderStyleCard('Modern Minimalist', 'Clean lines, neutral tones, clutter-free.')}
              {renderStyleCard('Warm Contemporary', 'Rich timber textures, cozy warm lighting.')}
              {renderStyleCard('Ultra-Luxury', 'High-gloss finishes, statement profiles.')}
            </div>

            <div className="mb-8">
              <label className="block text-xs uppercase tracking-widest font-bold text-[#0C1D42] mb-2">
                Room-by-Room Must-Haves <span className="text-gray-400 font-normal lowercase tracking-normal">(Optional but Recommended)</span>
              </label>
              <textarea 
                rows="4"
                className="w-full p-4 border border-[#EDE5DB] focus:outline-none focus:border-[#0C1D42] text-sm resize-y"
                placeholder="e.g., &quot;Living Room: Needs a dedicated Pooja unit. Master Bedroom: Include a small workstation. Kitchen: We prefer closed overhead cabinets and a tall pantry.&quot;"
                value={roomRequirements}
                onChange={(e) => setRoomRequirements(e.target.value)}
              ></textarea>
            </div>

            <button 
              onClick={handleSubmitBrief}
              disabled={isLoading}
              className="bg-[#0C1D42] text-white px-8 py-3 uppercase tracking-widest text-xs font-bold hover:bg-[#08142D] transition disabled:opacity-50"
            >
              {isLoading ? "Submitting..." : "Submit Brief"}
            </button>
          </div>
        )}

        {/* PHASE 1.5: VERIFICATION */}
        {currentPhase === "verification" && (
          <div className="animate-in fade-in text-center py-10">
            <div className="inline-block w-12 h-12 border-4 border-[#F5EDE8] border-t-[#0C1D42] rounded-full animate-spin mb-4"></div>
            <h2 className="font-display text-2xl text-[#0C1D42] mb-2">Verifying your project details.</h2>
            <p className="text-[#333333] max-w-md mx-auto">
              Our team is currently reviewing your uploaded floor plan to ensure it matches the selected property type. This usually takes a few hours. We will unlock your site visit scheduling momentarily.
            </p>
          </div>
        )}

        {/* PHASE 5: READY FOR QUOTATION */}
        {currentPhase === 'ready_for_quotation' && (
          <div className="animate-in fade-in space-y-6">
            <div className="bg-[#F5EDE8] border-l-4 border-[#DA9E3E] p-4">
              <h4 className="text-[#0C1D42] font-bold text-sm uppercase tracking-widest">Designs Approved — Quotation Stage</h4>
              <p className="text-[#333333] text-sm mt-1">
                All your 3D designs are approved. Our team is preparing your detailed execution quotation.
              </p>
            </div>

            {quotation ? (
              <div id="invoices" className="bg-white border border-[#EDE5DB] p-6" data-testid="quotation-hub">
                <h3 className="font-display text-xl text-[#0C1D42] mb-4">Your Execution Quotation</h3>

                {/* Itemized Line Items */}
                <div className="overflow-x-auto mb-6">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[#F5EDE8]">
                        <th className="text-left p-3 text-xs uppercase tracking-widest text-[#0C1D42]">Category</th>
                        <th className="text-left p-3 text-xs uppercase tracking-widest text-[#0C1D42]">Description</th>
                        <th className="text-right p-3 text-xs uppercase tracking-widest text-[#0C1D42]">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(quotation.line_items || []).map((item, i) => (
                        <tr key={i} className="border-t border-[#EDE5DB]">
                          <td className="p-3 font-medium text-[#0C1D42]">{item.category}</td>
                          <td className="p-3 text-[#333333]">{item.description}</td>
                          <td className="p-3 text-right font-display text-[#DA9E3E]">
                            ₹{Number(item.amount).toLocaleString('en-IN')}
                          </td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-[#0C1D42] bg-[#F5EDE8]">
                        <td className="p-3 font-bold text-[#0C1D42]" colSpan={2}>Total Execution Cost</td>
                        <td className="p-3 text-right font-display text-2xl text-[#0C1D42]">
                          ₹{Number(quotation.total_amount || 0).toLocaleString('en-IN')}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Payment Schedule */}
                {quotation.milestones && quotation.milestones.length > 0 && (
                  <div className="mb-6 space-y-4">
                    <p className="font-display text-lg text-[#0C1D42] border-b border-[#EDE5DB] pb-2">Payment Milestones</p>
                    {quotation.milestones.map((ms, idx) => (
                      <div key={ms.id} className={`border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${ms.status === 'paid' ? 'bg-[#F5EDE8] border-[#0C1D42]' : ms.status === 'unlocked' ? 'bg-white border-[#DA9E3E] shadow-sm' : 'bg-gray-50 border-gray-200 opacity-70'}`}>
                        <div>
                          <p className={`font-bold ${ms.status === 'paid' ? 'text-[#0C1D42]' : 'text-gray-800'}`}>{ms.name}</p>
                          <p className="text-sm text-[#333333]">Amount: <span className="font-bold text-base">₹{ms.amount.toLocaleString('en-IN')}</span></p>
                          <p className="text-xs text-gray-500 mt-1">Tentative Date: {ms.tentative_date}</p>
                          {ms.deducted_prev_payments > 0 && (
                            <p className="text-[10px] text-[#DA9E3E] font-bold uppercase tracking-widest mt-1">
                              * Adjusted: Includes deduction of ₹{ms.deducted_prev_payments.toLocaleString('en-IN')} paid earlier for design.
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          {ms.status === 'paid' ? (
                            <div>
                              <span className="text-[#0C1D42] font-bold text-sm uppercase tracking-widest bg-white px-3 py-1 border border-[#0C1D42] inline-block mb-1">Paid</span>
                              {ms.receipt_id && <p className="text-[10px] text-gray-500">Ref: {ms.receipt_id}</p>}
                            </div>
                          ) : ms.status === 'unlocked' ? (
                            <button
                              onClick={() => handlePayQuotationMilestone(ms.id)}
                              disabled={isPayingAdvance}
                              className="bg-[#DA9E3E] text-white px-6 py-3 uppercase tracking-widest text-xs font-bold hover:bg-[#C88C2F] transition disabled:opacity-60"
                            >
                              {isPayingAdvance ? 'Processing…' : 'Pay Now'}
                            </button>
                          ) : (
                            <span className="text-gray-400 text-xs uppercase tracking-widest font-bold border border-gray-300 px-3 py-1 inline-block">Locked</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Notes */}
                {quotation.notes && (
                  <p className="text-sm text-[#333333] mb-6 italic">{quotation.notes}</p>
                )}

                {quotation.pdf_url && (
                  <div className="flex gap-3">
                    <a
                      href={quotation.pdf_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      download
                      className="border border-[#0C1D42] text-[#0C1D42] px-6 py-3 text-xs uppercase tracking-widest font-bold hover:bg-[#F5EDE8] transition text-center inline-block"
                    >
                      Download PDF Quotation
                    </a>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white border border-[#EDE5DB] p-8 text-center">
                <div className="inline-block w-10 h-10 border-4 border-[#F5EDE8] border-t-[#DA9E3E] rounded-full animate-spin mb-4"></div>
                <p className="text-[#333333] text-sm">Our team is preparing your detailed quotation. You&apos;ll be notified as soon as it&apos;s ready.</p>
              </div>
            )}
          </div>
        )}

        {/* PHASE 6: PRODUCTION */}
        {currentPhase === 'production' && (
          <div className="animate-in fade-in space-y-6">
            <div className="bg-[#0C1D42] text-white p-6">
              <h3 className="font-display text-2xl mb-2">🏭 Your project is in production!</h3>
              <p className="text-sm opacity-80">Booking advance received. Our factory team is building your home interiors. We&apos;ll keep you updated on the 45-day delivery timeline.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white border border-[#EDE5DB] p-5 text-center">
                <p className="text-[10px] uppercase tracking-widest text-[#333333] mb-1">Timeline</p>
                <p className="font-display text-2xl text-[#0C1D42]">45 Days</p>
              </div>
              <div className="bg-white border border-[#EDE5DB] p-5 text-center">
                <p className="text-[10px] uppercase tracking-widest text-[#333333] mb-1">Warranty</p>
                <p className="font-display text-2xl text-[#0C1D42]">10 Years</p>
              </div>
              <div className="bg-white border border-[#EDE5DB] p-5 text-center">
                <p className="text-[10px] uppercase tracking-widest text-[#333333] mb-1">Status</p>
                <p className="font-display text-2xl text-[#DA9E3E]">Active</p>
              </div>
            </div>
          </div>
        )}

        {/* PHASE 4: DESIGNING
            Also handles legacy phases: "scheduling" and "confirmed" were removed
            from the phase flow in Feb 2026. Users with those phases in the DB
            are shown the designing UI so they are not stuck on a blank screen. */}
        {(currentPhase === "designing" ||
          currentPhase === "scheduling" || currentPhase === "confirmed") && (
          <div className="animate-in fade-in space-y-6">
            {/* Design started banner */}
            <div className="bg-[#F5EDE8] border-l-4 border-[#0C1D42] p-4" data-testid="design-started-banner">
              <h4 className="text-[#0C1D42] font-bold text-sm uppercase tracking-widest">Design has started</h4>
              <p className="text-[#333333] text-sm mt-1">
                Your floor plan is approved. Your designer is crafting your 3D renders right now — they&apos;ll appear below the moment they&apos;re uploaded for your review.
              </p>
            </div>

            {/* Site visit scheduler */}
            {user?.site_visit_at && !isRescheduling ? (
              <div className="bg-white border border-[#EDE5DB] p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3" data-testid="site-visit-confirmed">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-[#0C1D42] font-bold">Site Visit Scheduled</p>
                  <p className="font-display text-lg text-[#0C1D42]">{new Date(user.site_visit_at).toLocaleString()}</p>
                  <p className="text-xs text-[#333333] mb-3">Our lead engineer will visit your property for precise measurements.</p>
                  <div className="bg-[#F5EDE8]/50 border border-[#EDE5DB] p-3 rounded mt-2 inline-block">
                    <p className="text-xs text-[#0C1D42] mb-1">
                      <span className="font-bold">Important:</span> Please send your Google Maps location to your Design Engineer.
                    </p>
                    <div className="flex flex-wrap items-center gap-4 text-xs font-medium mt-2">
                      <span className="text-[#333333]">Name: <strong>{user?.assignee_profile?.name || "Kiran"}</strong></span>
                      <a href={`tel:${user?.assignee_profile?.mobile?.replace(/\s/g, '') || "+919876543210"}`} className="text-[#DA9E3E] hover:underline flex items-center gap-1">
                        📞 {user?.assignee_profile?.mobile || "+91 98765 43210"}
                      </a>
                      <a 
                        href={`https://wa.me/${(user?.assignee_profile?.mobile?.replace(/\D/g, '') || "919876543210")}?text=Hi%20${user?.assignee_profile?.name || "Kiran"},%20here%20is%20the%20Google%20Maps%20location%20for%20my%20scheduled%20site%20visit:`} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="text-green-600 hover:underline flex items-center gap-1"
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
                        </svg>
                        WhatsApp
                      </a>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => { 
                    const days = getNext3Days();
                    setSelectedVisitDate(days[0]);
                    setSelectedVisitSlot(null);
                    setIsRescheduling(true); 
                  }}
                  data-testid="reschedule-site-visit-btn"
                  className="text-xs underline text-[#DA9E3E]"
                >Reschedule</button>
              </div>
            ) : (
              <div className="bg-white border border-[#DA9E3E] p-6" data-testid="site-visit-picker">
                <p className="text-[10px] uppercase tracking-widest text-[#DA9E3E] font-bold mb-2">Schedule your site visit</p>
                <p className="text-sm text-[#333333] mb-5">
                  Choose an available slot below. We&apos;ll send a lead engineer to take exact measurements at your property — this happens in parallel with the design work.
                </p>

                {/* Date Selector */}
                <div className="space-y-2">
                  <span className="block text-[10px] uppercase tracking-widest font-bold text-[#0C1D42]">1. Select Date</span>
                  <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-gray-200">
                    {getNext3Days().map((date, idx) => {
                      const isSelected = selectedVisitDate && selectedVisitDate.toDateString() === date.toDateString();
                      return (
                        <button
                          key={idx}
                          onClick={() => {
                            setSelectedVisitDate(date);
                            setSelectedVisitSlot(null);
                          }}
                          className={`px-4 py-2 text-xs uppercase tracking-widest font-bold border transition whitespace-nowrap rounded ${
                            isSelected
                              ? "bg-[#0C1D42] text-white border-[#0C1D42]"
                              : "border-[#EDE5DB] text-[#333333] hover:bg-[#F5EDE8]"
                          }`}
                        >
                          {formatDayLabel(date)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Time Slot Selector */}
                {selectedVisitDate && (
                  <div className="mt-6 space-y-2">
                    <span className="block text-[10px] uppercase tracking-widest font-bold text-[#0C1D42]">2. Select Time Slot (8:00 AM - 8:00 PM)</span>
                    {loadingSlots ? (
                      <p className="text-xs text-gray-500 italic py-2">Checking availability...</p>
                    ) : getAvailableSlots(selectedVisitDate).length === 0 ? (
                      <p className="text-xs text-gray-500 italic py-2">No available slots for this date. Please select another date.</p>
                    ) : (
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                        {getAvailableSlots(selectedVisitDate).map((slot) => {
                          const isSelected = selectedVisitSlot && selectedVisitSlot.value === slot.value;
                          return (
                            <button
                              key={slot.value}
                              onClick={() => setSelectedVisitSlot(slot)}
                              className={`p-2.5 text-xs text-center border transition rounded ${
                                isSelected
                                  ? "bg-[#DA9E3E] text-white border-[#DA9E3E] font-bold"
                                  : "border-[#EDE5DB] text-[#0C1D42] hover:bg-[#F5EDE8]"
                              }`}
                            >
                              {slot.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Confirm Site Visit Info and button */}
                <div className="mt-8 pt-6 border-t border-[#EDE5DB] flex flex-col sm:flex-row justify-between items-center gap-4">
                  <div className="text-left w-full sm:w-auto">
                    {selectedVisitDate && selectedVisitSlot ? (
                      <p className="text-xs text-[#0C1D42]">
                        Selected Slot: <strong className="text-[#DA9E3E]">{formatDayLabel(selectedVisitDate)} at {selectedVisitSlot.label}</strong>
                      </p>
                    ) : (
                      <p className="text-xs text-gray-400">Please select a date and time slot to continue.</p>
                    )}
                  </div>
                  <div className="flex gap-2 w-full sm:w-auto">
                    {isRescheduling && (
                      <button
                        onClick={() => setIsRescheduling(false)}
                        className="px-6 py-3 text-xs uppercase tracking-widest font-bold border border-[#EDE5DB] hover:bg-gray-50 flex-1 sm:flex-none text-center"
                      >
                        Cancel
                      </button>
                    )}
                    <button
                      onClick={handleSubmitSiteVisit}
                      disabled={isLoading || !selectedVisitDate || !selectedVisitSlot}
                      data-testid="site-visit-submit-btn"
                      className="bg-[#0C1D42] text-white px-8 py-3 uppercase tracking-widest text-xs font-bold hover:bg-[#08142D] disabled:opacity-50 flex-1 sm:flex-none text-center"
                    >
                      {isLoading ? "Saving…" : "Confirm Site Visit"}
                    </button>
                  </div>
                </div>
              </div>
            )}
            <div id="designs" className="animate-in fade-in">
              <CustomerDesignReview phase={currentPhase} onProjectAdvance={refresh} />
            </div>
          </div>
        )}

      </div>

      {/* DISCOVERY CALL MODAL OVERLAY */}
      {isDiscoveryOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md shadow-xl animate-in zoom-in-95">
            <div className="bg-[#0C1D42] text-white p-6 flex justify-between items-center">
              <div>
                <h3 className="font-display text-xl">Talk to a Real Human</h3>
              </div>
              <button onClick={() => setIsDiscoveryOpen(false)} className="text-white hover:text-gray-300 text-2xl">&times;</button>
            </div>
            <div className="p-8">
              <p className="text-sm text-[#333333] mb-6 leading-relaxed">
                Enter your number. If it is between 9:00 AM and 7:00 PM, an expert will call you back in under 30 minutes with zero sales pressure.
              </p>
              <div className="space-y-4 mb-8">
                <input 
                  type="text" 
                  placeholder="Your Full Name" 
                  value={billingDetails.name}
                  onChange={(e) => setBillingDetails({...billingDetails, name: e.target.value})}
                  className="w-full p-3 border border-[#EDE5DB] focus:outline-none focus:border-[#0C1D42] text-sm" 
                />
                <input 
                  type="tel" 
                  placeholder="Your Phone Number" 
                  value={billingDetails.phone}
                  onChange={(e) => setBillingDetails({...billingDetails, phone: e.target.value})}
                  className="w-full p-3 border border-[#EDE5DB] focus:outline-none focus:border-[#0C1D42] text-sm" 
                />
              </div>
              <button 
                onClick={handleDiscoverySubmit}
                disabled={isLoading}
                className="bg-[#DA9E3E] text-white px-8 py-4 uppercase tracking-widest text-sm font-bold hover:bg-[#C88C2F] transition w-full shadow-md disabled:opacity-50"
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
          <h3 className="font-display text-xl mb-6 text-[#0C1D42]">Project Journey</h3>
          <div className="flex flex-col md:flex-row gap-2 justify-between items-center text-center text-sm mb-12">
            <div className={`flex-1 border-b-4 pb-2 w-full ${currentPhase === 'briefing' ? 'border-[#0C1D42]' : ['verification','scheduling','confirmed','designing','ready_for_quotation','production'].includes(currentPhase) ? 'border-[#DA9E3E]' : 'border-[#EDE5DB] opacity-40'}`}>1. Briefing &amp; Review</div>
            <div className={`flex-1 border-b-4 pb-2 w-full ${['designing','ready_for_quotation','production'].includes(currentPhase) ? 'border-[#0C1D42]' : ['verification','scheduling','confirmed'].includes(currentPhase) ? 'border-[#DA9E3E]' : 'border-[#EDE5DB] opacity-40'}`}>2. Site Visit &amp; Design</div>
            <div className={`flex-1 border-b-4 pb-2 w-full ${currentPhase === 'designing' ? 'border-[#DA9E3E]' : ['ready_for_quotation','production'].includes(currentPhase) ? 'border-[#0C1D42]' : 'border-[#EDE5DB] opacity-40'}`}>3. 3D Design</div>
            <div className={`flex-1 border-b-4 pb-2 w-full ${currentPhase === 'ready_for_quotation' ? 'border-[#DA9E3E]' : currentPhase === 'production' ? 'border-[#0C1D42]' : 'border-[#EDE5DB] opacity-40'}`}>4. Quotation &amp; Approval</div>
            <div className={`flex-1 border-b-4 pb-2 w-full ${currentPhase === 'production' ? 'border-[#DA9E3E]' : 'border-[#EDE5DB] opacity-40'}`}>5. Production</div>
          </div>

          <div className="bg-white border border-[#EDE5DB] p-6">
            <h3 className="font-display text-lg mb-4 text-[#0C1D42]">Document Vault</h3>
            <DocumentVault leadId={user.lead_id} allowUpload={true} />
            {quotation?.pdf_url && (
              <div className="mt-4 pt-4 border-t border-[#EDE5DB]">
                <a
                  href={quotation.pdf_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  download
                  className="inline-flex items-center gap-3 p-3 border border-[#EDE5DB] hover:border-[#DA9E3E] transition text-sm text-[#0C1D42] font-medium"
                >
                  <span>&#128196;</span>
                  <span>Execution Quotation PDF</span>
                </a>
              </div>
            )}
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
          <button onClick={() => setCurrentPhase('ready_for_quotation')} className="underline">5. Quotation</button>
          <button onClick={() => setCurrentPhase('production')} className="underline">6. Production</button>
          <div className="w-full border-t border-red-200 my-2"></div>
          <span className="font-bold text-red-600">Test CRM Alerts:</span>
          <button onClick={() => setCallStatus('missed')} className="underline bg-white px-2 py-1 rounded">Trigger &apos;Missed Call&apos; Banner</button>
          <button onClick={() => setCallStatus('none')} className="underline bg-white px-2 py-1 rounded">Clear Banner</button>
        </div>
      )}

    </DashShell>
  );
}
