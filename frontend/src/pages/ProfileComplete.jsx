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
    name: "",
    mobile: "",
    email: "",
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) {
      setForm((f) => ({
        ...f,
        name: user.name || f.name,
        mobile: user.mobile || f.mobile,
        email: user.email || f.email
    }
  }, [user]);

  if (user === undefined) return null;
  if (user === null) return <Navigate to="/login" />;
  if (user.profile_completed && user.mobile) {
    const dash =
      user.role === "admin" ? "/dashboard/admin"
      : user.role === "sales" ? "/dashboard/sales"
      : user.role === "designer" ? "/dashboard/designer"
      : "/dashboard/customer";
    return <Navigate to={dash} replace />;
  }
  
  // Auto-submit if we already have name and mobile
  useEffect(() => {
    if (user && user.name && user.mobile && !user.profile_completed && !busy) {
      submit(new Event('submit'));
    }
  }, [user]);



  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      // 1. Update Profile
      const { data } = await api.put("/me/profile", {
        name: form.name,
        mobile: form.mobile,
        email: form.email,
        city: "Bangalore", // Defaulted silently
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
          <div className="label-eyebrow text-[#DA9E3E] mb-4">Welcome</div>
          <h2 className="font-display text-5xl leading-tight">
            Let's design your <span className="italic text-[#DA9E3E]">dream home.</span>
          </h2>
        </div>
      </div>

      <div className="flex flex-col justify-center px-6 sm:px-12 lg:px-24 py-12">
        <div className="mb-12"><img src="/logo.svg" alt="Homesqre" className="h-16 w-auto object-contain mx-auto" /></div>
        
        {step === 1 && (
          <form onSubmit={submit} className="space-y-6 max-w-md w-full mx-auto" data-testid="onboarding-step-2">
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

            <button disabled={busy} className="btn-primary w-full justify-center mt-6">
              {busy ? "Saving..." : "Start Design Journey"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
