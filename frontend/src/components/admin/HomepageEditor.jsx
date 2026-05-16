import { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";

export default function HomepageEditor() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { load(); }, []);
  const load = () => api.get("/content/homepage").then(({ data }) => setData(data));

  const save = async () => {
    setBusy(true);
    try {
      await api.put("/content/homepage", data);
      toast.success("Homepage content saved");
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setBusy(false); }
  };

  if (!data) return <div>Loading…</div>;

  const upd = (path, val) => {
    setData((d) => {
      const next = JSON.parse(JSON.stringify(d));
      const keys = path.split(".");
      let cur = next;
      for (let i = 0; i < keys.length - 1; i++) cur = cur[keys[i]] = cur[keys[i]] || {};
      cur[keys[keys.length - 1]] = val;
      return next;
    });
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <Section title="Hero">
        <Field label="Headline">
          <input className="hs-input" value={data.hero?.headline || ""} onChange={(e) => upd("hero.headline", e.target.value)} data-testid="hp-hero-headline" />
        </Field>
        <Field label="Subheadline">
          <textarea className="hs-input min-h-[60px]" value={data.hero?.subheadline || ""} onChange={(e) => upd("hero.subheadline", e.target.value)} />
        </Field>
        <Field label="CTA Button Text">
          <input className="hs-input" value={data.hero?.cta || ""} onChange={(e) => upd("hero.cta", e.target.value)} />
        </Field>
        <Field label="Background image URL" full>
          <input className="hs-input" value={data.hero?.background || ""} onChange={(e) => upd("hero.background", e.target.value)} />
        </Field>
      </Section>

      <Section title="Sitewide Promo Banner">
        <Field label="Text">
          <input className="hs-input" value={data.promo_banner?.text || ""} onChange={(e) => upd("promo_banner.text", e.target.value)} />
        </Field>
        <Field label="Background Color (hex)">
          <input className="hs-input" value={data.promo_banner?.color || "#06402B"} onChange={(e) => upd("promo_banner.color", e.target.value)} />
        </Field>
        <Field label="Show banner?">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!data.promo_banner?.show} onChange={(e) => upd("promo_banner.show", e.target.checked)} data-testid="hp-promo-show" />
            Active
          </label>
        </Field>
      </Section>

      <Section title="Stats Bar">
        {["homes", "agents", "cities", "projects"].map((k) => (
          <Field key={k} label={k}>
            <input type="number" className="hs-input" value={data.stats?.[k] || 0} onChange={(e) => upd(`stats.${k}`, Number(e.target.value))} />
          </Field>
        ))}
      </Section>

      <div className="flex justify-end gap-3 pt-6 border-t border-[#E8E4D9]">
        <button onClick={load} className="btn-secondary">Reset</button>
        <button onClick={save} disabled={busy} className="btn-primary" data-testid="hp-save">
          {busy ? "Saving…" : "Save Homepage"}
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="bg-white border border-[#E8E4D9] p-6">
      <div className="font-display text-2xl text-[#06402B] mb-5">{title}</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>
    </div>
  );
}

function Field({ label, full = false, children }) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <label className="label-eyebrow mb-1 block">{label}</label>
      {children}
    </div>
  );
}
