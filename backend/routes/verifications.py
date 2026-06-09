"""Floor-plan verifications + package pricing + admin moderation."""
import uuid
from typing import List, Dict

from fastapi import Depends, HTTPException

from core import (
    api, db, iso, now_utc, clean_doc,
    current_user, require_role,
)
from packages import calculate_package_price
from crm_helpers import _user_identifier
from design_helpers import ensure_design_project
from schemas import (
    VerificationCreateRequest, VerificationOut,
    VerificationModerateRequest, VerificationModerateOut,
)


@api.post("/verifications", response_model=VerificationOut)
async def create_verification(body: VerificationCreateRequest, user: dict = Depends(current_user)):
    # Coalesce pdf_urls: prefer the explicit list, fall back to single pdf_url
    pdf_urls = [u for u in (body.pdf_urls or []) if u]
    if not pdf_urls and body.pdf_url:
        pdf_urls = [body.pdf_url]
    if not pdf_urls:
        raise HTTPException(status_code=400, detail="At least one floor plan file is required")
    project_name = (body.project_name or "").strip() or None
    ver_id = f"ver_{uuid.uuid4().hex[:10]}"
    rec = {
        "verification_id": ver_id,
        "user_id": user["user_id"],
        "project_name": project_name,
        "property_type": body.property_type,
        "bhk_or_units": body.bhk_or_units,
        "invoice_paid": body.invoice_paid,
        "pdf_url": pdf_urls[0],            # keep for legacy admin UI compatibility
        "pdf_urls": pdf_urls,
        "room_requirements": body.room_requirements,
        "status": "pending",
        "created_at": iso(now_utc()),
    }
    await db.verifications.insert_one(rec)
    user_update = {"project_phase": "verification"}
    if project_name:
        user_update["project_name"] = project_name
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": user_update})
    return clean_doc(rec)


@api.get("/admin/verifications", response_model=List[VerificationOut])
async def admin_list_verifications(user: dict = Depends(require_role("admin", "designer"))):
    items = await db.verifications.find({}, {"_id": 0}).sort([("created_at", -1)]).to_list(500)
    is_designer = user.get("role") == "designer"
    project_by_user: Dict[str, str] = {}
    async for p in db.design_projects.find({}, {"_id": 0, "user_id": 1, "project_id": 1, "status": 1}):
        if p["user_id"] not in project_by_user or p.get("status") == "in_progress":
            project_by_user[p["user_id"]] = p["project_id"]
    for v in items:
        u = await db.users.find_one(
            {"user_id": v.get("user_id")},
            {"_id": 0, "name": 1, "email": 1, "mobile": 1, "project_name": 1, "site_visit_at": 1},
        ) or {}
        if is_designer:
            v["customer"] = {"name": u.get("name"), "project_name": v.get("project_name") or u.get("project_name")}
        else:
            v["customer"] = {**u, "project_name": v.get("project_name") or u.get("project_name")}
        v["site_visit_at"] = u.get("site_visit_at")
        v["design_project_id"] = project_by_user.get(v.get("user_id"))
    return items


@api.put("/admin/verifications/{ver_id}", response_model=VerificationModerateOut)
async def admin_moderate_verification(
    ver_id: str,
    body: VerificationModerateRequest,
    user: dict = Depends(require_role("admin", "designer")),
):
    """Approve → auto-create design project + advance customer to 'designing'.
    reject_package → designer selects corrected package; backend auto-calculates
    the differential customer must pay. No manual amount input from designer.
    """
    action = body.action
    ver = await db.verifications.find_one({"verification_id": ver_id})
    if not ver:
        raise HTTPException(status_code=404, detail="Verification not found")

    if action == "approve":
        await db.verifications.update_one(
            {"verification_id": ver_id},
            {"$set": {"status": "approved", "moderated_by": _user_identifier(user),
                      "moderated_at": iso(now_utc())}}
        )
        design = await ensure_design_project(ver["user_id"], verification_id=ver_id)
        await db.users.update_one(
            {"user_id": ver["user_id"]},
            {"$set": {"project_phase": "designing", "site_visit_at": None}}
        )
        return {"ok": True, "design_project_id": design["project_id"]}

    if action == "reject_package":
        corrected_pt = (body.corrected_property_type or "").strip()
        corrected_spec = body.corrected_bhk_or_units
        if not corrected_pt or corrected_spec in (None, ""):
            raise HTTPException(status_code=400, detail="corrected_property_type and corrected_bhk_or_units are required")
        new_price = calculate_package_price(corrected_pt, corrected_spec)
        if new_price <= 0:
            raise HTTPException(status_code=400, detail="Unknown package combination")
        invoice_paid = float(ver.get("invoice_paid") or 0)
        differential = max(0, new_price - int(invoice_paid))
        update = {
            "status": "package_mismatch",
            "corrected_property_type": corrected_pt,
            "corrected_bhk_or_units": str(corrected_spec),
            "corrected_price": new_price,
            "differential_amount": differential,
            "rejection_reason": body.reason or "Floor plan did not match selected package",
            "moderated_by": _user_identifier(user),
            "moderated_at": iso(now_utc()),
        }
        await db.verifications.update_one({"verification_id": ver_id}, {"$set": update})
        if differential == 0:
            await db.verifications.update_one(
                {"verification_id": ver_id},
                {"$set": {"status": "package_adjusted_paid"}}
            )
            await db.users.update_one(
                {"user_id": ver["user_id"]},
                {"$set": {"project_phase": "designing"}}
            )
            return {"ok": True, "differential_amount": 0, "auto_approved": True}
        await db.users.update_one(
            {"user_id": ver["user_id"]},
            {"$set": {
                "project_phase": "package_adjustment",
                "package_adjustment": {
                    "verification_id": ver_id,
                    "corrected_property_type": corrected_pt,
                    "corrected_bhk_or_units": str(corrected_spec),
                    "corrected_price": new_price,
                    "invoice_paid": int(invoice_paid),
                    "differential_amount": differential,
                    "raised_at": iso(now_utc()),
                },
            }}
        )
        return {"ok": True, "differential_amount": differential, "auto_approved": False}

    if action == "reject":
        deficit_amount = body.deficit_amount or 0
        await db.verifications.update_one(
            {"verification_id": ver_id},
            {"$set": {"status": "rejected", "deficit_amount": deficit_amount}}
        )
        await db.users.update_one(
            {"user_id": ver["user_id"]},
            {"$set": {"project_phase": "unpaid", "deficit_due": deficit_amount}}
        )
        return {"ok": True}

    raise HTTPException(status_code=400, detail=f"Unknown action: {action}")

