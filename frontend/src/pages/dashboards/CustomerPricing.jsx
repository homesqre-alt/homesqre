import React, { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import DashShell from "@/components/layout/DashShell";
import api from "@/lib/api";
import { toast } from "sonner";

export default function CustomerPricing() {
  const { user } = useAuth();
  const [packages, setPackages] = useState([]);
  const [loadingPackages, setLoadingPackages] = useState(true);
  const [selectedPropertyGroup, setSelectedPropertyGroup] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/packages");
        setPackages(data || []);
      } catch (err) {
        toast.error("Failed to load pricing packages.");
      } finally {
        setLoadingPackages(false);
      }
    })();
  }, []);

  if (user === undefined) return null;
  if (user === null) return <Navigate to="/login" />;
  if (user.role !== "customer") return <Navigate to="/" replace />;

  const INTERIOR_LINKS = [
    { to: "/dashboard/customer", label: "My Project" },
    { to: "/dashboard/pricing", label: "Pricing" },
    { to: "/dashboard/profile", label: "Profile & Settings" },
  ];

  return (
    <DashShell links={INTERIOR_LINKS} hideFooter>
      <div className="max-w-5xl mx-auto py-8 px-4">
        <h2 className="font-display text-3xl text-[#0C1D42] mb-2">Our Pricing & Packages</h2>
        <p className="text-[#333333] mb-8">
          Browse our standard interior design packages. If you've already uploaded a floor plan, our Design Experts will assign the perfect package for you.
        </p>

        <div className="bg-white border border-[#EDE5DB] p-8 shadow-sm">
          {loadingPackages ? (
            <p className="text-center text-[#333333] py-8">Loading packages...</p>
          ) : !selectedPropertyGroup ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 animate-in fade-in slide-in-from-bottom-4">
              {packages.map((group) => (
                <button
                  key={group.property_type}
                  onClick={() => setSelectedPropertyGroup(group.property_type)}
                  className="border border-[#EDE5DB] bg-white p-6 hover:border-[#DA9E3E] hover:shadow-md transition text-center group"
                >
                  <h3 className="font-display text-2xl text-[#0C1D42] mb-2 group-hover:text-[#DA9E3E]">{group.group}</h3>
                  <p className="text-xs text-[#333333]">Click to view options</p>
                </button>
              ))}
            </div>
          ) : (
            <div className="animate-in fade-in slide-in-from-right-4">
              <div className="flex items-center gap-4 mb-4 border-b border-[#EDE5DB] pb-4">
                <button
                  onClick={() => setSelectedPropertyGroup(null)}
                  className="text-xs font-bold uppercase tracking-widest text-[#DA9E3E] hover:text-[#0C1D42] transition"
                >
                  ← Back
                </button>
                <h3 className="text-sm uppercase tracking-widest font-bold text-[#0C1D42]">
                  {packages.find((g) => g.property_type === selectedPropertyGroup)?.group}
                </h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {packages.find((g) => g.property_type === selectedPropertyGroup)?.options.map((opt) => (
                  <div key={opt.value} className="text-left border border-[#EDE5DB] p-4 bg-white">
                    <div className="flex items-baseline justify-between mb-1">
                      <h4 className="font-display text-lg text-[#0C1D42]">{opt.label}</h4>
                      <span className="font-display text-xl text-[#DA9E3E]">₹{opt.price.toLocaleString("en-IN")}</span>
                    </div>
                    <p className="text-xs text-[#333333]">{opt.blurb}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </DashShell>
  );
}
