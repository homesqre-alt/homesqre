import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Link, Navigate } from "react-router-dom";
import api from "@/lib/api";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import PropertyCard from "@/components/PropertyCard";
import ProjectCard from "@/components/ProjectCard";

export default function Favourites() {
  const { user } = useAuth();
  const [data, setData] = useState({ listings: [], projects: [] });

  useEffect(() => {
    if (user) api.get("/me/favourites").then(({ data }) => setData(data));
  }, [user]);

  if (user === null) return <Navigate to="/login" />;

  return (
    <div className="App">
      <Header />
      <section className="max-w-[1400px] mx-auto px-6 lg:px-12 py-16">
        <div className="label-eyebrow mb-3">Saved</div>
        <h1 className="font-display text-5xl mb-12">Your favourites.</h1>

        {data.listings?.length > 0 && (
          <div className="mb-16">
            <h2 className="font-display text-2xl mb-6">Listings</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {data.listings.map((l) => <PropertyCard key={l.listing_id} listing={l} />)}
            </div>
          </div>
        )}

        {data.projects?.length > 0 && (
          <div>
            <h2 className="font-display text-2xl mb-6">Projects</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {data.projects.map((p) => <ProjectCard key={p.project_id} project={p} />)}
            </div>
          </div>
        )}

        {!data.listings?.length && !data.projects?.length && (
          <div className="bg-[#F5EDE8] p-12 text-center">
            <div className="font-display text-3xl mb-3">No saved items yet</div>
            <p className="text-[#333333] mb-6">Tap the heart on any listing or project to save it.</p>
            <Link to="/properties" className="btn-primary">Browse properties</Link>
          </div>
        )}
      </section>
      <Footer />
    </div>
  );
}
