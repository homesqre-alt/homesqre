import { Link, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Menu, X, LogOut, ArrowRight } from "lucide-react";
import { useState, useEffect } from "react";

const NAV = [
  { label: "Home", to: "/" }
];

export default function Header() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Close menu on route change
  useEffect(() => { setOpen(false); }, [location.pathname]);

  // Scroll-aware header
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const dashHref =
    user?.role === "admin" ? "/dashboard/admin"
    : user?.role === "sales" ? "/dashboard/sales"
    : user?.role === "designer" ? "/dashboard/designer"
    : "/dashboard/customer";

  return (
    <>
      <header
        className={`sticky top-0 z-50 transition-all duration-300 ${
          scrolled
            ? "bg-[#FCFAF5]/95 backdrop-blur-xl border-b border-[#EDE5DB] shadow-sm"
            : "bg-transparent border-b border-transparent"
        }`}
      >
        <div className="max-w-[1400px] mx-auto flex items-center justify-between px-5 lg:px-12 h-16">
          {/* Logo */}
          <Link to="/" className="flex items-baseline gap-2 z-10" data-testid="logo-link">
            <img src="/logo.svg" alt="Homesqre" className="h-24 md:h-32 w-auto object-contain" />
            <span className="hidden sm:inline-block w-1 h-1 rounded-full bg-[#DA9E3E]" />
          </Link>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-9">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                data-testid={`nav-${n.label.toLowerCase()}`}
                className={({ isActive }) =>
                  `text-sm tracking-wide font-medium transition-colors relative group ${
                    isActive ? "text-[#DA9E3E]" : "text-[#333333] hover:text-[#DA9E3E]"
                  }`
                }
              >
                {n.label}
                {/* Underline slide-in effect */}
                <span className="absolute -bottom-1 left-0 w-0 h-px bg-[#DA9E3E] transition-all duration-300 group-hover:w-full" />
              </NavLink>
            ))}
          </nav>

          {/* Desktop actions */}
          <div className="hidden lg:flex items-center gap-3">
            {user ? (
              <div className="flex items-center gap-3">
                <Link
                  to={dashHref}
                  data-testid="nav-dashboard"
                  className="btn-secondary"
                  style={{ padding: "10px 18px", minHeight: "auto" }}
                >
                  Dashboard
                </Link>
                <button
                  onClick={async () => { await logout(); nav("/"); }}
                  data-testid="logout-btn"
                  className="p-2 hover:text-[#9B4A3A] transition-colors"
                  aria-label="Logout"
                >
                  <LogOut size={18} strokeWidth={1.5} />
                </button>
              </div>
            ) : (
              <>
                <Link to="/login" className="btn-primary" style={{ padding: "10px 18px", minHeight: "auto" }}>
                  START YOUR DESIGN JOURNEY
                </Link>
              </>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            className="lg:hidden z-10 w-11 h-11 flex items-center justify-center rounded-full transition-colors hover:bg-[#F5EDE8]"
            onClick={() => setOpen(!open)}
            data-testid="mobile-menu-toggle"
            aria-label="Menu"
          >
            {open
              ? <X size={22} className="text-white" />
              : <Menu size={22} className="text-[#333333]" />
            }
          </button>
        </div>
      </header>

      {/* ── Full-screen mobile menu ──────────────────────────────────── */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-40 bg-[#0C1D42] flex flex-col px-8 pt-24 pb-10">
          {/* Nav links */}
          <nav className="flex flex-col gap-2 flex-1">
            {NAV.map((n, i) => (
              <Link
                key={n.to}
                to={n.to}
                onClick={() => setOpen(false)}
                className="hs-menu-item font-display text-[#FCFAF5] text-5xl py-3 border-b border-[#FCFAF5]/10 flex items-center justify-between group"
                data-testid={`mnav-${n.label.toLowerCase()}`}
                style={{ animationDelay: `${i * 0.05 + 0.05}s` }}
              >
                {n.label}
                <ArrowRight size={24} className="text-[#DA9E3E] opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>
            ))}
          </nav>

          {/* Bottom actions */}
          <div className="space-y-3 mt-8" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
            {user ? (
              <>
                <Link
                  to={dashHref}
                  onClick={() => setOpen(false)}
                  className="btn-gold w-full justify-center"
                >
                  My Dashboard
                </Link>
                <button
                  onClick={async () => { await logout(); setOpen(false); nav("/"); }}
                  className="w-full text-center text-[#FCFAF5]/60 text-sm tracking-wide py-3"
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  onClick={() => setOpen(false)}
                  className="btn-gold w-full justify-center"
                >
                  Start Your Journey
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
