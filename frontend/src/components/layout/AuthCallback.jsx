import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH

export default function AuthCallback() {
  const loc = useLocation();
  const nav = useNavigate();
  const { setUserData } = useAuth();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const hash = loc.hash || window.location.hash;
    const m = hash.match(/session_id=([^&]+)/);
    if (!m) {
      nav("/login");
      return;
    }
    (async () => {
      try {
        const { data } = await api.post("/auth/google/session", { session_id: m[1] });
        if (data.token) localStorage.setItem("hs_token", data.token);
        setUserData(data.user);
        // Clean URL hash
        window.history.replaceState({}, "", "/");
        if (!data.user?.profile_completed) {
          nav("/profile/complete");
          return;
        }
        const role = data.user?.role;
        const dashHref =
          role === "admin"
            ? "/dashboard/admin"
            : role === "agent"
            ? "/dashboard/agent"
            : role === "builder"
            ? "/dashboard/builder"
            : "/dashboard/customer";
        nav(dashHref);
      } catch {
        nav("/login?error=oauth");
      }
    })();
  }, [loc.hash, nav, setUserData]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="font-display text-3xl text-[#06402B]">Signing you in…</div>
    </div>
  );
}
