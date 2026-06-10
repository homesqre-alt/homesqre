import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import ProjectCard from "@/components/ProjectCard";

export default function ProjectsList() {
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [localities, setLocalities] = useState([]);
  const locality = params.get("locality") || "";

  useEffect(() => {
    api.get("/localities", { params: { city: "Bangalore" } }).then(({ data }) => setLocalities(data || []));
  }, []);

  useEffect(() => {
    const p = { limit: 60 };
    if (locality) p.locality = locality;
    api.get("/projects", { params: p }).then(({ data }) => setItems(data || []));
  }, [locality]);

  return (
    <div className="App">
      <Header />
      <section className="bg-[#F5EDE8] border-b border-[#EDE5DB]">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12 py-12">
          <div className="label-eyebrow mb-3">Discover</div>
          <h1 className="font-display text-4xl sm:text-5xl">New & upcoming projects</h1>
        </div>
      </section>

      <section className="max-w-[1400px] mx-auto px-6 lg:px-12 py-10">
        <div className="bg-white border border-[#EDE5DB] p-5 mb-8 max-w-sm">
          <label className="label-eyebrow mb-1 block">Locality</label>
          <select
            value={locality}
            onChange={(e) => {
              const next = new URLSearchParams(params);
              if (e.target.value) next.set("locality", e.target.value);
              else next.delete("locality");
              setParams(next);
            }}
            className="hs-input"
            data-testid="project-locality-filter"
          >
            <option value="">All</option>
            {localities.map((l) => <option key={l.locality_id}>{l.name}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {items.map((p) => <ProjectCard key={p.project_id} project={p} />)}
          {items.length === 0 && <div className="col-span-full text-center py-20 text-[#666666]">No projects found.</div>}
        </div>
      </section>
      <Footer />
    </div>
  );
}
