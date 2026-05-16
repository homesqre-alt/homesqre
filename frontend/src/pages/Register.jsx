import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";

const ROLES = [
  { value: "customer", label: "I'm looking for a home" },
  { value: "agent", label: "I'm an agent" },
  { value: "builder", label: "I'm a builder" },
];

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
const googleLogin = () => {
  const redirectUrl = window.location.origin + "/";
  window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
};

export default function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ name: "", email: "", mobile: "", password: "", role: "customer" });
  const [otp, setOtp] = useState("");
  const [devOtp, setDevOtp] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const data = await register(form);
      setDevOtp(data.dev_otp || "");
      toast.success("OTP sent to your mobile (check console for dev OTP)");
      setStep(2);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/auth/verify-otp", { email: form.email, otp });
      toast.success("Verified! Welcome to Homesqre.");
      const dash =
        form.role === "agent"
          ? "/dashboard/agent"
          : form.role === "builder"
          ? "/dashboard/builder"
          : "/dashboard/customer";
      nav(dash);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2">
      <div className="hidden lg:block relative">
        <img
          src="https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=1400&q=80"
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 to-black/60" />
        <div className="absolute bottom-12 left-12 right-12 text-white">
          <div className="label-eyebrow text-[#B68D40] mb-4">Join Homesqre</div>
          <h2 className="font-display text-5xl leading-tight">
            Find, list and design<br /><span className="italic text-[#B68D40]">all in one place.</span>
          </h2>
        </div>
      </div>

      <div className="flex flex-col justify-center px-6 sm:px-12 lg:px-24 py-12">
        <Link to="/" className="font-display text-3xl text-[#06402B] mb-12">Homesqre</Link>

        {step === 1 && (
          <>
            <h1 className="font-display text-4xl mb-3">Create your account</h1>
            <p className="text-sm text-[#4A5D54] mb-10">Takes less than a minute.</p>

            <form onSubmit={submit} className="space-y-6 max-w-md" data-testid="register-form">
              <div>
                <label className="label-eyebrow mb-2 block">I am</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {ROLES.map((r) => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => setForm({ ...form, role: r.value })}
                      className={`text-xs p-3 border tracking-wide ${
                        form.role === r.value
                          ? "border-[#06402B] bg-[#06402B] text-[#FAF9F6]"
                          : "border-[#E8E4D9] text-[#1A2421]"
                      }`}
                      data-testid={`role-${r.value}`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label-eyebrow mb-2 block">Full name</label>
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="hs-input" data-testid="reg-name" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label-eyebrow mb-2 block">Email</label>
                  <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="hs-input" data-testid="reg-email" />
                </div>
                <div>
                  <label className="label-eyebrow mb-2 block">Mobile</label>
                  <input required value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} className="hs-input" data-testid="reg-mobile" />
                </div>
              </div>
              <div>
                <label className="label-eyebrow mb-2 block">Password</label>
                <input type="password" required minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="hs-input" data-testid="reg-password" />
              </div>
              <button disabled={busy} className="btn-primary w-full justify-center" data-testid="reg-submit">
                {busy ? "Creating…" : "Create account & send OTP"}
              </button>
            </form>

            <div className="my-6 flex items-center gap-4 max-w-md">
              <div className="flex-1 h-px bg-[#E8E4D9]" />
              <span className="label-eyebrow">or</span>
              <div className="flex-1 h-px bg-[#E8E4D9]" />
            </div>

            <button onClick={googleLogin} className="btn-secondary w-full justify-center max-w-md" data-testid="google-signup">
              Continue with Google
            </button>

            <div className="mt-8 text-sm text-[#4A5D54] max-w-md">
              Already a member? <Link to="/login" className="text-[#06402B] hover:text-[#B68D40]">Sign in</Link>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h1 className="font-display text-4xl mb-3">Verify mobile</h1>
            <p className="text-sm text-[#4A5D54] mb-2">We sent a 6-digit OTP to {form.mobile}.</p>
            {devOtp && (
              <p className="text-xs text-[#B68D40] mb-8" data-testid="dev-otp-display">
                Dev mode — your OTP is: <strong>{devOtp}</strong>
              </p>
            )}
            <form onSubmit={verify} className="space-y-6 max-w-md" data-testid="otp-form">
              <div>
                <label className="label-eyebrow mb-2 block">OTP</label>
                <input
                  required
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  className="hs-input tracking-[0.5em] text-2xl font-display"
                  data-testid="otp-input"
                />
              </div>
              <button disabled={busy} className="btn-primary w-full justify-center" data-testid="otp-verify">
                {busy ? "Verifying…" : "Verify & continue"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
