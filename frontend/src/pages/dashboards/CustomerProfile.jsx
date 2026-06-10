import { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import DashShell from "@/components/layout/DashShell";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { User, MapPin, Palette, Save, CheckCircle2, Lock } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

const INTERIOR_LINKS = [
  { to: "/dashboard/customer", label: "My Project" },
  { to: "/dashboard/profile", label: "Profile & Settings" },
];

const STYLES = [
  "Modern Minimalist",
  "Warm Contemporary",
  "Ultra-Luxury",
  "Scandinavian",
  "Industrial Chic",
  "Classic Traditional",
  "Not sure yet",
];

const TIMELINES = [
  "Within 1 month",
  "1–3 months",
  "3–6 months",
  "6–12 months",
  "Just exploring",
];

const BUDGETS = [
  "Under ₹5L",
  "₹5L – ₹8L",
  "₹8L – ₹12L",
  "₹12L – ₹18L",
  "₹18L – ₹25L",
  "₹25L+",
  "Not sure yet",
];

const PROPERTY_TYPES = ["Apartment", "Villa", "Independent House", "Penthouse"];

function Section({ icon: Icon, title, children }) {
  return (
    <div className="bg-white border border-[#EDE5DB] p-6 lg:p-8">
      <div className="flex items-center gap-3 mb-6 pb-4 border-b border-[#EDE5DB]">
        <div className="w-8 h-8 bg-[#F5EDE8] rounded flex items-center justify-center">
          <Icon size={16} className="text-[#0C1D42]" />
        </div>
        <h2 className="font-display text-2xl text-[#0C1D42]">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="label-eyebrow mb-2 block">{label}</label>
      {children}
    </div>
  );
}

export default function CustomerProfile() {
  const { user, setUserData } = useAuth();
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const [pwdForm, setPwdForm] = useState({ current_password: "", new_password: "" });
  const [pwdBusy, setPwdBusy] = useState(false);

  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otp, setOtp] = useState("");
  const [otpBusy, setOtpBusy] = useState(false);
  const [devOtp, setDevOtp] = useState("");

  const [form, setForm] = useState({
    name: "",
    mobile: "",
    // Address
    address_line1: "",
    address_city: "",
    address_state: "",
    address_pincode: "",
    // Interior preferences
    pref_style: "",
    pref_timeline: "",
    pref_budget: "",
    pref_property_type: "",
  });

  // Pre-populate from user object
  useEffect(() => {
    if (user) {
      setForm({
        name: user.name || "",
        mobile: user.mobile || "",
        address_line1: user.address_line1 || "",
        address_city: user.address_city || "",
        address_state: user.address_state || "",
        address_pincode: user.address_pincode || "",
        pref_style: user.pref_style || "",
        pref_timeline: user.pref_timeline || "",
        pref_budget: user.pref_budget || "",
        pref_property_type: user.pref_property_type || "",
      });
    }
  }, [user]);

  if (user === undefined) return null;
  if (user === null) return <Navigate to="/login" />;
  if (user.role !== "customer") return <Navigate to="/" replace />;

  const save = async (e) => {
    if (e) e.preventDefault();
    
    // Basic mobile validation
    const mobileClean = (form.mobile || "").replace(/\s|-/g, "");
    if (mobileClean && !/^\d{10}$/.test(mobileClean)) {
      toast.error("Please enter a valid 10-digit mobile number");
      return;
    }
    
    // Check if mobile changed
    const originalMobile = (user.mobile || "").replace(/\s|-/g, "");
    if (mobileClean !== originalMobile) {
      setBusy(true);
      try {
        const { data } = await api.post("/me/mobile-otp", { mobile: mobileClean });
        if (data.dev_otp) setDevOtp(data.dev_otp);
        setShowOtpModal(true);
      } catch (err) {
        toast.error(formatApiError(err));
      } finally {
        setBusy(false);
      }
      return; // Stop here and wait for OTP
    }
    
    await executeSave();
  };

  const verifyOtpAndSave = async (e) => {
    e.preventDefault();
    setOtpBusy(true);
    try {
      const mobileClean = (form.mobile || "").replace(/\s|-/g, "");
      const { data } = await api.put("/me/mobile", { mobile: mobileClean, otp });
      if (setUserData) setUserData(data.data || data);
      setShowOtpModal(false);
      setOtp("");
      setDevOtp("");
      toast.success("Mobile number verified and updated!");
      // Proceed to save the rest
      await executeSave();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setOtpBusy(false);
    }
  };

  const executeSave = async () => {
    setBusy(true);
    try {
      const data = await api.put("/me/profile", form);
      if (setUserData) setUserData(data.data || data);
      setSaved(true);
      toast.success("Profile updated successfully!");
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setBusy(false);
    }
  };

  const changePassword = async () => {
    if (pwdForm.new_password.length < 8) {
      toast.error("New password must be at least 8 characters long");
      return;
    }
    setPwdBusy(true);
    try {
      await api.put("/me/password", pwdForm);
      toast.success("Password updated successfully!");
      setPwdForm({ current_password: "", new_password: "" });
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setPwdBusy(false);
    }
  };

  const inputCls = "hs-input w-full";

  return (
    <DashShell links={INTERIOR_LINKS} title="Profile & Settings">
      <form onSubmit={save} className="space-y-6" data-testid="profile-settings-form">

        {/* ── Personal Details ─────────────────────────────────────────── */}
        <Section icon={User} title="Personal Details">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Full Name">
              <input
                className={inputCls}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Your full name"
                data-testid="profile-name"
              />
            </Field>
            <Field label="Mobile Number">
              <input
                className={inputCls}
                value={form.mobile}
                onChange={(e) => setForm({ ...form, mobile: e.target.value.replace(/\D/g, '') })}
                placeholder="10-digit mobile number"
                maxLength={10}
                pattern="^[0-9]{10}$"
                title="Phone number must be exactly 10 digits"
                data-testid="profile-mobile"
              />
            </Field>
            <Field label="Email Address">
              <input
                className={`${inputCls} opacity-60 cursor-not-allowed`}
                value={user.email}
                readOnly
                disabled
              />
              <p className="text-xs text-[#333333] mt-1">
                Email cannot be changed. Contact support if needed.
              </p>
            </Field>
          </div>
        </Section>

        {/* ── Address Details ───────────────────────────────────────────── */}
        <Section icon={MapPin} title="Address Details">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Street / Locality">
              <input
                className={inputCls}
                value={form.address_line1}
                onChange={(e) => setForm({ ...form, address_line1: e.target.value })}
                placeholder="e.g. 45, 3rd Cross, Indiranagar"
                data-testid="profile-address-line1"
              />
            </Field>
            <Field label="City">
              <input
                className={`${inputCls} opacity-60 cursor-not-allowed`}
                value="Bangalore"
                readOnly
                disabled
                data-testid="profile-city"
              />
            </Field>
            <Field label="State">
              <input
                className={`${inputCls} opacity-60 cursor-not-allowed`}
                value="Karnataka"
                readOnly
                disabled
                data-testid="profile-state"
              />
            </Field>
            <Field label="Pincode">
              <input
                className={inputCls}
                value={form.address_pincode}
                onChange={(e) => setForm({ ...form, address_pincode: e.target.value })}
                placeholder="e.g. 560038"
                pattern="^[0-9]{6}$"
                title="Pincode must be 6 digits"
                data-testid="profile-pincode"
              />
            </Field>
          </div>
        </Section>

        {/* ── Interior Preferences ─────────────────────────────────────── */}
        <Section icon={Palette} title="Interior Preferences">
          <p className="text-sm text-[#333333] mb-6">
            Help your designer understand your vision before your first call. The more you share, the better we personalise your experience.
          </p>

          <div className="space-y-6">
            {/* Design style */}
            <Field label="Preferred Design Style">
              <div className="flex flex-wrap gap-2 mt-2">
                {STYLES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setForm({ ...form, pref_style: s })}
                    className={`text-xs px-4 py-2 border tracking-wide transition ${
                      form.pref_style === s
                        ? "border-[#0C1D42] bg-[#0C1D42] text-white"
                        : "border-[#EDE5DB] text-[#333333] hover:border-[#DA9E3E]"
                    }`}
                    data-testid={`pref-style-${s.toLowerCase().replace(/\s/g, "-")}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </Field>

            {/* Property type */}
            <Field label="Property Type">
              <div className="flex flex-wrap gap-2 mt-2">
                {PROPERTY_TYPES.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setForm({ ...form, pref_property_type: p })}
                    className={`text-xs px-4 py-2 border tracking-wide transition ${
                      form.pref_property_type === p
                        ? "border-[#0C1D42] bg-[#0C1D42] text-white"
                        : "border-[#EDE5DB] text-[#333333] hover:border-[#DA9E3E]"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </Field>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Timeline */}
              <Field label="Move-in Timeline">
                <select
                  className={inputCls}
                  value={form.pref_timeline}
                  onChange={(e) => setForm({ ...form, pref_timeline: e.target.value })}
                  data-testid="pref-timeline"
                >
                  <option value="">Select timeline…</option>
                  {TIMELINES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </Field>

              {/* Budget */}
              <Field label="Expected Budget">
                <select
                  className={inputCls}
                  value={form.pref_budget}
                  onChange={(e) => setForm({ ...form, pref_budget: e.target.value })}
                  data-testid="pref-budget"
                >
                  <option value="">Select budget range…</option>
                  {BUDGETS.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </Field>
            </div>
          </div>
        </Section>

        {/* ── Security Settings ─────────────────────────────────────── */}
        <Section icon={Lock} title="Security Settings">
          <p className="text-sm text-[#333333] mb-6">
            Update your password to keep your account secure.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Current Password">
              <input
                type="password"
                className={inputCls}
                value={pwdForm.current_password}
                onChange={(e) => setPwdForm({ ...pwdForm, current_password: e.target.value })}
                placeholder="Enter current password"
              />
            </Field>
            <Field label="New Password">
              <input
                type="password"
                className={inputCls}
                value={pwdForm.new_password}
                onChange={(e) => setPwdForm({ ...pwdForm, new_password: e.target.value })}
                placeholder="Enter new password (min 8 chars)"
              />
            </Field>
          </div>
          <div className="mt-4">
            <button
              type="button"
              onClick={changePassword}
              disabled={pwdBusy || !pwdForm.current_password || !pwdForm.new_password}
              className="px-6 py-2 text-xs uppercase tracking-widest bg-[#0C1D42] text-white hover:bg-[#08142D] disabled:opacity-50"
            >
              {pwdBusy ? "Updating…" : "Update Password"}
            </button>
          </div>
        </Section>

        {/* ── Save ─────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={busy}
            className="btn-primary px-10 py-3 justify-center"
            data-testid="profile-save-btn"
          >
            {busy ? (
              "Saving…"
            ) : (
              <>
                <Save size={15} className="mr-2" /> Save Changes
              </>
            )}
          </button>
          {saved && (
            <div className="flex items-center gap-2 text-sm text-green-700 font-medium animate-in fade-in">
              <CheckCircle2 size={16} /> Saved successfully!
            </div>
          )}
        </div>
      </form>

      {/* OTP Modal */}
      <Dialog open={showOtpModal} onOpenChange={setShowOtpModal}>
        <DialogContent className="sm:max-w-[425px] bg-[#FCFAF5] border-[#D4C9BE] p-6">
          <div className="text-center mb-6">
            <DialogTitle className="font-display text-2xl text-[#0C1D42] mb-2">
              Verify New Number
            </DialogTitle>
            <DialogDescription className="text-sm text-[#333333]">
              We sent a verification code to <strong>{form.mobile}</strong>
            </DialogDescription>
          </div>

          <form onSubmit={verifyOtpAndSave} className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs tracking-widest uppercase text-[#333333] font-semibold">Enter OTP</label>
              <input
                type="text"
                required
                placeholder="123456"
                maxLength={6}
                className="flex h-10 w-full rounded-md border border-[#D4C9BE] bg-white px-3 py-2 text-sm text-center tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-[#DA9E3E]"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              />
              {devOtp && <p className="text-xs text-[#333333]/50 text-center mt-1">Dev OTP: {devOtp}</p>}
            </div>

            <button type="submit" disabled={otpBusy} className="w-full btn-gold justify-center mt-4">
              {otpBusy ? "Verifying..." : "Verify & Save Profile"}
            </button>
          </form>
        </DialogContent>
      </Dialog>
    </DashShell>
  );
}
