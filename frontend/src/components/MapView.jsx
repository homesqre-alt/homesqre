import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import { Link } from "react-router-dom";
import { formatINRShort } from "@/lib/api";

// Fix default marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

function Pin({ price }) {
  const html = `<div style="background:#0C1D42;color:#FCFAF5;padding:4px 10px;border-radius:2px;font-size:11px;font-weight:600;font-family:'Outfit',sans-serif;border:1px solid #DA9E3E;white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,0.2)">${price}</div>`;
  return L.divIcon({
    html,
    className: "hs-price-pin",
    iconSize: null,
    iconAnchor: [30, 12],
  });
}

export default function MapView({ items = [], center = [12.9716, 77.5946], zoom = 11, height = 480 }) {
  useEffect(() => {
    // ensure map reflows
    setTimeout(() => window.dispatchEvent(new Event("resize")), 100);
  }, [items]);

  return (
    <div style={{ height }} className="border border-[#EDE5DB] bg-[#F5EDE8] overflow-hidden">
      <MapContainer center={center} zoom={zoom} style={{ height: "100%", width: "100%" }} scrollWheelZoom={false}>
        <TileLayer
          attribution='&copy; OpenStreetMap'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {items.map((it) => {
          if (!it.lat || !it.lng) return null;
          const price = formatINRShort(it.price || it.price_min);
          return (
            <Marker key={it.listing_id || it.project_id} position={[it.lat, it.lng]} icon={Pin({ price })}>
              <Popup>
                <div style={{ minWidth: 180 }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{it.title || it.name}</div>
                  <div style={{ fontSize: 12, color: "#333333", marginBottom: 6 }}>{it.locality}</div>
                  <div style={{ color: "#0C1D42", fontWeight: 600 }}>{price}</div>
                  <Link
                    to={
                      it.listing_id
                        ? `/properties/${it.listing_id}`
                        : `/projects/${it.city_slug}/${it.locality_slug}/${it.slug}`
                    }
                    style={{ display: "inline-block", marginTop: 8, color: "#DA9E3E", fontSize: 12 }}
                  >
                    View →
                  </Link>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
