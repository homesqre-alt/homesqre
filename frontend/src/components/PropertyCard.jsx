import { Link } from "react-router-dom";
import { MapPin, BedDouble, Bath, Maximize2, Heart } from "lucide-react";
import { formatINR } from "@/lib/api";
import { useState } from "react";
import api from "@/lib/api";

export default function PropertyCard({ listing, onFav }) {
  const [favd, setFavd] = useState(false);

  const toggleFav = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      if (favd) {
        await api.delete(`/me/favourites/listing/${listing.listing_id}`);
        setFavd(false);
      } else {
        await api.post("/me/favourites", { kind: "listing", ref_id: listing.listing_id });
        setFavd(true);
      }
      onFav && onFav();
    } catch (err) {
      console.warn("Favourite toggle failed:", err?.message || err);
    }
  };

  return (
    <Link
      to={`/properties/${listing.listing_id}`}
      className="hs-card block group overflow-hidden"
      data-testid={`property-card-${listing.listing_id}`}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-[#F5EDE8]">
        {listing.photos?.[0] ? (
          <img
            src={listing.photos[0]}
            alt={listing.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[#666666] text-xs">No image</div>
        )}
        <div className="absolute top-3 left-3 flex gap-2">
          <span className="bg-[#0C1D42] text-[#FCFAF5] text-[10px] tracking-widest uppercase px-2.5 py-1 font-semibold">
            {listing.kind === "rent" ? "Rent" : "Sale"}
          </span>
          {listing.is_featured && (
            <span className="bg-[#DA9E3E] text-white text-[10px] tracking-widest uppercase px-2.5 py-1 font-semibold">
              Featured
            </span>
          )}
        </div>
        <button
          onClick={toggleFav}
          data-testid={`fav-btn-${listing.listing_id}`}
          className="absolute top-3 right-3 w-9 h-9 bg-white/90 flex items-center justify-center hover:bg-white"
          aria-label="favourite"
        >
          <Heart size={16} strokeWidth={1.5} fill={favd ? "#9B4A3A" : "none"} color={favd ? "#9B4A3A" : "#0C1D42"} />
        </button>
      </div>
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-2">
          <h3 className="font-display text-xl leading-tight">{listing.title}</h3>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-[#333333] mb-4">
          <MapPin size={12} strokeWidth={1.5} />
          {listing.locality}, {listing.city}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-[#0C1D42] mb-4 pb-4 border-b border-[#EDE5DB]">
          {listing.bedrooms ? (
            <span className="flex items-center gap-1.5">
              <BedDouble size={13} strokeWidth={1.5} /> {listing.bedrooms} BHK
            </span>
          ) : null}
          {listing.bathrooms ? (
            <span className="flex items-center gap-1.5">
              <Bath size={13} strokeWidth={1.5} /> {listing.bathrooms}
            </span>
          ) : null}
          {listing.area_sqft ? (
            <span className="flex items-center gap-1.5">
              <Maximize2 size={13} strokeWidth={1.5} /> {listing.area_sqft} sqft
            </span>
          ) : null}
        </div>
        <div className="flex items-baseline justify-between">
          <div>
            <div className="label-eyebrow text-[10px] mb-1">
              {listing.kind === "rent" ? "Monthly" : "Price"}
            </div>
            <div className="font-display text-2xl text-[#0C1D42]">
              {formatINR(listing.price)}
              {listing.kind === "rent" && <span className="text-xs text-[#333333] ml-1">/mo</span>}
            </div>
          </div>
          <span className="text-xs text-[#DA9E3E] tracking-widest uppercase">View →</span>
        </div>
      </div>
    </Link>
  );
}
