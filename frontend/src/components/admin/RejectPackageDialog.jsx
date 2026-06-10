import { useEffect, useMemo, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";

/**
 * RejectPackageDialog — designer selects the correct package; backend computes
 * the differential the customer must pay. Designer cannot enter a custom amount.
 */
export default function RejectPackageDialog({ verification, onClose, onSubmitted }) {
  const [packages, setPackages] = useState({});  // { apartment: [...], villa: [...], independent: [...] }
  const [propertyType, setPropertyType] = useState(verification.property_type || "apartment");
  const [spec, setSpec] = useState(String(verification.bhk_or_units || ""));
  const [reason, setReason] = useState("Floor plan does not match the selected package.");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/packages")
      .then(({ data }) => setPackages(data))
      .catch(() => toast.error("Failed to load packages"));
  }, []);

  // When property type changes, default spec to the first option of that bucket.
  useEffect(() => {
    const first = packages[propertyType]?.[0]?.value;
    if (first && !packages[propertyType]?.some(p => p.value === spec)) {
      setSpec(first);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyType, packages]);

  const correctedPrice = useMemo(() => {
    const match = (packages[propertyType] || []).find(p => p.value === spec);
    return match?.price || 0;
  }, [packages, propertyType, spec]);

  const invoicePaid = Number(verification.invoice_paid || 0);
  const differential = Math.max(0, correctedPrice - invoicePaid);

  const submit = async () => {
    if (!propertyType || !spec) {
      toast.error("Please select a corrected package");
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.put(`/admin/verifications/${verification.verification_id}`, {
        action: "reject_package",
        corrected_property_type: propertyType,
        corrected_bhk_or_units: spec,
        reason,
      });
      if (data.differential_amount > 0) {
        toast.success(`Customer notified — ₹${data.differential_amount.toLocaleString("en-IN")} differential pending`);
      } else {
        toast.success("Package adjusted at no extra cost — pushed to designing");
      }
      onSubmitted();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} data-testid="reject-package-dialog"
           className="bg-white max-w-xl w-full p-6 space-y-5">
        <header>
          <h3 className="font-display text-2xl text-[#0C1D42]">Reject — Package Mismatch</h3>
          <p className="text-sm text-[#333333] mt-1">
            Customer paid for <strong className="capitalize">{verification.bhk_or_units} {verification.property_type}</strong>{" "}
            (₹{invoicePaid.toLocaleString("en-IN")}). Select the package that actually matches the uploaded floor plan.
          </p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Corrected Property Type">
            <select
              data-testid="corrected-property-type"
              value={propertyType}
              onChange={(e) => setPropertyType(e.target.value)}
              className={inputCls}
            >
              <option value="apartment">Apartment</option>
              <option value="villa">Villa</option>
              <option value="independent">Independent / Rental</option>
            </select>
          </Field>
          <Field label="Corrected Package">
            <select
              data-testid="corrected-bhk-or-units"
              value={spec}
              onChange={(e) => setSpec(e.target.value)}
              className={inputCls}
            >
              {(packages[propertyType] || []).map(p => (
                <option key={p.value} value={p.value}>{p.label} — ₹{p.price.toLocaleString("en-IN")}</option>
              ))}
            </select>
          </Field>
          <Field label="Reason for customer" full>
            <textarea
              rows="2"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={inputCls}
            />
          </Field>
        </div>

        <div className="bg-[#F5EDE8] border border-[#EDE5DB] p-4 grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-[#333333]">Paid</p>
            <p className="font-display text-lg text-[#0C1D42]">₹{invoicePaid.toLocaleString("en-IN")}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-[#333333]">Corrected</p>
            <p className="font-display text-lg text-[#0C1D42]" data-testid="corrected-price">₹{correctedPrice.toLocaleString("en-IN")}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-[#DA9E3E] font-bold">Differential</p>
            <p className="font-display text-2xl text-[#DA9E3E]" data-testid="dialog-differential">₹{differential.toLocaleString("en-IN")}</p>
          </div>
        </div>
        {differential === 0 && correctedPrice > 0 && (
          <p className="text-xs text-[#0C1D42]">No extra payment needed — customer will be pushed to designing immediately.</p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-xs uppercase tracking-widest border border-[#EDE5DB]">Cancel</button>
          <button
            onClick={submit}
            disabled={busy || correctedPrice === 0}
            data-testid="submit-reject-package"
            className="px-4 py-2 text-xs uppercase tracking-widest bg-[#DA9E3E] text-white disabled:opacity-50 hover:bg-[#9d7936]"
          >
            {busy ? "Sending…" : differential > 0 ? "Send to Customer for Payment" : "Confirm & Push to Designing"}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls = "p-2 text-sm border border-[#EDE5DB] focus:outline-none focus:border-[#0C1D42] bg-white w-full";
function Field({ label, full, children }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <label className="block text-[10px] uppercase tracking-widest font-bold text-[#0C1D42] mb-1">{label}</label>
      {children}
    </div>
  );
}
