import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Link, Navigate } from "react-router-dom";
import api from "@/lib/api";
import DashShell from "@/components/layout/DashShell";
import PropertyCard from "@/components/PropertyCard";
import ProjectCard from "@/components/ProjectCard";

const LINKS = [
  { to: "/dashboard/customer", label: "Overview" },
  { to: "/favourites", label: "Favourites" },
  { to: "/compare", label: "Compare" },
];

export default function CustomerDashboard() {
  const { user } = useAuth();
  const [favs, setFavs] = useState({ listings: [], projects: [] });
  const [recent, setRecent] = useState([]);

  useEffect(() => {
    if (user) {
      api.get("/me/favourites").then(({ data }) => setFavs(data));
      api.get("/listings", { params: { limit: 4 } }).then(({ data }) => setRecent(data || []));
    }
  }, [user]);

  if (user === undefined) return null;
  if (user === null) return <Navigate to="/login" />;

  return (
    <DashShell links={LINKS} title={`Welcome, ${user.name || "there"}.`}>
      <p className="text-[#4A5D54] mb-12 max-w-xl">
        Your home journey, in one place. Pick up where you left off, or start a new search.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-16">
        {[
          ["Saved Listings", favs.listings?.length || 0, "/favourites"],
          ["Saved Projects", favs.projects?.length || 0, "/favourites"],
          ["Browse All", "→", "/properties"],
        ].map(([l, v, h]) => (
          <Link key={l} to={h} className="bg-white border border-[#E8E4D9] p-6 hover:bg-[#F3F0E9] transition">
            <div className="label-eyebrow mb-3">{l}</div>
            <div className="font-display text-4xl text-[#06402B]">{v}</div>
          </Link>
        ))}
      </div>

      <h2 className="font-display text-2xl mb-6">Latest in Bangalore</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
        {recent.map(l => <PropertyCard key={l.listing_id} listing={l} />)}
      </div>

      {favs.projects?.length > 0 && (
        <>
          <h2 className="font-display text-2xl mb-6">Your saved projects</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {favs.projects.map(p => <ProjectCard key={p.project_id} project={p} />)}
          </div>
        </>
      )}
    </DashShell>
  );
}
