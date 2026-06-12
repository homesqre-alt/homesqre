import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";

export default function InquiryForm({ listing_id, project_id, title = "Interested? Get in touch", compact = false }) {
  const [form, setForm] = useState({ name: "", email: "", mobile: "", message: "I'd like more information." });
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.mobile || !form.email) {
      toast.error("Name, email and mobile are required");
      return;
    }
    if (form.mobile.length !== 10 || !/^\d+$/.test(form.mobile)) {
      toast.error("Please enter a valid 10-digit mobile number");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/inquiries", { ...form, listing_id, project_id });
      toast.success("Inquiry sent!");
      window.gtag?.('event', 'inquiry_sent');
      navigate("/thank-you");
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className={`bg-white border border-[#EDE5DB] ${compact ? "p-5" : "p-8"}`} data-testid="inquiry-form">
      <h3 className="font-display text-2xl text-[#0C1D42] mb-1">{title}</h3>
      <div className="hs-divider-gold mb-5" />
      <div className="space-y-4">
        <div>
          <label className="label-eyebrow mb-1 block">Name</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="hs-input"
            required
            data-testid="inq-name"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label-eyebrow mb-1 block">Mobile</label>
            <input
              value={form.mobile}
              onChange={(e) => setForm({ ...form, mobile: e.target.value.replace(/\D/g, '') })}
              maxLength={10}
              className="hs-input"
              required
              data-testid="inq-mobile"
            />
          </div>
          <div>
            <label className="label-eyebrow mb-1 block">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="hs-input"
              required
              data-testid="inq-email"
            />
          </div>
        </div>
        <div>
          <label className="label-eyebrow mb-1 block">Message</label>
          <textarea
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
            className="hs-input min-h-[80px] resize-none"
            data-testid="inq-message"
          />
        </div>
        <button type="submit" disabled={submitting} className="btn-primary w-full justify-center" data-testid="inq-submit">
          {submitting ? "Sending…" : "Send Inquiry"}
        </button>
      </div>
    </form>
  );
}
