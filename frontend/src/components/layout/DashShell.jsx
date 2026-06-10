import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { LogOut } from "lucide-react";

export default function DashShell({ links = [], title, children }) {
  const { user, logout } = useAuth();
  const loc = useLocation();

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-[#FCFAF5]">
      <aside className="lg:w-64 bg-white border-r border-[#EDE5DB] p-6 lg:min-h-screen">
        <Link to="/" className="block mb-10"><img src="/logo.svg" alt="Homesqre" className="h-10 lg:h-12 w-auto object-contain" /></Link>
        <div className="mb-6">
          <div className="label-eyebrow mb-1">Logged in as</div>
          <div className="text-sm">{user?.name || user?.email}</div>
          <div className="text-xs text-[#DA9E3E] uppercase tracking-wider mt-0.5">{user?.role}</div>
        </div>
        <nav className="space-y-1 mb-8">
          {links.map((l) => (
          <Link
              key={l.to}
              to={l.to}
              className={`block px-3 py-2 text-sm border-l-2 ${
                (l.to.startsWith('#') ? loc.hash === l.to : loc.pathname === l.to)
                  ? "border-[#0C1D42] bg-[#F5EDE8] text-[#0C1D42] font-semibold"
                  : "border-transparent text-[#333333] hover:bg-[#F5EDE8]"
              }`}
              data-testid={`sidebar-${l.label.toLowerCase().replace(/\s/g, "-")}`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <button onClick={logout} className="text-xs text-[#9B4A3A] flex items-center gap-2 tracking-wide uppercase">
          <LogOut size={14} /> Sign out
        </button>
      </aside>

      <main className="flex-1 p-6 lg:p-12">
        <div className="max-w-[1300px] mx-auto">
          {title && (
            <header className="mb-10">
              <div className="label-eyebrow mb-2">Dashboard</div>
              <h1 className="font-display text-4xl sm:text-5xl">{title}</h1>
            </header>
          )}
          {children}
        </div>
      </main>
    </div>
  );
}
