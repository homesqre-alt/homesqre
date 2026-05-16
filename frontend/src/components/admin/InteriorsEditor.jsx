import { useEffect, useState } from "react";
import api, { formatApiError, formatINR } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

export default function InteriorsEditor() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { load(); }, []);
  const load = () => api.get("/content/interiors").then(({ data }) => setData(data));

  const save = async () => {
    setBusy(true);
    try {
      await api.put("/content/interiors", data);
      toast.success("Interiors content saved");
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

  const updateList = (key, fn) => setData((d) => ({ ...d, [key]: fn(d[key] || []) }));

  return (
    <div className="space-y-8 max-w-5xl">
      <Section title="Hero">
        <Field label="Headline">
          <input className="hs-input" value={data.hero?.headline || ""} onChange={(e) => upd("hero.headline", e.target.value)} data-testid="int-hero-headline" />
        </Field>
        <Field label="Subheadline">
          <textarea className="hs-input min-h-[60px]" value={data.hero?.subheadline || ""} onChange={(e) => upd("hero.subheadline", e.target.value)} />
        </Field>
        <Field label="Offer Text (e.g. Flat 10% off this month)">
          <input className="hs-input" value={data.hero?.offer || ""} onChange={(e) => upd("hero.offer", e.target.value)} />
        </Field>
        <Field label="Show offer?">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!data.hero?.show_offer} onChange={(e) => upd("hero.show_offer", e.target.checked)} />
            Show
          </label>
        </Field>
        <Field label="CTA Button Text">
          <input className="hs-input" value={data.hero?.cta || ""} onChange={(e) => upd("hero.cta", e.target.value)} />
        </Field>
        <Field label="Background images (comma-separated URLs)" full>
          <input
            className="hs-input"
            value={(data.hero?.backgrounds || []).join(", ")}
            onChange={(e) => upd("hero.backgrounds", e.target.value.split(",").map(x => x.trim()).filter(Boolean))}
          />
        </Field>
      </Section>

      <Section title="How It Works (steps)">
        <div className="md:col-span-2 space-y-3">
          {(data.how_it_works || []).map((s, i) => (
            <div key={i} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-start bg-[#FAF9F6] p-3 border border-[#E8E4D9]">
              <input className="hs-input md:col-span-1" type="number" value={s.step} onChange={(e) => updateList("how_it_works", (l) => l.map((x, j) => j === i ? { ...x, step: Number(e.target.value) } : x))} />
              <input className="hs-input md:col-span-2" placeholder="icon" value={s.icon} onChange={(e) => updateList("how_it_works", (l) => l.map((x, j) => j === i ? { ...x, icon: e.target.value } : x))} />
              <input className="hs-input md:col-span-3" placeholder="title" value={s.title} onChange={(e) => updateList("how_it_works", (l) => l.map((x, j) => j === i ? { ...x, title: e.target.value } : x))} />
              <input className="hs-input md:col-span-5" placeholder="description" value={s.description} onChange={(e) => updateList("how_it_works", (l) => l.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} />
              <button className="md:col-span-1 text-[#9B4A3A]" onClick={() => updateList("how_it_works", (l) => l.filter((_, j) => j !== i))}><Trash2 size={15} /></button>
            </div>
          ))}
          <button
            onClick={() => updateList("how_it_works", (l) => [...l, { step: l.length + 1, icon: "home", title: "New step", description: "" }])}
            className="btn-secondary text-xs"
            data-testid="int-add-step"
          ><Plus size={12} /> Add step</button>
        </div>
      </Section>

      <Section title="Services">
        <div className="md:col-span-2 space-y-3">
          {(data.services || []).map((s, i) => (
            <div key={i} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-start bg-[#FAF9F6] p-3 border border-[#E8E4D9]">
              <input className="hs-input md:col-span-2" placeholder="icon" value={s.icon} onChange={(e) => updateList("services", (l) => l.map((x, j) => j === i ? { ...x, icon: e.target.value } : x))} />
              <input className="hs-input md:col-span-3" placeholder="title" value={s.title} onChange={(e) => updateList("services", (l) => l.map((x, j) => j === i ? { ...x, title: e.target.value } : x))} />
              <input className="hs-input md:col-span-6" placeholder="description" value={s.description} onChange={(e) => updateList("services", (l) => l.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} />
              <button className="md:col-span-1 text-[#9B4A3A]" onClick={() => updateList("services", (l) => l.filter((_, j) => j !== i))}><Trash2 size={15} /></button>
            </div>
          ))}
          <button
            onClick={() => updateList("services", (l) => [...l, { icon: "home", title: "New service", description: "" }])}
            className="btn-secondary text-xs"
          ><Plus size={12} /> Add service</button>
        </div>
      </Section>

      <Section title="Why Choose Us (stats, max 6)">
        <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-3">
          {(data.why_choose_us || []).map((s, i) => (
            <div key={i} className="bg-[#FAF9F6] p-3 border border-[#E8E4D9] relative">
              <input className="hs-input mb-2" placeholder="icon" value={s.icon} onChange={(e) => updateList("why_choose_us", (l) => l.map((x, j) => j === i ? { ...x, icon: e.target.value } : x))} />
              <input className="hs-input mb-2" placeholder="value" value={s.value} onChange={(e) => updateList("why_choose_us", (l) => l.map((x, j) => j === i ? { ...x, value: e.target.value } : x))} />
              <input className="hs-input" placeholder="label" value={s.label} onChange={(e) => updateList("why_choose_us", (l) => l.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
              <button className="absolute top-2 right-2 text-[#9B4A3A]" onClick={() => updateList("why_choose_us", (l) => l.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
            </div>
          ))}
          {(data.why_choose_us || []).length < 6 && (
            <button
              onClick={() => updateList("why_choose_us", (l) => [...l, { icon: "shield-check", value: "100+", label: "New stat" }])}
              className="btn-secondary text-xs h-fit"
            ><Plus size={12} /> Add stat</button>
          )}
        </div>
      </Section>

      <Section title="Cost Estimator Matrix">
        <div className="md:col-span-2 overflow-x-auto">
          <table className="w-full text-sm border border-[#E8E4D9] min-w-[600px]">
            <thead>
              <tr className="bg-[#F3F0E9]">
                <th className="p-3 text-left label-eyebrow">BHK</th>
                {["Basic", "Standard", "Premium"].map((t) => <th key={t} className="p-3 text-left label-eyebrow">{t}</th>)}
              </tr>
            </thead>
            <tbody>
              {Object.entries(data.cost_matrix || {}).map(([bhk, tiers]) => (
                <tr key={bhk} className="border-t border-[#E8E4D9]">
                  <td className="p-3 font-semibold">{bhk}</td>
                  {["Basic", "Standard", "Premium"].map((tier) => (
                    <td key={tier} className="p-2">
                      <div className="flex gap-1 items-center">
                        <input
                          className="hs-input text-xs"
                          type="number"
                          value={tiers[tier]?.[0] || 0}
                          onChange={(e) => upd(`cost_matrix.${bhk}.${tier}`, [Number(e.target.value), tiers[tier]?.[1] || 0])}
                        />
                        <span>—</span>
                        <input
                          className="hs-input text-xs"
                          type="number"
                          value={tiers[tier]?.[1] || 0}
                          onChange={(e) => upd(`cost_matrix.${bhk}.${tier}`, [tiers[tier]?.[0] || 0, Number(e.target.value)])}
                        />
                      </div>
                      <div className="text-[10px] text-[#758A80] mt-1">{formatINR(tiers[tier]?.[0] || 0)} – {formatINR(tiers[tier]?.[1] || 0)}</div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Gallery">
        <div className="md:col-span-2 space-y-3">
          {(data.gallery || []).map((g, i) => (
            <div key={i} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-start bg-[#FAF9F6] p-3 border border-[#E8E4D9]">
              <input className="hs-input md:col-span-2" placeholder="room" value={g.room} onChange={(e) => updateList("gallery", (l) => l.map((x, j) => j === i ? { ...x, room: e.target.value } : x))} />
              <input className="hs-input md:col-span-3" placeholder="title" value={g.title} onChange={(e) => updateList("gallery", (l) => l.map((x, j) => j === i ? { ...x, title: e.target.value } : x))} />
              <input className="hs-input md:col-span-6" placeholder="image url" value={g.url} onChange={(e) => updateList("gallery", (l) => l.map((x, j) => j === i ? { ...x, url: e.target.value } : x))} />
              <button className="md:col-span-1 text-[#9B4A3A]" onClick={() => updateList("gallery", (l) => l.filter((_, j) => j !== i))}><Trash2 size={15} /></button>
            </div>
          ))}
          <button
            onClick={() => updateList("gallery", (l) => [...l, { room: "Living Room", title: "", url: "" }])}
            className="btn-secondary text-xs"
          ><Plus size={12} /> Add image</button>
        </div>
      </Section>

      <Section title="Reviews">
        <div className="md:col-span-2 space-y-3">
          {(data.reviews || []).map((r, i) => (
            <div key={i} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-start bg-[#FAF9F6] p-3 border border-[#E8E4D9]">
              <input className="hs-input md:col-span-2" placeholder="name" value={r.name} onChange={(e) => updateList("reviews", (l) => l.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
              <input className="hs-input md:col-span-1" placeholder="flat" value={r.flat} onChange={(e) => updateList("reviews", (l) => l.map((x, j) => j === i ? { ...x, flat: e.target.value } : x))} />
              <input className="hs-input md:col-span-2" placeholder="locality" value={r.locality} onChange={(e) => updateList("reviews", (l) => l.map((x, j) => j === i ? { ...x, locality: e.target.value } : x))} />
              <input className="hs-input md:col-span-1" type="number" min={1} max={5} value={r.rating || 5} onChange={(e) => updateList("reviews", (l) => l.map((x, j) => j === i ? { ...x, rating: Number(e.target.value) } : x))} />
              <input className="hs-input md:col-span-5" placeholder="review text" value={r.text} onChange={(e) => updateList("reviews", (l) => l.map((x, j) => j === i ? { ...x, text: e.target.value } : x))} />
              <button className="md:col-span-1 text-[#9B4A3A]" onClick={() => updateList("reviews", (l) => l.filter((_, j) => j !== i))}><Trash2 size={15} /></button>
            </div>
          ))}
          <button
            onClick={() => updateList("reviews", (l) => [...l, { name: "", flat: "3BHK", locality: "", rating: 5, text: "" }])}
            className="btn-secondary text-xs"
          ><Plus size={12} /> Add review</button>
        </div>
      </Section>

      <Section title="FAQ">
        <div className="md:col-span-2 space-y-3">
          {(data.faq || []).map((f, i) => (
            <div key={i} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-start bg-[#FAF9F6] p-3 border border-[#E8E4D9]">
              <input className="hs-input md:col-span-4" placeholder="question" value={f.q} onChange={(e) => updateList("faq", (l) => l.map((x, j) => j === i ? { ...x, q: e.target.value } : x))} />
              <input className="hs-input md:col-span-7" placeholder="answer" value={f.a} onChange={(e) => updateList("faq", (l) => l.map((x, j) => j === i ? { ...x, a: e.target.value } : x))} />
              <button className="md:col-span-1 text-[#9B4A3A]" onClick={() => updateList("faq", (l) => l.filter((_, j) => j !== i))}><Trash2 size={15} /></button>
            </div>
          ))}
          <button
            onClick={() => updateList("faq", (l) => [...l, { q: "", a: "" }])}
            className="btn-secondary text-xs"
          ><Plus size={12} /> Add FAQ</button>
        </div>
      </Section>

      <Section title="Final CTA Banner">
        <Field label="Headline">
          <input className="hs-input" value={data.final_cta?.headline || ""} onChange={(e) => upd("final_cta.headline", e.target.value)} />
        </Field>
        <Field label="Subtext">
          <input className="hs-input" value={data.final_cta?.subtext || ""} onChange={(e) => upd("final_cta.subtext", e.target.value)} />
        </Field>
        <Field label="CTA Button Text">
          <input className="hs-input" value={data.final_cta?.cta || ""} onChange={(e) => upd("final_cta.cta", e.target.value)} />
        </Field>
        <Field label="Background URL">
          <input className="hs-input" value={data.final_cta?.background || ""} onChange={(e) => upd("final_cta.background", e.target.value)} />
        </Field>
      </Section>

      <div className="flex justify-end gap-3 pt-6 border-t border-[#E8E4D9] sticky bottom-0 bg-[#FAF9F6] py-4">
        <button onClick={load} className="btn-secondary">Reset</button>
        <button onClick={save} disabled={busy} className="btn-primary" data-testid="int-save">
          {busy ? "Saving…" : "Save Interiors Page"}
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
