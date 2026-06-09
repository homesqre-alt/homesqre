import { useEffect, useState, useCallback } from "react";
import api, { formatApiError, formatINR } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

export default function InteriorsEditor() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () => api.get("/content/interiors").then(({ data }) => setData(data)),
    []
  );
  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setBusy(true);
    try {
      await api.put("/content/interiors", data);
      toast.success("Interiors content saved");
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setBusy(false);
    }
  };

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

  const updateList = (key, fn) =>
    setData((d) => ({ ...d, [key]: fn(d[key] || []) }));

  if (!data) return <div>Loading…</div>;

  return (
    <div className="space-y-8 max-w-5xl">
      <HeroSection data={data} upd={upd} />
      <ListSection
        title="How It Works (steps)"
        items={data.how_it_works}
        columns={[
          { key: "step", placeholder: "#", type: "number", span: 1 },
          { key: "icon", placeholder: "icon", span: 2 },
          { key: "title", placeholder: "title", span: 3 },
          { key: "description", placeholder: "description", span: 5 },
        ]}
        onChange={(fn) => updateList("how_it_works", fn)}
        newItem={(l) => ({ step: l.length + 1, icon: "home", title: "New step", description: "" })}
        addLabel="Add step"
        testId="int-add-step"
      />
      <ListSection
        title="Services"
        items={data.services}
        columns={[
          { key: "icon", placeholder: "icon", span: 2 },
          { key: "title", placeholder: "title", span: 3 },
          { key: "description", placeholder: "description", span: 6 },
        ]}
        onChange={(fn) => updateList("services", fn)}
        newItem={() => ({ icon: "home", title: "New service", description: "" })}
        addLabel="Add service"
      />
      <WhyChooseUsSection items={data.why_choose_us} updateList={updateList} />
      <CostMatrixSection matrix={data.cost_matrix || {}} upd={upd} />
      <ListSection
        title="Gallery"
        items={data.gallery}
        columns={[
          { key: "room", placeholder: "room", span: 2 },
          { key: "title", placeholder: "title", span: 3 },
          { key: "url", placeholder: "image url", span: 6 },
        ]}
        onChange={(fn) => updateList("gallery", fn)}
        newItem={() => ({ room: "Living Room", title: "", url: "" })}
        addLabel="Add image"
      />
      <ListSection
        title="Reviews"
        items={data.reviews}
        columns={[
          { key: "name", placeholder: "name", span: 2 },
          { key: "flat", placeholder: "flat", span: 1 },
          { key: "locality", placeholder: "locality", span: 2 },
          { key: "rating", placeholder: "rating", type: "number", span: 1 },
          { key: "text", placeholder: "review text", span: 5 },
        ]}
        onChange={(fn) => updateList("reviews", fn)}
        newItem={() => ({ name: "", flat: "3BHK", locality: "", rating: 5, text: "" })}
        addLabel="Add review"
      />
      <ListSection
        title="FAQ"
        items={data.faq}
        columns={[
          { key: "q", placeholder: "question", span: 4 },
          { key: "a", placeholder: "answer", span: 7 },
        ]}
        onChange={(fn) => updateList("faq", fn)}
        newItem={() => ({ q: "", a: "" })}
        addLabel="Add FAQ"
      />
      <FinalCtaSection data={data} upd={upd} />

      <div className="flex justify-end gap-3 pt-6 border-t border-[#E8E4D9] sticky bottom-0 bg-[#FCFAF5] py-4">
        <button onClick={load} className="btn-secondary">
          Reset
        </button>
        <button onClick={save} disabled={busy} className="btn-primary" data-testid="int-save">
          {busy ? "Saving…" : "Save Interiors Page"}
        </button>
      </div>
    </div>
  );
}

function HeroSection({ data, upd }) {
  return (
    <Section title="Hero">
      <Field label="Headline">
        <input
          className="hs-input"
          value={data.hero?.headline || ""}
          onChange={(e) => upd("hero.headline", e.target.value)}
          data-testid="int-hero-headline"
        />
      </Field>
      <Field label="Subheadline">
        <textarea
          className="hs-input min-h-[60px]"
          value={data.hero?.subheadline || ""}
          onChange={(e) => upd("hero.subheadline", e.target.value)}
        />
      </Field>
      <Field label="Offer Text (e.g. Flat 10% off this month)">
        <input
          className="hs-input"
          value={data.hero?.offer || ""}
          onChange={(e) => upd("hero.offer", e.target.value)}
        />
      </Field>
      <Field label="Show offer?">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!data.hero?.show_offer}
            onChange={(e) => upd("hero.show_offer", e.target.checked)}
          />
          Show
        </label>
      </Field>
      <Field label="CTA Button Text">
        <input
          className="hs-input"
          value={data.hero?.cta || ""}
          onChange={(e) => upd("hero.cta", e.target.value)}
        />
      </Field>
      <Field label="Background images (comma-separated URLs)" full>
        <input
          className="hs-input"
          value={(data.hero?.backgrounds || []).join(", ")}
          onChange={(e) =>
            upd(
              "hero.backgrounds",
              e.target.value.split(",").map((x) => x.trim()).filter(Boolean)
            )
          }
        />
      </Field>
    </Section>
  );
}

function ListSection({ title, items, columns, onChange, newItem, addLabel, testId }) {
  return (
    <Section title={title}>
      <div className="md:col-span-2 space-y-3">
        {(items || []).map((row, i) => (
          <ListRow
            key={`row-${i}-${row[columns[0].key] || ""}`}
            row={row}
            columns={columns}
            onUpdate={(patch) =>
              onChange((l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)))
            }
            onDelete={() => onChange((l) => l.filter((_, j) => j !== i))}
          />
        ))}
        <button
          onClick={() => onChange((l) => [...l, newItem(l)])}
          className="btn-secondary text-xs"
          data-testid={testId}
        >
          <Plus size={12} /> {addLabel}
        </button>
      </div>
    </Section>
  );
}

