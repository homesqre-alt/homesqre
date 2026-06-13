"""Floor-plan verifications + package pricing + admin moderation."""
import uuid
from typing import List, Dict

"""Floor-plan verifications + package pricing + admin moderation."""
import uuid
from typing import List, Dict

from fastapi import Depends, HTTPException

from core import (
    api, db, iso, now_utc, clean_doc,
    current_user, require_role,
)
from packages import calculate_package_price
from crm_helpers import _user_identifier, sync_lead_status
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
    
    # Sync CRM Lead Status instantly
    if user.get("lead_id"):
        await sync_lead_status(user["lead_id"], "verification", "Customer uploaded floor plan")
        
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
    user: dict = Depends(require_role("admin", "sales", "designer")),
):
    """Assign Package -> Sales assigns the package + custom discount.
    """
    action = body.action
    ver = await db.verifications.find_one({"verification_id": ver_id})
    if not ver:
        raise HTTPException(status_code=404, detail="Verification not found")

    if action == "assign_package":
        assigned_pt = (body.corrected_property_type or "").strip()
        assigned_spec = body.corrected_bhk_or_units
        if not assigned_pt or assigned_spec in (None, ""):
            raise HTTPException(status_code=400, detail="property_type and bhk_or_units are required")
        base_price = calculate_package_price(assigned_pt, assigned_spec)
        if base_price <= 0:
            raise HTTPException(status_code=400, detail="Unknown package combination")

        discount_amount = getattr(body, "discount_amount", 0) or 0
        discount_expiry_hours = getattr(body, "discount_expiry_hours", 24) or 24
        final_price = max(0, base_price - discount_amount)

        # Update verification record
        update = {
            "status": "package_assigned",
            "assigned_property_type": assigned_pt,
            "assigned_bhk_or_units": str(assigned_spec),
            "base_price": base_price,
            "discount_amount": discount_amount,
            "final_price": final_price,
            "moderated_by": _user_identifier(user),
            "moderated_at": iso(now_utc()),
        }
        await db.verifications.update_one({"verification_id": ver_id}, {"$set": update})

        # Calculate expiry time
        import datetime
        expiry_time = now_utc() + datetime.timedelta(hours=float(discount_expiry_hours))

        # Update user profile to pending_payment
        await db.users.update_one(
            {"user_id": ver["user_id"]},
            {"$set": {
                "project_phase": "pending_payment",
                "assigned_package": {
                    "property_type": assigned_pt,
                    "bhk_or_units": str(assigned_spec),
                    "base_price": base_price,
                    "discount_amount": discount_amount,
                    "final_price": final_price,
                    "expiry_time": iso(expiry_time)
                }
            }}
        )
        
        # Sync CRM Lead Status instantly
        u_doc = await db.users.find_one({"user_id": ver["user_id"]}, {"lead_id": 1})
        if u_doc and u_doc.get("lead_id"):
            await sync_lead_status(u_doc["lead_id"], "pending_payment", "Package assigned by Sales")
            
        return {"ok": True}

    raise HTTPException(status_code=400, detail=f"Unknown action: {action}")

@api.post("/verifications/latest/floor-plan")
async def reupload_floor_plan(body: VerificationCreateRequest, user: dict = Depends(current_user)):
    """Customer 'Replace' flow: clears assigned package and moves back to verification."""
    pdf_urls = [u for u in (body.pdf_urls or []) if u]
    if not pdf_urls and body.pdf_url:
        pdf_urls = [body.pdf_url]
    if not pdf_urls:
        raise HTTPException(status_code=400, detail="Floor plan URLs are required")
        
    # Find their latest verification
    ver = await db.verifications.find_one(
        {"user_id": user["user_id"]}, 
        sort=[("created_at", -1)]
    )
    if not ver:
        raise HTTPException(status_code=404, detail="No verification found to update")
        
    # Update verification document
    await db.verifications.update_one(
        {"_id": ver["_id"]},
        {"$set": {
            "pdf_urls": pdf_urls,
            "pdf_url": pdf_urls[0],
            "status": "pending",
            "updated_at": iso(now_utc())
        }}
    )
    
    # Revert user to verification phase and clear assignments
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {
            "$set": {"project_phase": "verification"},
            "$unset": {"assigned_package": "", "deficit_due": ""}
        }
    )
    
    # Sync CRM lead status
    if user.get("lead_id"):
        await sync_lead_status(user["lead_id"], "verification", "Customer re-uploaded floor plan, package assignment cleared")
        
    return {"ok": True, "reverted_to_briefing": True}
