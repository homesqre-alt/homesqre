import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { GoogleOAuthProvider, GoogleLogin, useGoogleLogin } from "@react-oauth/google";
import { useAuth } from "@/context/AuthContext";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";

const GOOGLE_CLIENT_ID = "792218859682-0c3n97260bmmnihocosutpm00vvliivt.apps.googleusercontent.com";

// Dynamic Scarcity Logic
const getAvailableSpots = () => {
  const day = new Date().getDate();
  if (day <= 7) return 8;
  if (day <= 14) return 6;
  if (day <= 21) return 4;
  return 2;
};

export default function LeadCaptureModal({ open, onOpenChange }) {
  const { googleLogin, setUserData } = useAuth();
  const navigate = useNavigate();
  const [spotsLeft, setSpotsLeft] = useState(8);
  
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    location: "",
  });
  const [otp, setOtp] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [devOtp, setDevOtp] = useState("");
  const [salesRep, setSalesRep] = useState(null);

  useEffect(() => {
    if (open) {
      setSpotsLeft(getAvailableSpots());
      setStep(1);
      setFormData({ name: "", email: "", phone: "", location: "" });
      setOtp("");
      setDevOtp("");
      setSalesRep(null);
    }
  }, [open]);

  const handleGoogleSuccess = async (credentialResponse) => {
    try {
      const u = await googleLogin(credentialResponse.credential);
      if (u) {
        if (!u.mobile) {
          toast.error("Please provide your mobile number to continue.");
          setFormData({...formData, name: u.name, email: u.email});
          setStep(1);
        } else {
          toast.success("Successfully logged in!");
          onOpenChange(false);
          navigate("/dashboard/customer");
        }
      }
    } catch (err) {
      console.error(err);
      toast.error("Google login failed. Please try again.");
    }
  };

  const handleStep1Submit = async (e) => {
    e.preventDefault();
    if (formData.phone.length !== 10 || !/^\d+$/.test(formData.phone)) {
      toast.error("Please enter a valid 10-digit phone number.");
      return;
    }
    setIsSubmitting(true);
    try {
      const { data } = await api.post("/auth/lead-capture", {
        name: formData.name,
        email: formData.email,
        mobile: formData.phone,
        location: formData.location
      });
      if (data.dev_otp) {
        setDevOtp(data.dev_otp);
        toast.success(`OTP Sent! (Dev mode: ${data.dev_otp})`);
      }
      window.gtag?.('event', 'lead_initiated');
      setStep(2);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to send OTP.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStep2Submit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const { data } = await api.post("/auth/lead-verify", {
        mobile: formData.phone,
        otp: otp
      });
      if (data.token && data.user) {
        setUserData(data.user);
        window.gtag?.('event', 'lead_completed');
        if (data.sales_rep) {
          setSalesRep(data.sales_rep);
          setStep(3);
        } else {
          toast.success("Verified! Welcome to Homesqre.");
          onOpenChange(false);
          navigate("/dashboard/customer");
        }
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || "Invalid OTP.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] bg-[#FCFAF5] border-[#D4C9BE] p-0 overflow-hidden">
        <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
          <div className="bg-[#0C1D42] p-6 text-center">
            <div className="inline-flex items-center gap-2 bg-red-500/20 text-red-100 text-[10px] tracking-widest uppercase px-3 py-1 font-semibold mb-3 rounded-full border border-red-500/30">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              Only {spotsLeft} onboarding spots left this month
            </div>
            <DialogTitle className="font-display text-3xl text-white mb-2">
              Start Designing Risk-Free
            </DialogTitle>
            <DialogDescription className="text-white/70 text-sm">
              Get a 100% fixed quote after you approve the design. Zero blind commitments. No bump-up pricing later.
            </DialogDescription>
          </div>

          <div className="p-6">
            {step === 1 ? (
              <div className="space-y-5">
                <div className="flex justify-center mb-4 transform scale-[1.15] origin-center py-2">
                  <GoogleLogin
                    onSuccess={handleGoogleSuccess}
                    onError={() => toast.error("Google authentication failed")}
                    text="continue_with"
                    shape="rectangular"
                    theme="filled_blue"
                    width="100%"
                    size="large"
                  />
                </div>
                
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-[#D4C9BE]" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase tracking-widest">
                    <span className="bg-[#FCFAF5] px-2 text-[#333333]/50">Or fill details manually</span>
                  </div>
                </div>

                <form onSubmit={handleStep1Submit} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs tracking-widest uppercase text-[#333333] font-semibold">Full Name</label>
                    <input
                      type="text"
                      required
                      placeholder="John Doe"
                      className="flex h-10 w-full rounded-md border border-[#D4C9BE] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#DA9E3E]"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-xs tracking-widest uppercase text-[#333333] font-semibold">Email</label>
                    <input
                      type="email"
                      required
                      placeholder="john@example.com"
                      className="flex h-10 w-full rounded-md border border-[#D4C9BE] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#DA9E3E]"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs tracking-widest uppercase text-[#333333] font-semibold">Phone Number</label>
                    <input
                      type="tel"
                      required
                      placeholder="9876543210"
                      maxLength={10}
                      className="flex h-10 w-full rounded-md border border-[#D4C9BE] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#DA9E3E]"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value.replace(/\D/g, '') })}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-xs tracking-widest uppercase text-[#333333] font-semibold">Location (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. Prestige Falcon City"
                      className="flex h-10 w-full rounded-md border border-[#D4C9BE] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#DA9E3E]"
                      value={formData.location}
                      onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    />
                  </div>

                  <button type="submit" disabled={isSubmitting} className="w-full btn-gold justify-center mt-2">
                    {isSubmitting ? "Sending OTP..." : "Get OTP"}
                  </button>
                </form>
              </div>
            ) : (
              <form onSubmit={handleStep2Submit} className="space-y-4">
                <div className="text-center mb-6">
                  <p className="text-sm text-[#333333]">We sent a verification code to <strong>{formData.phone}</strong></p>
                  <button type="button" onClick={() => setStep(1)} className="text-xs text-[#DA9E3E] font-semibold tracking-widest uppercase mt-2">
                    Change Number
                  </button>
                </div>

                <div className="space-y-2">
                  <label className="text-xs tracking-widest uppercase text-[#333333] font-semibold">Enter OTP</label>
                  <input
                    type="text"
                    required
                    placeholder="123456"
                    maxLength={6}
                    className="flex h-10 w-full rounded-md border border-[#D4C9BE] bg-white px-3 py-2 text-sm text-center tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-[#DA9E3E]"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  />
                  {devOtp && <p className="text-xs text-[#333333]/50 text-center mt-1">Dev OTP: {devOtp}</p>}
                </div>

                <button type="submit" disabled={isSubmitting} className="w-full btn-gold justify-center mt-4">
                  {isSubmitting ? "Verifying..." : "Verify & Start Journey"}
                </button>
              </form>
            ) : step === 3 ? (
              <div className="space-y-6 text-center">
                <div className="font-display text-2xl text-[#0C1D42]">You're all set!</div>
                <p className="text-sm text-[#333333]">Your dedicated design consultant will reach out to you shortly.</p>
                {salesRep && (
                  <div className="bg-[#F5EDE8] p-5 rounded-md border border-[#D4C9BE]">
                    <p className="text-[10px] uppercase tracking-widest text-[#333333]/60 font-semibold mb-1">Your Design Consultant</p>
                    <p className="font-display text-xl text-[#DA9E3E] mb-1">{salesRep.name}</p>
                    <p className="text-base text-[#333333] font-semibold">{salesRep.mobile}</p>
                  </div>
                )}
                <button onClick={() => { onOpenChange(false); navigate("/dashboard/customer"); }} className="w-full btn-gold justify-center mt-4">
                  Go to Dashboard
                </button>
              </div>
            ) : null}
            
            <p className="text-[10px] text-center text-[#333333]/60 mt-6 leading-relaxed">
              By proceeding, you agree to our terms. We promise not to spam you, we respect your privacy.
            </p>
          </div>
        </GoogleOAuthProvider>
      </DialogContent>
    </Dialog>
  );
}
