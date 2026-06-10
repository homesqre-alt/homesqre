import { useState, useEffect } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { MapPin } from "lucide-react";

export default function ProfileComplete() {
  const { user, setUserData } = useAuth();
  const nav = useNavigate();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    city: "",
    locality: "",
    name: "",
    mobile: "",
    email: "",
    property_type: "Apartment",
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) {
      setForm((f) => ({
        ...f,
        name: user.name || f.name,
        mobile: user.mobile || f.mobile,
        email: user.email || f.email,
        city: user.city || "Bangalore"
      }));
    }
  }, [user]);

  if (user === undefined) return null;
  if (user === null) return <Navigate to="/login" />;
  if (user.profile_completed && step === 1) {
    const dash =
      user.role === "admin" ? "/dashboard/admin"
      : user.role === "sales" ? "/dashboard/sales"
      : user.role === "designer" ? "/dashboard/designer"
      : "/dashboard/customer";
    return <Navigate to={dash} replace />;
  }

  const handleAutoDetect = () => {
    if (navigator.geolocation) {
      toast.info("Detecting location...");
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setForm({ ...form, city: "Bangalore" });
          toast.success("Location detected (Defaulting to Bangalore for service area)");
        },
        () => {
          toast.error("Failed to detect location.");
        }
      );
    } else {
      toast.error("Geolocation is not supported by this browser.");
    }
  };

  const nextStep = (e) => {
    e.preventDefault();
    if (step === 1 && !form.city) {
      toast.error("Please select your city.");
      return;
    }
    if (step === 2) {
      if (!form.name || !form.mobile) {
        toast.error("Name and mobile are required.");
        return;
      }
    }
    setStep(step + 1);
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      // 1. Update Profile
      const { data } = await api.put("/me/profile", {
        name: form.name,
        mobile: form.mobile,
        email: form.email,
        city: form.city,
        role: "customer"
      });
      setUserData(data);

      // 2. We can optionally submit a lead/project requirement here if backend supports it
      toast.success("Profile complete! Welcome to your design journey.");
      nav("/dashboard/customer");
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2">
      <div className="hidden lg:block relative">
        <img
          src="https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=1400&q=80"
          alt="Interior Design"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-black/20" />
        <div className="absolute bottom-12 left-12 right-12 text-white">
          <div className="label-eyebrow text-[#DA9E3E] mb-4">Step {step} of 3</div>
          <h2 className="font-display text-5xl leading-tight">
            Let's design your <span className="italic text-[#DA9E3E]">dream home.</span>
          </h2>
        </div>
      </div>

      <div className="flex flex-col justify-center px-6 sm:px-12 lg:px-24 py-12">
        <div className="mb-12"><img src="/logo.svg" alt="Homesqre" className="h-24 md:h-32 w-auto object-contain mx-auto" /></div>
        
        {step === 1 && (
          <form onSubmit={nextStep} className="space-y-6 max-w-md w-full mx-auto" data-testid="onboarding-step-1">
            <h1 className="font-display text-4xl mb-2">Where is your home?</h1>
            <p className="text-sm text-[#333333] mb-8">We currently serve select cities for end-to-end interiors.</p>
            
            <button type="button" onClick={handleAutoDetect} className="btn-secondary w-full justify-center mb-4">
              <MapPin size={16} /> Auto-detect my location
            </button>
            
            <div className="flex items-center gap-4 my-4">
              <div className="flex-1 h-px bg-[#EDE5DB]" />
              <span className="label-eyebrow">OR CHOOSE</span>
              <div className="flex-1 h-px bg-[#EDE5DB]" />
            </div>

            <select
              className="hs-input"
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
              required
            >
              <option value="">Select City</option>
              <option value="Bangalore">Bangalore</option>
            </select>
            {form.city && form.city !== "Bangalore" && (
              <p className="text-red-500 text-xs">Note: We currently only operate in Bangalore.</p>
            )}

            <button className="btn-primary w-full justify-center mt-6">Continue</button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={nextStep} className="space-y-6 max-w-md w-full mx-auto" data-testid="onboarding-step-2">
            <h1 className="font-display text-4xl mb-2">Contact Details</h1>
            <p className="text-sm text-[#333333] mb-8">Please provide your missing contact information.</p>
            
            <div>
              <label className="label-eyebrow mb-2 block">Full name *</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="hs-input"
                data-testid="profile-name"
              />
            </div>
            <div>
              <label className="label-eyebrow mb-2 block">Mobile Number *</label>
              <input
                required
                value={form.mobile}
                onChange={(e) => setForm({ ...form, mobile: e.target.value })}
                className="hs-input"
                placeholder="+91 9999900000"
                data-testid="profile-mobile"
              />
            </div>
            <div>
              <label className="label-eyebrow mb-2 block">Email Address</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="hs-input"
                data-testid="profile-email"
              />
            </div>

            <button className="btn-primary w-full justify-center mt-6">Continue</button>
          </form>
        )}

        {step === 3 && (
          <form onSubmit={submit} className="space-y-6 max-w-md w-full mx-auto" data-testid="onboarding-step-3">
            <h1 className="font-display text-4xl mb-2">Project Requirements</h1>
            <p className="text-sm text-[#333333] mb-8">Tell us a bit about your property.</p>
            
            <div>
              <label className="label-eyebrow mb-2 block">Property Type</label>
              <select
                className="hs-input"
                value={form.property_type}
                onChange={(e) => setForm({ ...form, property_type: e.target.value })}
              >
                <option value="Apartment">Apartment</option>
                <option value="Villa">Villa</option>
                <option value="Independent House">Independent House</option>
              </select>
            </div>
            
            <div>
              <label className="label-eyebrow mb-2 block">Locality / Area</label>
              <input
                value={form.locality}
                onChange={(e) => setForm({ ...form, locality: e.target.value })}
                className="hs-input"
                placeholder="e.g. Indiranagar, Whitefield"
                required
              />
            </div>

            <button disabled={busy} className="btn-gold w-full justify-center mt-6">
              {busy ? "Starting Journey..." : "Start Design Journey"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
