"""Quotation engine — Admin drafts itemized execution quotes; customers
review, approve, and pay the booking advance online."""
import uuid
from typing import List, Optional

from fastapi import Depends, HTTPException

from core import api, db, iso, now_utc, current_user, require_role, clean_doc
from crm_helpers import _user_identifier


# ---------------------------------------------------------------------------
# Schemas (inline — lightweight so we don't need a separate schema file)
# ---------------------------------------------------------------------------
from pydantic import BaseModel

class QuotationMilestone(BaseModel):
    name: str              # e.g., "50% Booking Advance"
    amount: float          # e.g., 500000
    tentative_date: str    # e.g., "2026-06-15"

class QuotationCreateRequest(BaseModel):
    total_amount: float
    pdf_url: str
    milestones: List[QuotationMilestone]
    notes: Optional[str] = None

class QuotationPaymentRequest(BaseModel):
    milestone_id: str


# ---------------------------------------------------------------------------
# Admin: Create / upload a quotation for a project
# ---------------------------------------------------------------------------
@api.post("/admin/quotations/{project_id}")
async def create_quotation(
    project_id: str,
    body: QuotationCreateRequest,
    user: dict = Depends(require_role("admin")),
):
    """Admin drafts an itemized execution quotation for an approved design project."""
    project = await db.design_projects.find_one({"project_id": project_id})
    if not project:
        raise HTTPException(status_code=404, detail="Design project not found")
    if project.get("status") != "ready_for_quotation":
        raise HTTPException(
            status_code=400,
            detail="Quotation can only be created for projects in 'ready_for_quotation' state"
        )

    total_amount = body.total_amount
    quot_id = f"quot_{uuid.uuid4().hex[:10]}"
    
    # Calculate previously paid amount to deduct from the first milestone
    customer_user = await db.users.find_one({"user_id": project["user_id"]})
    prev_paid = customer_user.get("invoice_paid", 0)
    pkg_adj = customer_user.get("package_adjustment", {})
    if pkg_adj and pkg_adj.get("differential_amount"):
        prev_paid += pkg_adj.get("differential_amount", 0)

    db_milestones = []
    for idx, ms in enumerate(body.milestones):
        ms_doc = {
            "id": f"ms_{uuid.uuid4().hex[:8]}",
            "name": ms.name,
            "original_amount": ms.amount,
            "amount": ms.amount,
            "tentative_date": ms.tentative_date,
            "status": "unlocked" if idx == 0 else "locked"
        }
        if idx == 0:
            ms_doc["amount"] = max(0, ms.amount - prev_paid)
            ms_doc["deducted_prev_payments"] = prev_paid
        db_milestones.append(ms_doc)

    rec = {
        "quotation_id": quot_id,
        "project_id": project_id,
        "user_id": project["user_id"],
        "lead_id": project.get("lead_id"),
        "total_amount": total_amount,
        "pdf_url": body.pdf_url,
        "milestones": db_milestones,
        "notes": body.notes,
        "status": "pending_customer_approval",
        "created_by": _user_identifier(user),
        "created_at": iso(now_utc()),
        "updated_at": iso(now_utc()),
    }
    await db.quotations.insert_one(rec)
    # Notify on the lead
    if project.get("lead_id"):
        await db.leads.update_one(
            {"lead_id": project["lead_id"]},
            {"$push": {"comments": {
                "id": f"c_quot_{quot_id[:8]}",
                "by": _user_identifier(user),
                "by_name": user.get("name") or "Admin",
                "text": f"Execution quotation compiled. Total: \u20b9{total_amount:,.0f}. Awaiting customer approval.",
                "at": iso(now_utc()),
            }},
            "$set": {"updated_at": iso(now_utc())}}
        )
    clean_doc(rec)
    return {"ok": True, "quotation_id": quot_id, "total_amount": total_amount}


@api.get("/admin/quotations")
async def list_all_quotations(user: dict = Depends(require_role("admin"))):
    """List all quotations for admin overview."""
    items = await db.quotations.find({}, {"_id": 0}).sort([("created_at", -1)]).to_list(500)
    return items


# ---------------------------------------------------------------------------
# Customer: Fetch their active quotation
# ---------------------------------------------------------------------------
@api.get("/design/my-project/quotation")
async def get_my_quotation(user: dict = Depends(current_user)):
    """Returns the active quotation for the customer's current design project."""
    project = await db.design_projects.find_one(
        {"user_id": user["user_id"]},
        sort=[("created_at", -1)]
    )
    if not project:
        return None
    quotation = await db.quotations.find_one(
        {"project_id": project["project_id"]},
        {"_id": 0},
        sort=[("created_at", -1)]
    )
    return quotation


# ---------------------------------------------------------------------------
# Customer: Pay the booking advance (mocked — Razorpay integrates here)
# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# Admin: Trigger a milestone payment
# ---------------------------------------------------------------------------
@api.put("/admin/quotations/{quotation_id}/milestones/{milestone_id}/trigger")
async def trigger_quotation_milestone(
    quotation_id: str, 
    milestone_id: str,
    user: dict = Depends(require_role("admin"))
):
    """Admin triggers a milestone, making it unlocked and visible for the customer to pay."""
    quotation = await db.quotations.find_one({"quotation_id": quotation_id})
    if not quotation:
        raise HTTPException(status_code=404, detail="Quotation not found")
        
    milestone_idx = next((i for i, m in enumerate(quotation["milestones"]) if m["id"] == milestone_id), None)
    if milestone_idx is None:
        raise HTTPException(status_code=404, detail="Milestone not found")
        
    milestone = quotation["milestones"][milestone_idx]
    if milestone["status"] != "locked":
        raise HTTPException(status_code=400, detail=f"Cannot trigger milestone because its status is {milestone['status']}")

    await db.quotations.update_one(
        {"quotation_id": quotation_id},
        {"$set": {
            f"milestones.{milestone_idx}.status": "unlocked",
            "updated_at": iso(now_utc())
        }}
    )
    
    # Notify on the lead
    if quotation.get("lead_id"):
        await db.leads.update_one(
            {"lead_id": quotation["lead_id"]},
            {"$push": {"comments": {
                "id": f"c_trig_{uuid.uuid4().hex[:8]}",
                "by": _user_identifier(user),
                "by_name": user.get("name") or "Admin",
                "text": f"Triggered payment milestone: {milestone['name']} (\u20b9{milestone['amount']:,.0f}). Now visible to customer.",
                "at": iso(now_utc()),
            }},
            "$set": {"updated_at": iso(now_utc())}}
        )
        
    return {"ok": True, "message": "Milestone unlocked"}
