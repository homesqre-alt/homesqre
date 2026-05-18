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
 * Sticky bottom inquiry bar for project microsites and property detail pages.
 * - Hidden initially.
 * - Slides up from the bottom after the user scrolls past ~200px.
 * - "Enquire Now" opens a dialog with the full InquiryForm.
 * - Works on mobile + desktop.
 *
 * Props:
 *   - title:   string shown in the bar (e.g. project name or listing title)
 *   - subtitle: string shown above the title (e.g. builder name or locality)
 *   - price:   number — starting price, formatted as INR (Lakhs/Cr)
 *   - priceLabel: string (defaults to "Starting from")
 *   - project_id / listing_id: which entity the inquiry links to (pass one)
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

  return (
    <>
      <div
        className={`fixed bottom-0 inset-x-0 z-40 bg-[#06402B] text-[#FAF9F6] border-t border-[#B68D40]/40 shadow-[0_-12px_40px_-12px_rgba(0,0,0,0.4)] transition-transform duration-300 ${
          show ? "translate-y-0" : "translate-y-full"
        }`}
        data-testid="sticky-inquiry-bar"
      >
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-12 py-3 flex items-center justify-between gap-3 sm:gap-6">
          <div className="min-w-0 flex-1">
            {subtitle && (
              <div className="text-[9px] sm:text-[10px] tracking-widest uppercase text-[#B68D40] truncate">
                {subtitle}
              </div>
            )}
            <div className="font-display text-base sm:text-xl truncate leading-tight">
              {title}
            </div>
          </div>

          <div className="hidden sm:block text-right shrink-0">
            <div className="text-[10px] tracking-widest uppercase text-[#B68D40]">
              {priceLabel}
            </div>
            <div className="font-display text-xl leading-tight">{formatINR(price)}</div>
          </div>

          <button
            onClick={() => setOpen(true)}
            className="shrink-0 bg-[#B68D40] hover:bg-[#947230] text-white px-4 sm:px-7 py-3 text-[11px] sm:text-xs tracking-widest uppercase font-semibold transition-colors"
            data-testid="sticky-enquire-btn"
          >
            Enquire&nbsp;Now
          </button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md bg-[#FAF9F6] p-0 border-0">
          <DialogTitle className="sr-only">Enquire about {title}</DialogTitle>
          <DialogDescription className="sr-only">
            Send your contact details to the owner of {title}
          </DialogDescription>
          <div className="p-4">
            <InquiryForm
              project_id={project_id}
              listing_id={listing_id}
              title={`Enquire about ${title}`}
              compact
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
