import { useState, useEffect } from "react";
import InquiryForm from "@/components/InquiryForm";
import { formatINR } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

/**
 * Persistent inquiry CTA for project microsites and property detail pages.
 * - Desktop (lg+): full inquiry form fixed to the right side, fades in after first scroll.
 * - Mobile (<lg): sticky bottom bar with "Enquire" button → opens form in a modal.
 *
 * Props:
 *   - title:   shown in the bar (e.g. project name or listing title)
 *   - subtitle: shown above the title (e.g. builder name or locality)
 *   - price:   number — formatted as INR (Lakhs/Cr)
 *   - priceLabel: defaults to "Starting from"
 *   - project_id / listing_id: one of these is passed to InquiryForm
 */
export default function StickyInquiryBar({
  title,
  subtitle = "",
  price,
  priceLabel = "Starting from",
  project_id,
  listing_id,
}) {
  const [show, setShow] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = () => setShow(window.scrollY > 200);
    handler();
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  const formTitle = title ? `Enquire about ${title}` : "Get in touch";

  return (
    <>
      {/* Desktop — full inquiry form fixed to right side */}
      <aside
        className={`hidden lg:block fixed z-40 top-24 right-6 w-[360px] max-h-[calc(100vh-7rem)] overflow-auto bg-white border border-[#E8E4D9] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.25)] transition-all duration-300 ${
          show
            ? "opacity-100 translate-x-0 pointer-events-auto"
            : "opacity-0 translate-x-8 pointer-events-none"
        }`}
        data-testid="sticky-inquiry-side"
        aria-label="Inquiry form"
      >
        <InquiryForm
          project_id={project_id}
          listing_id={listing_id}
          title={formTitle}
          compact
        />
      </aside>

      {/* Mobile — bottom bar opens modal */}
      <div
        className={`lg:hidden fixed bottom-0 inset-x-0 z-40 bg-[#06402B] text-[#FAF9F6] border-t border-[#B68D40]/40 shadow-[0_-12px_40px_-12px_rgba(0,0,0,0.4)] transition-transform duration-300 ${
          show ? "translate-y-0" : "translate-y-full"
        }`}
        data-testid="sticky-inquiry-bar"
      >
        <div className="px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            {subtitle && (
              <div className="text-[9px] tracking-widest uppercase text-[#B68D40] truncate">
                {subtitle}
              </div>
            )}
            <div className="font-display text-base truncate leading-tight">
              {title}
            </div>
            <div className="text-[10px] tracking-widest uppercase text-[#B68D40] mt-0.5">
              {priceLabel} · {formatINR(price)}
            </div>
          </div>
          <button
            onClick={() => setOpen(true)}
            className="shrink-0 bg-[#B68D40] hover:bg-[#947230] text-white px-5 py-3 text-[11px] tracking-widest uppercase font-semibold transition-colors"
            data-testid="sticky-enquire-btn"
          >
            Enquire
          </button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md bg-[#FAF9F6] p-0 border-0">
          <DialogTitle className="sr-only">{formTitle}</DialogTitle>
          <DialogDescription className="sr-only">
            Send your contact details to the owner
          </DialogDescription>
          <div className="p-4">
            <InquiryForm
              project_id={project_id}
              listing_id={listing_id}
              title={formTitle}
              compact
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
