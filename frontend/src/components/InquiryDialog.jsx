import { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { MessageCircle, X, Send } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const STATUSES = ["new", "contacted", "no-response", "follow-up", "converted", "closed", "not-interested"];

export default function InquiryDialog({ inquiry, open, onOpenChange, onChanged }) {
  const [msg, setMsg] = useState("");
  const [note, setNote] = useState("");
  const [followup, setFollowup] = useState("");
  const [data, setData] = useState(inquiry);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setData(inquiry); }, [inquiry]);

  if (!data) return null;

  const refresh = async () => {
    try {
      const { data: list } = await api.get("/inquiries");
      const fresh = list.find((i) => i.inquiry_id === data.inquiry_id);
      if (fresh) setData(fresh);
      onChanged && onChanged();
    } catch (err) {
      console.warn("Inquiry refresh failed:", err?.message || err);
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!msg.trim()) return;
    setBusy(true);
    try {
      await api.put(`/inquiries/${data.inquiry_id}`, { message: msg });
      setMsg("");
      await refresh();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setBusy(false); }
  };

  const addNote = async () => {
    if (!note.trim()) return;
    try {
      await api.put(`/inquiries/${data.inquiry_id}`, { note });
      setNote("");
      await refresh();
      toast.success("Note added");
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const setStatus = async (status) => {
    try {
      await api.put(`/inquiries/${data.inquiry_id}`, { status });
      await refresh();
      toast.success("Status updated");
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const saveFollowup = async () => {
    try {
      await api.put(`/inquiries/${data.inquiry_id}`, { next_followup: followup });
      await refresh();
      toast.success("Follow-up set");
    } catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl bg-[#FAF9F6] p-0 max-h-[90vh]">
        <DialogHeader className="p-6 pb-4 border-b border-[#E8E4D9]">
          <DialogTitle className="font-display text-2xl flex items-center justify-between">
            <span>{data.name}</span>
            <button onClick={() => onOpenChange(false)} className="text-[#9B4A3A]"><X size={18} /></button>
          </DialogTitle>
          <DialogDescription className="sr-only">Inquiry conversation, notes and status</DialogDescription>
          <div className="text-sm text-[#4A5D54] mt-1">{data.mobile} · {data.email || "—"}</div>
          <div className="text-xs text-[#758A80] mt-1">For: {data.target_title}</div>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-0 max-h-[70vh] overflow-hidden">
          {/* Left: details + status */}
          <div className="md:col-span-1 p-6 border-r border-[#E8E4D9] overflow-auto">
            <div className="label-eyebrow mb-2">Status</div>
            <select
              value={data.status}
              onChange={(e) => setStatus(e.target.value)}
              className="hs-input mb-6"
              data-testid="inq-status-select"
            >
              {STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>

            <div className="label-eyebrow mb-2">Next follow-up</div>
            <input
              type="datetime-local"
              value={followup || data.next_followup || ""}
              onChange={(e) => setFollowup(e.target.value)}
              className="hs-input"
            />
            <button onClick={saveFollowup} className="text-xs underline mt-2 text-[#06402B]" data-testid="inq-set-followup">
              Save follow-up
            </button>

            <div className="label-eyebrow mt-8 mb-2">Initial message</div>
            <p className="text-sm text-[#1A2421] leading-relaxed bg-white border border-[#E8E4D9] p-3">
              {data.message || "—"}
            </p>

            <div className="label-eyebrow mt-8 mb-2">Notes</div>
            <div className="space-y-2 mb-3 max-h-40 overflow-auto">
              {(data.notes || []).map((n) => (
                <div key={n.at} className="text-xs bg-white border border-[#E8E4D9] p-2">
                  <div>{n.text}</div>
                  <div className="text-[#758A80] mt-1">{new Date(n.at).toLocaleString()}</div>
                </div>
              ))}
              {(!data.notes || data.notes.length === 0) && (
                <div className="text-xs text-[#758A80]">No notes yet.</div>
              )}
            </div>
            <textarea
              className="hs-input min-h-[60px] resize-none"
              placeholder="Add a private note…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              data-testid="inq-note-input"
            />
            <button onClick={addNote} className="text-xs underline mt-1 text-[#06402B]" data-testid="inq-add-note">
              Add note
            </button>
          </div>

          {/* Right: chat */}
          <div className="md:col-span-2 flex flex-col">
            <div className="p-4 border-b border-[#E8E4D9] flex items-center gap-2">
              <MessageCircle size={16} className="text-[#06402B]" />
              <span className="label-eyebrow">Conversation</span>
            </div>
            <div className="flex-1 overflow-auto p-6 space-y-3 bg-[#FAF9F6] min-h-[300px]">
              {(data.messages || []).map((m) => (
                <div key={m.at} className="bg-[#06402B] text-[#FAF9F6] p-3 max-w-[80%] ml-auto">
                  <div className="text-sm">{m.text}</div>
                  <div className="text-[10px] text-[#FAF9F6]/60 mt-1 text-right">
                    {new Date(m.at).toLocaleString()}
                  </div>
                </div>
              ))}
              {(!data.messages || data.messages.length === 0) && (
                <div className="text-center text-[#758A80] text-sm py-12">
                  Start the conversation. Messages here are stored on the inquiry thread.
                </div>
              )}
            </div>
            <form onSubmit={sendMessage} className="p-4 border-t border-[#E8E4D9] flex gap-2" data-testid="inq-chat-form">
              <input
                value={msg}
                onChange={(e) => setMsg(e.target.value)}
                placeholder="Type a message…"
                className="hs-input flex-1"
                data-testid="inq-chat-input"
              />
              <button disabled={busy} className="btn-primary" data-testid="inq-chat-send">
                <Send size={14} />
              </button>
            </form>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
