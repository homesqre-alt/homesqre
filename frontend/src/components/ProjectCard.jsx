import { Link } from "react-router-dom";
import { MapPin, Building2 } from "lucide-react";
import { formatINR } from "@/lib/api";

export default function ProjectCard({ project }) {
  const href = `/projects/${project.city_slug}/${project.locality_slug}/${project.slug}`;
  return (
    <Link to={href} className="hs-card block overflow-hidden group" data-testid={`project-card-${project.project_id}`}>
      <div className="relative aspect-[5/3] overflow-hidden">
        <img
          src={project.banner_image}
          alt={project.name}
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        {project.rera_number && (
          <span className="absolute top-3 right-3 bg-[#FCFAF5] text-[#0C1D42] text-[9px] tracking-widest uppercase px-2 py-1 font-semibold">
            RERA Verified
          </span>
        )}
        <div className="absolute bottom-4 left-5 right-5">
          <div className="text-[10px] tracking-widest uppercase text-[#DA9E3E] mb-1">
            {project.builder_name}
          </div>
          <h3 className="font-display text-2xl text-white leading-tight">{project.name}</h3>
        </div>
      </div>
      <div className="p-5 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-1.5 text-xs text-[#333333] mb-1">
            <MapPin size={12} strokeWidth={1.5} /> {project.locality}, {project.city}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-[#333333]">
            <Building2 size={12} strokeWidth={1.5} /> {project.unit_types}
          </div>
        </div>
        <div className="text-right">
          <div className="label-eyebrow text-[10px]">Starting</div>
          <div className="font-display text-xl text-[#0C1D42]">{formatINR(project.price_min)}</div>
        </div>
      </div>
    </Link>
  );
}
