import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { LogOut } from "lucide-react";

export default function DashShell({ links = [], title, children }) {
  const { user, logout } = useAuth();
  const loc = useLocation();

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-[#FAF9F6]">
      <aside className="lg:w-64 bg-white border-r border-[#E8E4D9] p-6 lg:min-h-screen">
        <Link to="/" className="font-display text-3xl text-[#06402B] block mb-10">Homesqre</Link>
        <div className="mb-6">
          <div className="label-eyebrow mb-1">Logged in as</div>
          <div className="text-sm">{user?.name || user?.email}</div>
          <div className="text-xs text-[#B68D40] uppercase tracking-wider mt-0.5">{user?.role}</div>
        </div>
        <nav className="space-y-1 mb-8">
          {links.map((l) => (
          <Link
              key={l.to}
              to={l.to}
              className={`block px-3 py-2 text-sm border-l-2 ${
                (l.to.startsWith('#') ? loc.hash === l.to : loc.pathname === l.to)
                  ? "border-[#06402B] bg-[#F3F0E9] text-[#06402B] font-semibold"
                  : "border-transparent text-[#1A2421] hover:bg-[#F3F0E9]"
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
