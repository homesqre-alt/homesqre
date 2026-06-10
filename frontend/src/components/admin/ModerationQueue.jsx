import { useCallback, useEffect, useState } from "react";
import api, { formatApiError, formatINR } from "@/lib/api";
import { toast } from "sonner";
import { CheckCircle2, XCircle, AlertTriangle, Inbox } from "lucide-react";

const KINDS = [
  { id: "listings", label: "Listings", idKey: "listing_id" },
  { id: "projects", label: "Projects", idKey: "project_id" },
  { id: "localities", label: "Localities", idKey: "locality_id" },
];

export default function ModerationQueue() {
  const [data, setData] = useState({ listings: [], projects: [], localities: [], counts: {} });
  const [active, setActive] = useState("listings");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [rejecting, setRejecting] = useState(null); // {kind, id}
  const [reason, setReason] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/moderation/queue");
      setData(data);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const moderate = async (kind, id, action, reasonText) => {
    setBusyId(id);
    try {
      await api.put(`/admin/${kind}/${id}/moderation`, { action, reason: reasonText });
      toast.success(action === "approve" ? "Approved" : "Rejected");
      setRejecting(null);
      setReason("");
      reload();
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setBusyId(null);
    }
  };

  const items = data[active] || [];
  const counts = data.counts || {};

  return (
    <div className="space-y-6">
      {/* Pending summary banner */}
      <div className="bg-[#FEF08A] border-l-4 border-[#DA9E3E] p-5 flex items-start gap-3">
        <AlertTriangle size={20} className="text-[#7C5800] shrink-0 mt-0.5" />
        <div>
          <div className="font-semibold text-[#7C5800]">
            {counts.total || 0} item{counts.total === 1 ? "" : "s"} pending review
          </div>
          <div className="text-xs text-[#7C5800]/80 mt-0.5">
            Listings: {counts.listings || 0} · Projects: {counts.projects || 0} · Localities: {counts.localities || 0}
          </div>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-2 border-b border-[#EDE5DB]">
        {KINDS.map((k) => (
          <button
            key={k.id}
            onClick={() => setActive(k.id)}
            className={`px-5 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
              active === k.id
                ? "border-[#0C1D42] text-[#0C1D42]"
                : "border-transparent text-[#333333] hover:text-[#0C1D42]"
            }`}
            data-testid={`mod-tab-${k.id}`}
          >
            {k.label}
            {counts[k.id] > 0 && (
              <span className="ml-2 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 bg-[#DA9E3E] text-white text-[10px] font-semibold rounded-full">
                {counts[k.id]}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-16 text-[#666666]">Loading queue…</div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-[#666666]">
          <Inbox size={32} strokeWidth={1.5} className="mb-3" />
          <div className="font-display text-xl">Nothing to review here.</div>
          <div className="text-xs mt-1">All {active} are up to date.</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4" data-testid="moderation-items">
          {items.map((item) => {
            const idKey = KINDS.find((k) => k.id === active).idKey;
            const id = item[idKey];
            const isBusy = busyId === id;
            const isRejecting = rejecting?.id === id;
            return (
              <article
                key={id}
                className="bg-white border border-[#EDE5DB] p-5 flex flex-col md:flex-row gap-5"
                data-testid={`mod-item-${id}`}
              >
                {/* Thumb */}
                <div className="w-full md:w-44 h-32 bg-[#F5EDE8] flex items-center justify-center text-xs text-[#666666] shrink-0 overflow-hidden">
                  {active === "listings" && item.photos?.[0] && (
                    <img src={item.photos[0]} alt="" className="w-full h-full object-cover" />
                  )}
                  {active === "projects" && item.banner_image && (
                    <img src={item.banner_image} alt="" className="w-full h-full object-cover" />
                  )}
                  {!item.photos?.[0] && !item.banner_image && "No image"}
                </div>

                {/* Detail */}
                <div className="flex-1 min-w-0">
                  <div className="label-eyebrow mb-1 text-[#DA9E3E]">
                    {active === "listings" && `${item.kind} · ${item.property_type}`}
                    {active === "projects" && (item.builder_name || "Builder")}
                    {active === "localities" && `${item.city || "—"}`}
                  </div>
                  <h3 className="font-display text-xl mb-1 truncate">
                    {item.title || item.name}
                  </h3>
                  <div className="text-xs text-[#333333] mb-3">
                    {item.locality && <span>{item.locality}</span>}
                    {item.bedrooms && <span> · {item.bedrooms} BHK</span>}
                    {item.area_sqft && <span> · {item.area_sqft} sqft</span>}
                    {item.price && <span> · {formatINR(item.price)}</span>}
                    {item.price_min && <span> · from {formatINR(item.price_min)}</span>}
                  </div>
                  {item.description && (
                    <p className="text-sm text-[#0C1D42] line-clamp-2 mb-3">{item.description}</p>
                  )}
                  <div className="text-[10px] tracking-widest uppercase text-[#666666]">
                    Submitted {item.created_at ? new Date(item.created_at).toLocaleString() : "—"}
                  </div>

                  {isRejecting ? (
                    <div className="mt-4 space-y-2">
                      <textarea
                        autoFocus
                        rows={2}
                        placeholder="Reason for rejection (optional but recommended)"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        className="w-full border border-[#EDE5DB] focus:border-[#9B4A3A] outline-none px-3 py-2 text-sm"
                        data-testid="reject-reason"
                      />
                      <div className="flex gap-2">
                        <button
                          disabled={isBusy}
                          onClick={() => moderate(active, id, "reject", reason)}
                          className="bg-[#9B4A3A] hover:bg-[#7F3A2D] text-white text-xs tracking-widest uppercase px-4 py-2 disabled:opacity-60"
                          data-testid="confirm-reject"
                        >
                          Confirm Reject
                        </button>
                        <button
                          onClick={() => { setRejecting(null); setReason(""); }}
                          className="border border-[#EDE5DB] text-xs tracking-widest uppercase px-4 py-2"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 flex gap-2">
                      <button
                        disabled={isBusy}
                        onClick={() => moderate(active, id, "approve")}
                        className="inline-flex items-center gap-1.5 bg-[#0C1D42] hover:bg-[#053220] text-white text-xs tracking-widest uppercase px-4 py-2 disabled:opacity-60"
                        data-testid={`approve-${id}`}
                      >
                        <CheckCircle2 size={14} /> Approve
                      </button>
                      <button
                        disabled={isBusy}
                        onClick={() => { setRejecting({ kind: active, id }); setReason(""); }}
                        className="inline-flex items-center gap-1.5 border border-[#9B4A3A] text-[#9B4A3A] hover:bg-[#9B4A3A] hover:text-white text-xs tracking-widest uppercase px-4 py-2 disabled:opacity-60 transition-colors"
                        data-testid={`reject-${id}`}
                      >
                        <XCircle size={14} /> Reject
                      </button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
