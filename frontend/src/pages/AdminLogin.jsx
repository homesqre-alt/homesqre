import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";

export default function AdminLogin() {
  const { login } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const intended = location.state?.from?.pathname || "/dashboard/admin";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const u = await login(email, password);
      if (u.role !== "admin") {
        toast.error("This account is not an administrator.");
        setBusy(false);
        return;
      }
      toast.success(`Welcome back, ${u.name || "Admin"}`);
      nav(intended, { replace: true });
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0E1815] text-[#FAF9F6] flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-10">
          <div className="w-10 h-10 grid place-items-center bg-[#B68D40]">
            <ShieldCheck size={20} strokeWidth={1.5} className="text-[#0E1815]" />
          </div>
          <div>
            <div className="label-eyebrow text-[#B68D40]">Homesqre</div>
            <div className="font-display text-2xl leading-none">Admin Console</div>
          </div>
        </div>

        <h1 className="font-display text-4xl mb-2">Sign in.</h1>
        <p className="text-sm text-white/60 mb-10">
          Restricted area — administrator credentials required.
        </p>

        <form onSubmit={submit} className="space-y-5" data-testid="admin-login-form">
          <div>
            <label className="label-eyebrow text-[#B68D40] mb-2 block">Email</label>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-transparent border-b border-white/30 focus:border-[#B68D40] outline-none py-3 text-base"
              data-testid="admin-login-email"
            />
          </div>
          <div>
            <label className="label-eyebrow text-[#B68D40] mb-2 block">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-transparent border-b border-white/30 focus:border-[#B68D40] outline-none py-3 text-base"
              data-testid="admin-login-password"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="w-full bg-[#B68D40] hover:bg-[#947230] disabled:opacity-60 text-[#0E1815] font-semibold tracking-widest uppercase text-xs py-4 mt-4 transition-colors"
            data-testid="admin-login-submit"
          >
            {busy ? "Signing in…" : "Enter Console"}
          </button>
        </form>

        <p className="text-xs text-white/40 mt-10 leading-relaxed">
          Lost access? Run the bootstrap script on the server:
          <code className="block mt-2 px-3 py-2 bg-white/5 text-[#B68D40] font-mono text-[11px]">
            docker compose exec backend python scripts/create_admin.py
          </code>
        </p>
      </div>
    </div>
  );
}
