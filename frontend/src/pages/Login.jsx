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
    const dash =
      u.role === "admin"
        ? "/dashboard/admin"
        : u.role === "agent"
        ? "/dashboard/agent"
        : u.role === "builder"
        ? "/dashboard/builder"
        : "/dashboard/customer";
    nav(dash);
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
            <div className="label-eyebrow text-[#B68D40] mb-4">Homesqre</div>
            <h2 className="font-display text-5xl leading-tight">
              Welcome back to your<br /><span className="italic text-[#B68D40]">home journey.</span>
            </h2>
          </div>
        </div>

        <div className="flex flex-col justify-center px-6 sm:px-12 lg:px-24 py-12">
          <Link to="/" className="font-display text-3xl text-[#06402B] mb-12">Homesqre</Link>
          <h1 className="font-display text-4xl mb-3">Sign in</h1>
          <p className="text-sm text-[#4A5D54] mb-10">Enter your email and password to continue.</p>

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

          <div className="my-6 flex items-center gap-4 max-w-md">
            <div className="flex-1 h-px bg-[#E8E4D9]" />
            <span className="label-eyebrow">or</span>
            <div className="flex-1 h-px bg-[#E8E4D9]" />
          </div>

          <div className="max-w-md flex justify-center w-full">
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

          <div className="mt-8 text-sm text-[#4A5D54] max-w-md flex justify-between">
            <Link to="/forgot-password" className="hover:text-[#B68D40]">Forgot password?</Link>
            <Link to="/register" className="hover:text-[#B68D40]">Create an account</Link>
          </div>
        </div>
      </div>
    </GoogleOAuthProvider>
  );
}
