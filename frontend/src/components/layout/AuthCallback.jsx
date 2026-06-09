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
        setUserData(data.user);
        // Clean URL hash
        window.history.replaceState({}, "", "/");
        const role = data.user?.role;
        const dash =
          role === "admin" ? "/dashboard/admin"
          : role === "sales" ? "/dashboard/sales"
          : role === "designer" ? "/dashboard/designer"
          : "/dashboard/customer";
        nav(dash);
      } catch {
        nav("/login?error=oauth");
      }
    })();
  }, [loc.hash, nav, setUserData]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="font-display text-3xl text-[#0C1D42]">Signing you in…</div>
    </div>
  );
}
