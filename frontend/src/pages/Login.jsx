import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { GoogleOAuthProvider, GoogleLogin } from "@react-oauth/google";

// Your official Google Cloud Client ID
const GOOGLE_CLIENT_ID = "792218859682-0c3n97260bmmnihocosutpm00vvliivt.apps.googleusercontent.com";

export default function Login() {
  const { login, googleLogin } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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

  const submit = async (e) => {
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
          <p className="text-sm text-[#333333] mb-10">Enter your email and password to continue.</p>

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

          <form onSubmit={submit} className="space-y-6 max-w-md" data-testid="login-form">
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
          </form>

          <div className="mt-8 text-sm text-[#333333] max-w-md flex justify-center">
            <Link to="/forgot-password" className="hover:text-[#DA9E3E]">Forgot password?</Link>
          </div>
        </div>
      </div>
    </GoogleOAuthProvider>
  );
}