function ListRow({ row, columns, onUpdate, onDelete }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-start bg-[#FCFAF5] p-3 border border-[#E8E4D9]">
      {columns.map((c) => (
        <input
          key={c.key}
          className="hs-input"
          style={{ gridColumn: `span ${c.span} / span ${c.span}` }}
          type={c.type || "text"}
          placeholder={c.placeholder}
          value={row[c.key] ?? ""}
          onChange={(e) =>
            onUpdate({ [c.key]: c.type === "number" ? Number(e.target.value) : e.target.value })
          }
        />
      ))}
      <button
        className="text-[#9B4A3A]"
        style={{ gridColumn: "span 1 / span 1" }}
        onClick={onDelete}
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}

function WhyChooseUsSection({ items, updateList }) {
  const list = items || [];
  return (
    <Section title="Why Choose Us (stats, max 6)">
      <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-3">
        {list.map((s, i) => (
          <div key={`why-${i}-${s.value || ""}`} className="bg-[#FCFAF5] p-3 border border-[#E8E4D9] relative">
            <input
              className="hs-input mb-2"
              placeholder="icon"
              value={s.icon}
              onChange={(e) =>
                updateList("why_choose_us", (l) =>
                  l.map((x, j) => (j === i ? { ...x, icon: e.target.value } : x))
                )
              }
            />
            <input
              className="hs-input mb-2"
              placeholder="value"
              value={s.value}
              onChange={(e) =>
                updateList("why_choose_us", (l) =>
                  l.map((x, j) => (j === i ? { ...x, value: e.target.value } : x))
                )
              }
            />
            <input
              className="hs-input"
              placeholder="label"
              value={s.label}
              onChange={(e) =>
                updateList("why_choose_us", (l) =>
                  l.map((x, j) => (j === i ? { ...x, label: e.target.value } : x))
                )
              }
            />
            <button
              className="absolute top-2 right-2 text-[#9B4A3A]"
              onClick={() =>
                updateList("why_choose_us", (l) => l.filter((_, j) => j !== i))
              }
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        {list.length < 6 && (
          <button
            onClick={() =>
              updateList("why_choose_us", (l) => [
                ...l,
                { icon: "shield-check", value: "100+", label: "New stat" },
              ])
            }
            className="btn-secondary text-xs h-fit"
          >
            <Plus size={12} /> Add stat
          </button>
        )}
      </div>
    </Section>
  );
}

function CostMatrixSection({ matrix, upd }) {
  const tiers = ["Basic", "Standard", "Premium"];
  return (
    <Section title="Cost Estimator Matrix">
      <div className="md:col-span-2 overflow-x-auto">
        <table className="w-full text-sm border border-[#E8E4D9] min-w-[600px]">
          <thead>
            <tr className="bg-[#F3F0E9]">
              <th className="p-3 text-left label-eyebrow">BHK</th>
              {tiers.map((t) => (
                <th key={t} className="p-3 text-left label-eyebrow">
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(matrix).map(([bhk, tiersObj]) => (
              <tr key={bhk} className="border-t border-[#E8E4D9]">
                <td className="p-3 font-semibold">{bhk}</td>
                {tiers.map((tier) => (
                  <td key={`${bhk}-${tier}`} className="p-2">
                    <CostMatrixCell
                      bhk={bhk}
                      tier={tier}
                      range={tiersObj[tier] || [0, 0]}
                      onChange={(next) => upd(`cost_matrix.${bhk}.${tier}`, next)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function CostMatrixCell({ range, onChange }) {
  // Defensive: range may arrive as a scalar number, undefined, or [lo, hi] array
  const arr = Array.isArray(range)
    ? range
    : typeof range === "number"
    ? [range, range]
    : [0, 0];
  const lo = Number(arr[0]) || 0;
  const hi = Number(arr[1]) || 0;
  return (
    <>
      <div className="flex gap-1 items-center">
        <input
          className="hs-input text-xs"
          type="number"
          value={lo}
          onChange={(e) => onChange([Number(e.target.value), hi])}
        />
        <span>—</span>
        <input
          className="hs-input text-xs"
          type="number"
          value={hi}
          onChange={(e) => onChange([lo, Number(e.target.value)])}
        />
      </div>
      <div className="text-[10px] text-[#456C9A] mt-1">
        {formatINR(lo)} – {formatINR(hi)}
      </div>
    </>
  );
}

function FinalCtaSection({ data, upd }) {
  return (
    <Section title="Final CTA Banner">
      <Field label="Headline">
        <input
          className="hs-input"
          value={data.final_cta?.headline || ""}
          onChange={(e) => upd("final_cta.headline", e.target.value)}
        />
      </Field>
      <Field label="Subtext">
        <input
          className="hs-input"
          value={data.final_cta?.subtext || ""}
          onChange={(e) => upd("final_cta.subtext", e.target.value)}
        />
      </Field>
      <Field label="CTA Button Text">
        <input
          className="hs-input"
          value={data.final_cta?.cta || ""}
          onChange={(e) => upd("final_cta.cta", e.target.value)}
        />
      </Field>
      <Field label="Background URL">
        <input
          className="hs-input"
          value={data.final_cta?.background || ""}
          onChange={(e) => upd("final_cta.background", e.target.value)}
        />
      </Field>
    </Section>
  );
}

function Section({ title, children }) {
  return (
    <div className="bg-white border border-[#E8E4D9] p-6">
      <div className="font-display text-2xl text-[#0C1D42] mb-5">{title}</div>
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
