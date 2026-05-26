"""Customer-facing /me/* routes — phase transitions, site visit, package
adjustment payment."""
from fastapi import Depends, HTTPException

from core import api, db, iso, now_utc, current_user
from design_helpers import ensure_design_project


# Client-initiated phase transitions (e.g. "unpaid" → "briefing" after payment).
# Backend-driven transitions (verification → designing) happen via the admin
# moderation endpoint and are intentionally NOT permitted here.
ALLOWED_PHASE_TRANSITIONS = {
    "unpaid": {"briefing"},
}


@api.put("/me/phase")
async def update_my_phase(payload: dict, user: dict = Depends(current_user)):
    target = (payload.get("phase") or "").strip()
    current = (user.get("project_phase") or "unpaid")
    allowed_next = ALLOWED_PHASE_TRANSITIONS.get(current, set())
    if target not in allowed_next:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot transition from '{current}' to '{target}'"
        )
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"project_phase": target, "phase_updated_at": iso(now_utc())}}
    )
    return {"ok": True, "project_phase": target}


@api.put("/me/site-visit")
async def schedule_site_visit(payload: dict, user: dict = Depends(current_user)):
    """Customer confirms the site-visit date/time after their floor plan is
    approved. Stored on the user record; admin sees it on the design project /
    verifications view."""
    when = (payload.get("site_visit_at") or "").strip() or None
    if when is None:
        raise HTTPException(status_code=400, detail="site_visit_at is required")
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"site_visit_at": when, "site_visit_booked_at": iso(now_utc())}}
    )
    return {"ok": True, "site_visit_at": when}


@api.post("/me/pay-package-adjustment")
async def pay_package_adjustment(user: dict = Depends(current_user)):
    """Customer-facing payment endpoint for the package-mismatch differential.
    On success: marks the verification as paid and advances phase to 'designing'.
    NOTE: real payment integration (Razorpay) will replace this stub by calling
    the same logic from the payment-success webhook. The differential AMOUNT is
    canonical from the verification record — it cannot be tampered with by the
    client."""
    adj = user.get("package_adjustment")
    if not adj or not adj.get("verification_id"):
        raise HTTPException(status_code=400, detail="No pending package adjustment")
    ver_id = adj["verification_id"]
    ver = await db.verifications.find_one({"verification_id": ver_id})
    if not ver or ver.get("status") != "package_mismatch":
        raise HTTPException(status_code=400, detail="Verification is not in package_mismatch state")
    await db.verifications.update_one(
        {"verification_id": ver_id},
        {"$set": {
            "status": "package_adjusted_paid",
            "differential_paid_at": iso(now_utc()),
            "final_invoice": int(ver.get("invoice_paid") or 0) + int(adj.get("differential_amount") or 0),
        }}
    )
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"project_phase": "designing"},
         "$unset": {"package_adjustment": ""}}
    )
    await ensure_design_project(user["user_id"], verification_id=ver_id)
    return {"ok": True, "final_invoice": int(ver.get("invoice_paid") or 0) + int(adj.get("differential_amount") or 0)}
