"""Customer-facing /me/* routes — phase transitions, site visit, package
adjustment payment, and profile update."""
from fastapi import Depends, HTTPException
from typing import Optional

from core import api, db, iso, now_utc, current_user
from design_helpers import ensure_design_project
from schemas import (
    PhaseUpdateRequest, PhaseUpdateOut,
    SiteVisitRequest, SiteVisitOut,
    PackageAdjustmentOut,
    MobileOtpRequest, MobileUpdateRequest, PasswordUpdateRequest, OkResponse
)
from pydantic import BaseModel
import secrets
import bcrypt
from datetime import timedelta


class ProfileUpdateRequest(BaseModel):
    name: Optional[str] = None
    mobile: Optional[str] = None
    city: Optional[str] = None
    locality: Optional[str] = None
    property_type: Optional[str] = None
    # email update not allowed — contact support


@api.put("/me/profile")
async def update_my_profile(body: ProfileUpdateRequest, user: dict = Depends(current_user)):
    """Update customer profile fields and mark profile as completed."""
    updates: dict = {"profile_completed": True}
    if body.name is not None:
        updates["name"] = body.name.strip()
    if body.mobile is not None:
        updates["mobile"] = body.mobile.strip()
    if body.city is not None:
        updates["city"] = body.city.strip()
    if body.locality is not None:
        updates["locality"] = body.locality.strip()
    if body.property_type is not None:
        updates["property_type"] = body.property_type.strip()

    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": updates}
    )
    updated = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return updated


# Client-initiated phase transitions (e.g. "unpaid" → "briefing" after payment).
# Backend-driven transitions (verification → designing) happen via the admin
# moderation endpoint and are intentionally NOT permitted here.
ALLOWED_PHASE_TRANSITIONS = {
    "unpaid": {"briefing"},
}


@api.put("/me/phase", response_model=PhaseUpdateOut)
async def update_my_phase(body: PhaseUpdateRequest, user: dict = Depends(current_user)):
    target = (body.phase or "").strip()
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


@api.put("/me/site-visit", response_model=SiteVisitOut)
async def schedule_site_visit(body: SiteVisitRequest, user: dict = Depends(current_user)):
    """Customer confirms the site-visit date/time after their floor plan is
    approved. Stored on the user record; admin sees it on the design project /
    verifications view."""
    when = (body.site_visit_at or "").strip() or None
    if when is None:
        raise HTTPException(status_code=400, detail="site_visit_at is required")
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"site_visit_at": when, "site_visit_booked_at": iso(now_utc())}}
    )
    return {"ok": True, "site_visit_at": when}


@api.post("/me/pay-package-adjustment", response_model=PackageAdjustmentOut)
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
    final_invoice = int(ver.get("invoice_paid") or 0) + int(adj.get("differential_amount") or 0)
    await db.verifications.update_one(
        {"verification_id": ver_id},
        {"$set": {
            "status": "package_adjusted_paid",
            "differential_paid_at": iso(now_utc()),
            "final_invoice": final_invoice,
        }}
    )
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"project_phase": "designing"},
         "$unset": {"package_adjustment": ""}}
    )
    await ensure_design_project(user["user_id"], verification_id=ver_id)
    return {"ok": True, "final_invoice": final_invoice}


@api.post("/me/mobile-otp", response_model=OkResponse)
async def request_mobile_otp(body: MobileOtpRequest, user: dict = Depends(current_user)):
    """Generate and store an OTP for the user to verify a new mobile number."""
    otp = f"{secrets.randbelow(900000) + 100000}"
    mobile = body.mobile.strip()
    if not mobile:
        raise HTTPException(status_code=400, detail="Mobile number is required")
        
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {
            "pending_mobile": mobile,
            "mobile_otp": otp,
            "mobile_otp_expires_at": iso(now_utc() + timedelta(minutes=10))
        }}
    )
    # TODO: In production, trigger an SMS to the user via MSG91, Twilio, etc.
    return {"ok": True}


@api.put("/me/mobile", response_model=OkResponse)
async def verify_and_update_mobile(body: MobileUpdateRequest, user: dict = Depends(current_user)):
    """Verify the OTP and update the user's mobile number."""
    mobile = body.mobile.strip()
    db_user = await db.users.find_one({"user_id": user["user_id"]})
    
    if not db_user or db_user.get("pending_mobile") != mobile:
        raise HTTPException(status_code=400, detail="No pending mobile update for this number")
        
    exp = db_user.get("mobile_otp_expires_at")
    if not exp or iso(now_utc()) > exp:
        raise HTTPException(status_code=400, detail="OTP expired")
        
    if db_user.get("mobile_otp") != body.otp:
        raise HTTPException(status_code=400, detail="Invalid OTP")
        
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"mobile": mobile},
         "$unset": {"pending_mobile": "", "mobile_otp": "", "mobile_otp_expires_at": ""}}
    )
    return {"ok": True}


@api.put("/me/password", response_model=OkResponse)
async def update_password(body: PasswordUpdateRequest, user: dict = Depends(current_user)):
    """Update user password from profile dashboard."""
    db_user = await db.users.find_one({"user_id": user["user_id"]})
    if not db_user or not db_user.get("password_hash"):
        raise HTTPException(status_code=400, detail="Cannot change password for this account type (e.g. Google auth)")
        
    # Verify old password
    try:
        valid = bcrypt.checkpw(body.old_password.encode(), db_user["password_hash"].encode())
    except Exception:
        valid = False
        
    if not valid:
        raise HTTPException(status_code=400, detail="Incorrect current password")
        
    # Hash new password
    hashed = bcrypt.hashpw(body.new_password.encode(), bcrypt.gensalt()).decode()
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"password_hash": hashed}}
    )
    return {"ok": True}

