import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { GoogleOAuthProvider, GoogleLogin } from "@react-oauth/google";

// Your official Google Cloud Client ID
const GOOGLE_CLIENT_ID = "792218859682-0c3n97260bmmnihocosutpm00vvliivt.apps.googleusercontent.com";

export default function Login() {
  const { login, loginOtpVerify, googleLogin } = useAuth();
  const nav = useNavigate();
  const [loginMode, setLoginMode] = useState("password"); // "password" or "otp"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [devOtp, setDevOtp] = useState("");
  const [busy, setBusy] = useState(false);

  const handleRedirect = (u) => {
    // Google / new users: if profile is incomplete, go to onboarding first
    if (u.role === "customer" && (!u.profile_completed || !u.mobile)) {
      nav("/profile/complete");
      return;
    }
    const dest =
      u.role === "admin" ? "/dashboard/admin"
      : u.role === "sales" ? "/dashboard/sales"
      : u.role === "designer" ? "/dashboard/designer"
      : "/dashboard/customer";
    nav(dest);
  };

  const submitPasswordLogin = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const u = await login(email, password);
      toast.success("Welcome back!");
      handleRedirect(u);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setBusy(false);
    }
  };

  const sendOtp = async (e) => {
    e.preventDefault();
    const mobileClean = mobile.replace(/\D/g, "");
    if (mobileClean.length !== 10) {
      toast.error("Please enter a valid 10-digit mobile number");
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post("/auth/login-otp", { mobile: mobileClean });
      setDevOtp(data.dev_otp || "");
      setOtpSent(true);
      toast.success("OTP sent to your mobile (check console for dev OTP)");
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setBusy(false);
    }
  };

  const submitOtpLogin = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const mobileClean = mobile.replace(/\D/g, "");
      const u = await loginOtpVerify(mobileClean, otp);
      toast.success("Welcome back!");
      handleRedirect(u);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setBusy(false);
    }
  };

  const handleGoogleSuccess = async (credentialResponse) => {
    setBusy(true);
    try {
      // Passes the token directly to your backend
      const u = await googleLogin(credentialResponse.credential);
      toast.success("Welcome back!");
      handleRedirect(u);
    } catch (e) {
      toast.error("Google login failed. Please try again.");
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2">
        <div className="hidden lg:block relative">
          <img
            src="https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1400&q=80"
            alt="Interior design"
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-black/20" />
          <div className="absolute bottom-12 left-12 right-12 text-white">
            <div className="label-eyebrow text-[#DA9E3E] mb-4">Homesqre</div>
            <h2 className="font-display text-5xl leading-tight">
              Welcome back to your<br /><span className="italic text-[#DA9E3E]">home journey.</span>
            </h2>
          </div>
        </div>

        <div className="flex flex-col justify-center px-6 sm:px-12 lg:px-24 py-12">
          <Link to="/" className="mb-12"><img src="/logo.svg" alt="Homesqre" className="h-24 md:h-32 w-auto object-contain" /></Link>
          <h1 className="font-display text-4xl mb-3">Sign in</h1>
          <p className="text-sm text-[#333333] mb-10">Select a sign-in method to continue.</p>

          <div className="max-w-md flex justify-center w-full mb-6">
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={() => toast.error("Google authentication failed")}
              useOneTap
              shape="rectangular"
              size="large"
              text="continue_with"
              width="100%"
            />
          </div>

          <div className="my-6 flex items-center gap-4 max-w-md">
            <div className="flex-1 h-px bg-[#EDE5DB]" />
            <span className="label-eyebrow text-xs text-[#666666]">or sign in manually</span>
            <div className="flex-1 h-px bg-[#EDE5DB]" />
          </div>

          <div className="max-w-md flex gap-2 mb-6">
            <button
              onClick={() => { setLoginMode("password"); setOtpSent(false); }}
              className={`flex-1 py-2 text-xs font-bold uppercase tracking-widest border transition ${loginMode === "password" ? "bg-[#0C1D42] text-white border-[#0C1D42]" : "border-[#EDE5DB] text-[#333333] hover:bg-[#F5EDE8]"}`}
            >
              Email + Password
            </button>
            <button
              onClick={() => setLoginMode("otp")}
              className={`flex-1 py-2 text-xs font-bold uppercase tracking-widest border transition ${loginMode === "otp" ? "bg-[#0C1D42] text-white border-[#0C1D42]" : "border-[#EDE5DB] text-[#333333] hover:bg-[#F5EDE8]"}`}
            >
              Mobile OTP
            </button>
          </div>

          {loginMode === "password" && (
            <form onSubmit={submitPasswordLogin} className="space-y-6 max-w-md" data-testid="login-form">
              <div>
                <label className="label-eyebrow mb-2 block">Email</label>
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="hs-input" data-testid="login-email" />
              </div>
              <div>
                <label className="label-eyebrow mb-2 block">Password</label>
                <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="hs-input" data-testid="login-password" />
              </div>
              <button disabled={busy} className="btn-primary w-full justify-center" data-testid="login-submit">
                {busy ? "Signing in…" : "Sign in"}
              </button>
              <div className="mt-8 text-sm text-[#333333] max-w-md flex justify-center">
                <Link to="/forgot-password" className="hover:text-[#DA9E3E]">Forgot password?</Link>
              </div>
            </form>
          )}

          {loginMode === "otp" && !otpSent && (
            <form onSubmit={sendOtp} className="space-y-6 max-w-md" data-testid="login-otp-form">
              <div>
                <label className="label-eyebrow mb-2 block">Mobile Number</label>
                <input type="tel" required placeholder="10-digit number" value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))} maxLength={10} className="hs-input" />
              </div>
              <button disabled={busy || mobile.length !== 10} className="btn-primary w-full justify-center">
                {busy ? "Sending…" : "Get Login OTP"}
              </button>
            </form>
          )}

          {loginMode === "otp" && otpSent && (
            <form onSubmit={submitOtpLogin} className="space-y-6 max-w-md" data-testid="login-otp-verify-form">
              <p className="text-sm text-[#333333]">We sent a 6-digit OTP to {mobile}.</p>
              {devOtp && (
                <p className="text-xs text-[#DA9E3E] mb-4">
                  Dev mode — your OTP is: <strong>{devOtp}</strong>
                </p>
              )}
              <div>
                <label className="label-eyebrow mb-2 block">Enter OTP</label>
                <input
                  required
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  className="hs-input tracking-[0.5em] text-2xl font-display text-center"
                />
              </div>
              <button disabled={busy || otp.length !== 6} className="btn-primary w-full justify-center">
                {busy ? "Verifying…" : "Sign In"}
              </button>
              <div className="mt-4 text-center">
                <button type="button" onClick={() => { setOtpSent(false); setOtp(""); }} className="text-xs text-[#0C1D42] uppercase tracking-widest font-bold underline hover:text-[#DA9E3E]">
                  Change Number
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </GoogleOAuthProvider>
  );
}
