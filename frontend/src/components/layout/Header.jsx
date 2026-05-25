import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Menu, X, User, LogOut, Heart, GitCompare } from "lucide-react";
import { useState } from "react";

const NAV = [
  // 🛑 HIDDEN REAL ESTATE LINKS (Saved for next year)
  // { to: "/properties", label: "Buy" },
  // { to: "/properties?kind=rent", label: "Rent" },
  // { to: "/projects", label: "Projects" },
  { to: "/interiors", label: "Interiors" },
  // { to: "/emi-calculator", label: "EMI" },
];

export default function Header() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);

  const dashHref =
    user?.role === "admin"
      ? "/dashboard/admin"
      : user?.role === "agent"
      ? "/dashboard/agent"
      : user?.role === "builder"
      ? "/dashboard/builder"
      : "/dashboard/customer";

  return (
    <header className="sticky top-0 z-50 bg-[#FAF9F6]/85 backdrop-blur-xl border-b border-[#E8E4D9]">
      <div className="max-w-[1400px] mx-auto flex items-center justify-between px-6 lg:px-12 h-16">
        <Link to="/" className="flex items-baseline gap-2" data-testid="logo-link">
          <span className="font-display text-3xl text-[#06402B] leading-none">Homesqre</span>
          <span className="hidden sm:inline-block w-1 h-1 rounded-full bg-[#B68D40]" />
        </Link>

        <nav className="hidden lg:flex items-center gap-9">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              data-testid={`nav-${n.label.toLowerCase()}`}
              className={({ isActive }) =>
                `text-sm tracking-wide font-medium transition-colors ${
                  isActive ? "text-[#B68D40]" : "text-[#1A2421] hover:text-[#B68D40]"
                }`
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>

        <div className="hidden lg:flex items-center gap-3">
          {/* 🛑 HIDDEN REAL ESTATE ICONS (Compare & Favourites) */}
          {/* <Link
            to="/favourites"
            data-testid="nav-favourites"
            className="p-2 hover:text-[#B68D40] transition-colors"
            aria-label="Favourites"
          >
            <Heart size={18} strokeWidth={1.5} />
          </Link>
          <Link
            to="/compare"
            data-testid="nav-compare"
            className="p-2 hover:text-[#B68D40] transition-colors"
            aria-label="Compare"
          >
            <GitCompare size={18} strokeWidth={1.5} />
          </Link>
          */}
          
          {user ? (
            <div className="flex items-center gap-3 ml-2">
              <Link
                to={dashHref}
                data-testid="nav-dashboard"
                className="btn-secondary"
                style={{ padding: "10px 18px" }}
              >
                Dashboard
              </Link>
              <button
                onClick={async () => {
                  await logout();
                  nav("/");
                }}
                data-testid="logout-btn"
                className="p-2 hover:text-[#9B4A3A] transition-colors"
                aria-label="Logout"
              >
                <LogOut size={18} strokeWidth={1.5} />
              </button>
            </div>
          ) : (
            <>
              <Link to="/login" data-testid="nav-login" className="btn-secondary" style={{ padding: "10px 18px" }}>
                Login
              </Link>
              {/* Changed text from "List Property" to "Sign Up" to capture interior design leads */}
              <Link to="/register" data-testid="nav-register" className="btn-primary" style={{ padding: "11px 20px" }}>
                Sign Up
              </Link>
            </>
          )}
        </div>

        <button
          className="lg:hidden p-2"
          onClick={() => setOpen(!open)}
          data-testid="mobile-menu-toggle"
          aria-label="Menu"
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {open && (
        <div className="lg:hidden bg-[#FAF9F6] border-t border-[#E8E4D9]">
          <div className="px-6 py-4 flex flex-col gap-3">
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                onClick={() => setOpen(false)}
                className="text-base py-2 border-b border-[#E8E4D9]"
                data-testid={`mnav-${n.label.toLowerCase()}`}
              >
                {n.label}
              </Link>
            ))}
            {user ? (
              <>
                <Link to={dashHref} className="btn-secondary text-center" onClick={() => setOpen(false)}>
                  Dashboard
                </Link>
                <button
                  className="btn-primary justify-center"
                  onClick={async () => {
                    await logout();
                    setOpen(false);
                    nav("/");
                  }}
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="btn-secondary text-center" onClick={() => setOpen(false)}>
                  Login
                </Link>
                <Link to="/register" className="btn-primary justify-center" onClick={() => setOpen(false)}>
                  Sign Up
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
