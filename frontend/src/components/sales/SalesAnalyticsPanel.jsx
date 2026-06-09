import { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

/**
 * SalesAnalyticsPanel — personal performance dashboard for a logged-in sales rep.
 * Shows: total leads assigned, converted, conversion rate, today's follow-ups,
 * missed calls, overdue follow-ups, and a 14-day activity chart.
 */
export default function SalesAnalyticsPanel() {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data: d } = await api.get("/sales/analytics");
        setData(d);
      } catch (err) {
        // Silently fail — don't block the pipeline view
        console.warn("Sales analytics failed:", formatApiError(err));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return (
    <div className="bg-white border border-[#E8E4D9] px-5 py-3 mb-6 flex items-center gap-3">
      <div className="w-4 h-4 border-2 border-[#0C1D42] border-t-transparent rounded-full animate-spin" />
      <span className="text-xs text-[#333333]">Loading your performance data…</span>
    </div>
  );
  if (!data) return null;

  const stats = [
    { label: "My Leads", value: data.my_total ?? 0, accent: "#0C1D42" },
    { label: "Converted", value: data.my_converted ?? 0, accent: "#0C1D42" },
    { label: "Conv. Rate", value: `${data.my_conversion_rate ?? 0}%`, accent: data.my_conversion_rate >= 10 ? "#0C1D42" : "#DA9E3E" },
    { label: "Follow-ups Today", value: data.my_followups_today ?? 0, accent: "#DA9E3E" },
    { label: "Missed Calls", value: data.my_missed_calls ?? 0, accent: data.my_missed_calls > 0 ? "#B53A3A" : "#333333" },
    { label: "Overdue F/U", value: data.my_overdue ?? 0, accent: data.my_overdue > 0 ? "#D4885A" : "#333333" },
  ];

  return (
    <div className="border border-[#E8E4D9] bg-white mb-6 overflow-hidden">
      {/* Header toggle */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3 bg-[#F3F0E9] hover:bg-[#ECE8DC] transition"
      >
        <span className="text-xs font-bold uppercase tracking-widest text-[#0C1D42]">
          📊 My Performance Dashboard
        </span>
        <span className="text-[#0C1D42] text-sm font-bold">{open ? "▲ Hide" : "▼ Show"}</span>
      </button>

      {open && (
        <div className="p-5 space-y-5">
          {/* KPI cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {stats.map(s => (
              <div key={s.label} className="border border-[#E8E4D9] p-3 text-center">
                <p className="text-[10px] uppercase tracking-widest text-[#333333] mb-1">{s.label}</p>
                <p className="font-display text-xl font-bold" style={{ color: s.accent }}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Alerts */}
          <div className="flex flex-wrap gap-3">
            {data.my_missed_calls > 0 && (
              <div className="flex-1 min-w-48 bg-red-50 border border-red-200 rounded px-4 py-2 flex items-center gap-2">
                <span className="text-red-500">📞</span>
                <p className="text-xs text-red-700 font-medium">
                  You have <strong>{data.my_missed_calls}</strong> missed call{data.my_missed_calls > 1 ? "s" : ""} — contact them ASAP!
                </p>
              </div>
            )}
            {data.my_overdue > 0 && (
              <div className="flex-1 min-w-48 bg-orange-50 border border-orange-200 rounded px-4 py-2 flex items-center gap-2">
                <span className="text-orange-500">⏰</span>
                <p className="text-xs text-orange-700 font-medium">
                  <strong>{data.my_overdue}</strong> follow-up{data.my_overdue > 1 ? "s are" : " is"} overdue — act now!
                </p>
              </div>
            )}
            {data.my_followups_today > 0 && (
              <div className="flex-1 min-w-48 bg-amber-50 border border-amber-200 rounded px-4 py-2 flex items-center gap-2">
                <span className="text-amber-500">📅</span>
                <p className="text-xs text-amber-700 font-medium">
                  <strong>{data.my_followups_today}</strong> follow-up{data.my_followups_today > 1 ? "s" : ""} scheduled for today!
                </p>
              </div>
            )}
            {data.my_missed_calls === 0 && data.my_overdue === 0 && (
              <div className="flex-1 bg-green-50 border border-green-200 rounded px-4 py-2 flex items-center gap-2">
                <span className="text-green-500">✅</span>
                <p className="text-xs text-green-700 font-medium">No missed calls or overdue follow-ups. Keep it up!</p>
              </div>
            )}
          </div>

          {/* Activity chart */}
          {(data.my_activity_by_day || []).length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-widest font-bold text-[#0C1D42] mb-2">My Activity (Last 14 Days)</p>
              <ResponsiveContainer width="100%" height={140}>
                <AreaChart data={data.my_activity_by_day} margin={{ top: 5, right: 10, left: -30, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gActivity" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0C1D42" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#0C1D42" stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8E4D9" />
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#333333" }} tickFormatter={d => d.slice(5)} />
                  <YAxis tick={{ fontSize: 9, fill: "#333333" }} allowDecimals={false} />
                  <Tooltip contentStyle={{ fontSize: 11, border: "1px solid #E8E4D9" }} />
                  <Area type="monotone" dataKey="count" stroke="#0C1D42" strokeWidth={2} fill="url(#gActivity)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
