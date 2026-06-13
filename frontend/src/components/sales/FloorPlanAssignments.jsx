import React, { useState, useEffect, useCallback } from "react";
import api from "@/lib/api";
import { formatApiError } from "@/lib/utils";
import { toast } from "sonner";

export default function FloorPlanAssignments() {
  const [verifications, setVerifications] = useState([]);
  const [assigning, setAssigning] = useState(null); // verification record being assigned
  const [packages, setPackages] = useState([]);

  const backend = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/$/, "");
  const absUrl = (u) => (u && u.startsWith("http") ? u : `${backend}${u}`);

  const loadVerifications = useCallback(async () => {
    try {
      const { data } = await api.get("/admin/verifications");
      setVerifications(data || []);
    } catch (err) {
      toast.error("Failed to load verifications.");
    }
  }, []);

  const loadPackages = useCallback(async () => {
    try {
      const { data } = await api.get("/packages");
      setPackages(data || []);
    } catch (err) {
      toast.error("Failed to load packages.");
    }
  }, []);

  useEffect(() => {
    loadVerifications();
    loadPackages();
  }, [loadVerifications, loadPackages]);

  const pending = verifications.filter(v => v.status === "pending");
  const recentlyAssigned = verifications.filter(v =>
    v.status === "package_assigned" || v.status === "approved"
  ).slice(0, 8);

  return (
    <div className="animate-in fade-in bg-[#FCFAF5] p-6 mb-6 border border-[#EDE5DB]" data-testid="verification-queue">
      <h3 className="font-display text-2xl text-[#0C1D42] mb-1">Floor Plan Assignments</h3>
      <p className="text-sm text-[#333333] mb-6">Review customer floor plans and assign them the perfect package with custom discounts.</p>

      {pending.length === 0 ? (
        <p className="text-gray-500 bg-white border border-[#EDE5DB] p-6 mb-8 text-center">No pending floor plans to verify.</p>
      ) : (
        pending.map(v => (
          <div key={v.verification_id} className="bg-white border-2 border-[#DA9E3E] p-6 mb-4 shadow-sm" data-testid={`verification-${v.verification_id}`}>
            <div className="flex justify-between items-start mb-4">
              <div>
                {(v.customer?.name || v.customer?.project_name) && (
                  <p className="text-xs uppercase tracking-widest text-[#DA9E3E] font-bold mb-1">
                    {v.customer?.name}{v.customer?.project_name ? ` — ${v.customer.project_name}` : ""}
                  </p>
                )}
                <h4 className="font-bold text-[#0C1D42] capitalize text-lg">{v.project_name || "Brief Submitted"}</h4>
                <p className="text-sm text-gray-500 mt-2"><strong>Client Requirements:</strong> {v.room_requirements}</p>
              </div>
              <div className="flex flex-col items-end gap-2">
                {((v.pdf_urls && v.pdf_urls.length > 0) ? v.pdf_urls : (v.pdf_url ? [v.pdf_url] : [])).map((u, idx) => (
                  <a key={idx} href={absUrl(u)} target="_blank" rel="noopener noreferrer" download
                     data-testid={`download-plan-${v.verification_id}-${idx}`}
                     className="bg-[#F5EDE8] text-[#0C1D42] font-semibold text-xs px-4 py-2 border border-[#DA9E3E] hover:bg-[#EDE5DB] transition">
                    View Floor Plan {idx + 1}
                  </a>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-3 border-t border-[#EDE5DB] pt-4">
              <button onClick={() => setAssigning(v)}
                      data-testid={`assign-package-${v.verification_id}`}
                      className="bg-[#0C1D42] text-white px-8 py-3 text-xs uppercase tracking-widest font-bold hover:bg-[#08142D] w-full sm:w-auto">
                Assign Package & Offer
              </button>
            </div>
          </div>
        ))
      )}

      {recentlyAssigned.length > 0 && (
        <div className="mt-10">
          <h4 className="font-display text-sm uppercase tracking-widest text-[#0C1D42] mb-3">Recently Assigned</h4>
          <div className="space-y-2">
            {recentlyAssigned.map(v => (
              <div key={v.verification_id} className="bg-white border border-[#EDE5DB] p-3 text-xs flex justify-between items-center">
                <span className="capitalize">
                  {v.customer?.name && <strong className="not-italic text-[#0C1D42]">{v.customer.name}</strong>}
                  {v.assigned_property_type && (
                    <> → <strong>{v.assigned_bhk_or_units} {v.assigned_property_type}</strong></>
                  )}
                </span>
                <span className="text-[#333333]">
                  {v.status === "approved" ? "Paid (Designing)" : "Pending Payment"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {assigning && (
        <AssignPackageModal
          verification={assigning}
          packages={packages}
          onClose={() => setAssigning(null)}
          onSubmitted={() => { setAssigning(null); loadVerifications(); }}
        />
      )}
    </div>
  );
}

function AssignPackageModal({ verification, packages, onClose, onSubmitted }) {
  const [propertyType, setPropertyType] = useState("");
  const [bhkOrUnits, setBhkOrUnits] = useState("");
  const [discountAmount, setDiscountAmount] = useState("");
  const [discountExpiry, setDiscountExpiry] = useState("24");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Derive options based on selected property type
  const activeGroup = packages.find(g => g.property_type === propertyType);
  const options = activeGroup ? activeGroup.options : [];

  const handleAssign = async () => {
    if (!propertyType || !bhkOrUnits) {
      toast.error("Please select a property type and configuration.");
      return;
    }
    
    setIsSubmitting(true);
    try {
      await api.put(`/admin/verifications/${verification.verification_id}`, {
        action: "assign_package",
        corrected_property_type: propertyType,
        corrected_bhk_or_units: bhkOrUnits,
        discount_amount: discountAmount ? parseFloat(discountAmount) : 0,
        discount_expiry_hours: parseFloat(discountExpiry)
      });
      toast.success("Package assigned! Customer notified to complete payment.");
      onSubmitted();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedBasePrice = options.find(o => o.value === bhkOrUnits)?.price || 0;
  const finalPrice = Math.max(0, selectedBasePrice - (parseFloat(discountAmount) || 0));

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50">
      <div className="bg-white p-8 max-w-xl w-full border-2 border-[#0C1D42]">
        <h3 className="font-display text-2xl text-[#0C1D42] mb-4">Assign Package to {verification.customer?.name || "Customer"}</h3>
        <p className="text-sm text-[#333333] mb-6">Select the best matching package and apply any promised discounts from your conversation.</p>
        
        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-xs uppercase font-bold text-[#0C1D42] mb-1">Property Type</label>
            <select
              value={propertyType}
              onChange={(e) => { setPropertyType(e.target.value); setBhkOrUnits(""); }}
              className="w-full border p-2 text-sm"
            >
              <option value="">-- Select --</option>
              {packages.map(g => <option key={g.property_type} value={g.property_type}>{g.group}</option>)}
            </select>
          </div>
          
          {propertyType && (
            <div>
              <label className="block text-xs uppercase font-bold text-[#0C1D42] mb-1">Configuration</label>
              <select
                value={bhkOrUnits}
                onChange={(e) => setBhkOrUnits(e.target.value)}
                className="w-full border p-2 text-sm"
              >
                <option value="">-- Select --</option>
                {options.map(o => <option key={o.value} value={o.value}>{o.label} (₹{o.price.toLocaleString("en-IN")})</option>)}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs uppercase font-bold text-[#0C1D42] mb-1">Discount Amount (₹)</label>
              <input
                type="number"
                min="0"
                value={discountAmount}
                onChange={(e) => setDiscountAmount(e.target.value)}
                placeholder="e.g. 2000"
                className="w-full border p-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs uppercase font-bold text-[#0C1D42] mb-1">Offer Expiry (Hours)</label>
              <input
                type="number"
                min="1"
                value={discountExpiry}
                onChange={(e) => setDiscountExpiry(e.target.value)}
                className="w-full border p-2 text-sm"
              />
            </div>
          </div>
        </div>

        <div className="bg-[#F5EDE8] p-4 mb-6 border border-[#EDE5DB]">
          <div className="flex justify-between mb-2">
            <span className="text-sm">Base Price:</span>
            <span className="font-bold">₹{selectedBasePrice.toLocaleString("en-IN")}</span>
          </div>
          <div className="flex justify-between mb-2 text-[#9B4A3A]">
            <span className="text-sm">Discount:</span>
            <span className="font-bold">- ₹{(parseFloat(discountAmount) || 0).toLocaleString("en-IN")}</span>
          </div>
          <div className="flex justify-between border-t border-[#DA9E3E] pt-2">
            <span className="text-sm font-bold">Final Price Customer Pays:</span>
            <span className="font-bold text-xl text-[#DA9E3E]">₹{finalPrice.toLocaleString("en-IN")}</span>
          </div>
        </div>

        <div className="flex gap-4">
          <button onClick={onClose} className="border border-[#0C1D42] px-6 py-2 text-xs uppercase font-bold hover:bg-[#F5EDE8]">Cancel</button>
          <button 
            onClick={handleAssign} 
            disabled={isSubmitting || !bhkOrUnits}
            className="bg-[#DA9E3E] text-white px-6 py-2 text-xs uppercase font-bold hover:bg-[#C88C2F] disabled:opacity-50"
          >
            {isSubmitting ? "Assigning..." : "Assign & Notify Customer"}
          </button>
        </div>
      </div>
    </div>
  );
}
