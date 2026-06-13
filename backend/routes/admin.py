"""Admin-only routes: analytics overview + employee/department management."""
import uuid
from datetime import timedelta
from typing import List

from fastapi import Depends, HTTPException

from core import (
    api, db, iso, now_utc, hash_password,
    require_role,
)
from schemas import (
    AnalyticsOverviewOut, EmployeeOut, MessageResponse,
    EmployeeCreateRequest, EmployeeUpdateRequest,
)


# ---------------------------------------------------------------------------
# Analytics — Overview tab cards + charts
# ---------------------------------------------------------------------------
@api.get("/admin/analytics/overview", response_model=AnalyticsOverviewOut)
async def admin_analytics_overview(user: dict = Depends(require_role("admin"))):
    """Top-line metrics + chart-friendly aggregations for the admin Overview tab."""
    leads_by_status_cursor = db.leads.aggregate([
        {"$group": {"_id": "$status", "count": {"$sum": 1}}},
        {"$project": {"_id": 0, "name": "$_id", "count": 1}},
        {"$sort": {"count": -1}},
    ])
    leads_by_status = [d async for d in leads_by_status_cursor]

    leads_by_source_cursor = db.leads.aggregate([
        {"$group": {"_id": "$source", "count": {"$sum": 1}}},
        {"$project": {"_id": 0, "name": "$_id", "count": 1}},
        {"$sort": {"count": -1}},
        {"$limit": 8},
    ])
    leads_by_source = [d async for d in leads_by_source_cursor]

    today = now_utc().date()
    days = [(today - timedelta(days=i)) for i in range(13, -1, -1)]
    leads_by_day = []
    for d in days:
        start = d.isoformat()
        end = (d + timedelta(days=1)).isoformat()
        c = await db.leads.count_documents({"created_at": {"$gte": start, "$lt": end}})
        leads_by_day.append({"date": start, "count": c})

    phases_cursor = db.users.aggregate([
        {"$match": {"role": "customer"}},
        {"$group": {"_id": "$project_phase", "count": {"$sum": 1}}},
        {"$project": {"_id": 0, "name": {"$ifNull": ["$_id", "unpaid"]}, "count": 1}},
    ])
    customers_by_phase = [d async for d in phases_cursor]

    total_retainers_cursor = db.verifications.aggregate([
        {"$group": {"_id": None, "total": {"$sum": "$invoice_paid"}}},
    ])
    total_retainers_doc = await total_retainers_cursor.to_list(1)
    total_retainers = (total_retainers_doc[0]["total"] if total_retainers_doc else 0) or 0

    pending_verifications = await db.verifications.count_documents({"status": "pending"})
    active_site_visits = await db.users.count_documents({"project_phase": {"$in": ["scheduling", "confirmed"]}})
    in_3d_design = await db.design_projects.count_documents({"status": "in_progress"})
    ready_quotation = await db.design_projects.count_documents({"status": "ready_for_quotation"})

    today_iso = today.isoformat()
    followups_today = await db.leads.count_documents({
        "next_followup_at": {"$gte": today_iso, "$lt": today_iso + "T23:59:59"}
    })

    return {
        "cards": {
            "total_retainers": total_retainers,
            "pending_verifications": pending_verifications,
            "active_site_visits": active_site_visits,
            "in_3d_design": in_3d_design,
            "ready_for_quotation": ready_quotation,
            "followups_today": followups_today,
        },
        "leads_by_status": leads_by_status,
        "leads_by_source": leads_by_source,
        "leads_by_day": leads_by_day,
        "customers_by_phase": customers_by_phase,
    }


# ---------------------------------------------------------------------------
# Departments (legacy "Team Management")
# ---------------------------------------------------------------------------
@api.get("/admin/employees", response_model=List[EmployeeOut])
async def list_employees(user: dict = Depends(require_role("admin"))):
    """Lists all staff members for the admin table."""
    return await db.users.find(
        {"role": {"$in": ["sales", "designer", "admin"]}},
        {"_id": 0, "password_hash": 0}
    ).to_list(100)


@api.post("/admin/employees", response_model=MessageResponse)
async def create_team_member(body: EmployeeCreateRequest, user: dict = Depends(require_role("admin"))):
    email = body.email.lower()
    if not email or not body.role or not body.password:
        raise HTTPException(status_code=400, detail="Email, role, and temporary password are required")
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="An account with this email already exists.")
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    new_user = {
        "user_id": user_id,
        "email": email,
        "name": "Department Member",
        "mobile": body.phone or "",
        "role": body.role,
        "is_verified": True,
        "profile_completed": True,
        "password_hash": hash_password(body.password),
        "created_at": iso(now_utc()),
        "project_phase": "unpaid"
    }
    await db.users.insert_one(new_user)
    return {"ok": True, "message": f"Successfully created {body.role} account for {email}!"}


@api.delete("/admin/employees/{email}", response_model=MessageResponse)
async def delete_team_member(email: str, user: dict = Depends(require_role("admin"))):
    if email == user.get("email"):
        raise HTTPException(status_code=400, detail="You cannot delete your own admin account.")
    result = await db.users.delete_one({"email": email})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"ok": True, "message": f"Successfully deleted {email}"}


@api.put("/admin/employees/{email}", response_model=MessageResponse)
async def update_team_member(email: str, body: EmployeeUpdateRequest, user: dict = Depends(require_role("admin"))):
    if not body.role:
        raise HTTPException(status_code=400, detail="Role is required")
    result = await db.users.update_one({"email": email}, {"$set": {"role": body.role}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"ok": True, "message": f"Successfully updated {email} to {body.role}"}


# ---------------------------------------------------------------------------
# Discovery Calls (Admin Queue)
# ---------------------------------------------------------------------------
from pydantic import BaseModel

class DiscoveryStatusUpdate(BaseModel):
    status: str

@api.get("/admin/discovery-calls")
async def list_discovery_calls(user: dict = Depends(require_role("admin", "sales"))):
    """Admin/Sales queue for new discovery calls."""
    flt = {"extra.discovery_cta": True}
    docs = await db.leads.find(flt, {"_id": 0}).sort([("created_at", -1)]).to_list(100)
    # The frontend expects the call ID to be in `call_id` for rendering
    for d in docs:
        d["call_id"] = d.get("lead_id")
    return docs

@api.put("/admin/discovery-calls/{call_id}/status", response_model=MessageResponse)
async def update_discovery_call_status(call_id: str, body: DiscoveryStatusUpdate, user: dict = Depends(require_role("admin", "sales"))):
    """Update discovery call status directly from the queue."""
    if not body.status:
        raise HTTPException(status_code=400, detail="Status is required")
    result = await db.leads.update_one(
        {"lead_id": call_id},
        {"$set": {"status": body.status, "updated_at": iso(now_utc())}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Call not found")
    return {"ok": True, "message": "Call status updated successfully"}

