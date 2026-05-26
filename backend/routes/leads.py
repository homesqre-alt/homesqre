"""Unified leads (CRM) — public capture + authenticated CRUD + workflow."""
import re
import csv
import io
import uuid
from typing import Optional, Any, Dict

from fastapi import Depends, HTTPException
from fastapi.responses import Response as RawResponse
from pydantic import BaseModel

from core import (
    api, db, log, iso, now_utc, clean_doc,
    current_user, current_user_optional, require_role,
)
from crm_helpers import (
    _build_lead, _user_identifier, _auto_assign_for_status,
    _validate_status_source,
)


class DiscoveryCallCreate(BaseModel):
    name: str
    phone: str


# ----- Public lead capture (homepage form + Customer dashboard CTAs) -----
@api.post("/leads/public")
async def create_public_lead(payload: dict):
    """Anonymous lead capture. Source defaults to 'Website'. Auto-assigns based
    on the default status rule (Sales)."""
    if not payload.get("name") or not payload.get("phone"):
        raise HTTPException(status_code=400, detail="Name and phone are required")
    lead = _build_lead(payload, created_by="public", default_status="New")
    lead["source"] = payload.get("source") or "Website"
    lead["assigned_to"] = await _auto_assign_for_status(lead["status"], None)
    await db.leads.insert_one(lead)
    log.info(f"[CRM] Public lead {lead['name']} created → assigned to {lead['assigned_to']}")
    return {"ok": True, "lead_id": lead["lead_id"]}


# ----- Backward-compat shims -----
@api.post("/interior-leads")
async def create_interior_lead_shim(payload: Dict[str, Any]):
    """Compat shim — homepage interior-lead form. Maps richer fields into the
    unified `leads` collection and stores the original blob under `extra`."""
    if not (payload.get("name") and payload.get("phone")):
        raise HTTPException(status_code=400, detail="Name and phone are required")
    lead = _build_lead({
        "name": payload.get("name"),
        "phone": payload.get("phone"),
        "email": payload.get("email"),
        "budget_range": payload.get("budget") or "",
        "message": " | ".join([s for s in [
            payload.get("property_type"), payload.get("flat_size"),
            payload.get("style"), payload.get("move_in"),
            (f"Locality: {payload['locality']}" if payload.get("locality") else None),
        ] if s]),
        "source": "Website",
    }, created_by="public", default_status="New")
    lead["extra"] = {k: payload.get(k) for k in (
        "whatsapp", "property_type", "flat_size", "budget", "style", "move_in", "locality"
    )}
    lead["assigned_to"] = await _auto_assign_for_status(lead["status"], None)
    await db.leads.insert_one(lead)
    return {"ok": True, "lead_id": lead["lead_id"]}


@api.post("/discovery-calls")
async def create_discovery_call_shim(payload: DiscoveryCallCreate, user: Optional[dict] = Depends(current_user_optional)):
    """Compat shim — customer-dashboard discovery-call CTA. Writes to unified
    `leads` collection. Kept so existing frontend keeps working unchanged."""
    lead = _build_lead({
        "name": payload.name,
        "phone": payload.phone,
        "source": "Website",
    }, created_by=(user["email"].lower() if user else "public"), default_status="New")
    lead["extra"] = {"discovery_cta": True, "user_id": user["user_id"] if user else None}
    lead["assigned_to"] = await _auto_assign_for_status(lead["status"], None)
    await db.leads.insert_one(lead)
    lead.pop("_id", None)
    return {"call_id": lead["lead_id"], **lead}


# ----- Authenticated lead CRUD -----
def _lead_scope_filter(u: dict) -> dict:
    """Sales sees only own leads; admin sees everything."""
    if u.get("role") == "admin":
        return {}
    return {"assigned_to": _user_identifier(u)}


@api.get("/leads")
async def list_leads(
    user: dict = Depends(require_role("admin", "sales", "designer")),
    status: Optional[str] = None,
    source: Optional[str] = None,
    assigned_to: Optional[str] = None,
    q: Optional[str] = None,
    followup: Optional[str] = None,          # "today" | "overdue" | "upcoming"
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    limit: int = 200,
    offset: int = 0,
):
    flt: dict = _lead_scope_filter(user)
    if status:
        flt["status"] = status
    if source:
        flt["source"] = source
    if assigned_to and user.get("role") == "admin":
        flt["assigned_to"] = assigned_to.lower()
    if q:
        rx = {"$regex": re.escape(q), "$options": "i"}
        flt["$or"] = [{"name": rx}, {"phone": rx}, {"email": rx}]
    if from_date:
        flt.setdefault("created_at", {})["$gte"] = from_date
    if to_date:
        flt.setdefault("created_at", {})["$lte"] = to_date
    if followup:
        today = now_utc().date().isoformat()
        if followup == "today":
            flt["next_followup_at"] = {"$gte": today, "$lt": today + "T23:59:59"}
        elif followup == "overdue":
            flt["next_followup_at"] = {"$lt": today}
        elif followup == "upcoming":
            flt["next_followup_at"] = {"$gte": today}
    docs = await db.leads.find(flt, {"_id": 0}).sort([("updated_at", -1)]).skip(offset).limit(min(limit, 1000)).to_list(None)
    total = await db.leads.count_documents(flt)
    return {"items": docs, "total": total}


@api.get("/leads/export.csv")
async def export_leads_csv(user: dict = Depends(require_role("admin"))):
    docs = await db.leads.find({}, {"_id": 0}).sort([("created_at", -1)]).to_list(None)
    cols = ["lead_id", "name", "phone", "email", "budget_range", "message",
            "source", "status", "assigned_to", "next_followup_at",
            "created_at", "updated_at", "created_by"]
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(cols + ["comments"])
    for d in docs:
        row = [d.get(c, "") for c in cols]
        comments = " | ".join(f"[{c.get('at','')}] {c.get('by_name') or c.get('by','')}: {c.get('text','')}"
                              for c in d.get("comments", []))
        writer.writerow(row + [comments])
    out.seek(0)
    return RawResponse(
        content=out.getvalue().encode("utf-8"),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="leads.csv"'},
    )


@api.get("/leads/{lead_id}")
async def get_lead(lead_id: str, user: dict = Depends(require_role("admin", "sales", "designer"))):
    lead = await db.leads.find_one({"lead_id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    if user.get("role") != "admin" and (lead.get("assigned_to") or "") != _user_identifier(user):
        raise HTTPException(status_code=403, detail="Not your lead")
    return lead


@api.post("/leads")
async def create_lead(payload: dict, user: dict = Depends(require_role("admin", "sales"))):
    if not payload.get("name") or not payload.get("phone"):
        raise HTTPException(status_code=400, detail="Name and phone are required")
    statuses = [s["name"] for s in await db.crm_statuses.find({}, {"name": 1}).to_list(None)]
    sources = [s["name"] for s in await db.crm_sources.find({}, {"name": 1}).to_list(None)]
    _validate_status_source(payload.get("status"), payload.get("source"), statuses, sources)
    lead = _build_lead(payload, created_by=_user_identifier(user))
    # Sales auto-assigns to themselves; admin may pass assigned_to explicitly,
    # otherwise we apply the status' default-role rule.
    if user.get("role") == "sales":
        lead["assigned_to"] = _user_identifier(user)
    elif not lead["assigned_to"]:
        lead["assigned_to"] = await _auto_assign_for_status(lead["status"], None)
    await db.leads.insert_one(lead)
    return clean_doc(lead)


@api.put("/leads/{lead_id}")
async def update_lead(lead_id: str, payload: dict, user: dict = Depends(require_role("admin"))):
    """Admin-only full update. Sales uses the focused endpoints below."""
    lead = await db.leads.find_one({"lead_id": lead_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    allowed = {"name", "phone", "email", "budget_range", "message", "source", "next_followup_at", "assigned_to"}
    update = {k: payload[k] for k in payload if k in allowed}
    if "email" in update:
        update["email"] = (update["email"] or "").strip().lower()
    if "assigned_to" in update:
        update["assigned_to"] = (update["assigned_to"] or "").lower() or None
    if not update:
        raise HTTPException(status_code=400, detail="No editable fields supplied")
    update["updated_at"] = iso(now_utc())
    await db.leads.update_one({"lead_id": lead_id}, {"$set": update})
    return {"ok": True}


@api.delete("/leads/{lead_id}")
async def delete_lead(lead_id: str, user: dict = Depends(require_role("admin"))):
    res = await db.leads.delete_one({"lead_id": lead_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Lead not found")
    return {"ok": True}


@api.put("/leads/{lead_id}/status")
async def update_lead_status(lead_id: str, payload: dict, user: dict = Depends(require_role("admin", "sales", "designer"))):
    new_status = (payload.get("status") or "").strip()
    if not new_status:
        raise HTTPException(status_code=400, detail="status is required")
    lead = await db.leads.find_one({"lead_id": lead_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    if user.get("role") != "admin" and (lead.get("assigned_to") or "") != _user_identifier(user):
        raise HTTPException(status_code=403, detail="Not your lead")
    if not await db.crm_statuses.find_one({"name": new_status}):
        raise HTTPException(status_code=400, detail=f"Unknown status: {new_status}")
    old_status = lead.get("status")
    next_assignee = await _auto_assign_for_status(new_status, lead.get("assigned_to"))
    update = {
        "status": new_status,
        "assigned_to": next_assignee,
        "updated_at": iso(now_utc()),
    }
    await db.leads.update_one(
        {"lead_id": lead_id},
        {"$set": update,
         "$push": {"history": {"from_status": old_status, "to_status": new_status,
                                "at": iso(now_utc()), "by": _user_identifier(user)}}}
    )
    return {"ok": True, "assigned_to": next_assignee}


@api.post("/leads/{lead_id}/comments")
async def add_lead_comment(lead_id: str, payload: dict, user: dict = Depends(require_role("admin", "sales", "designer"))):
    text = (payload.get("text") or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Comment text is required")
    lead = await db.leads.find_one({"lead_id": lead_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    if user.get("role") != "admin" and (lead.get("assigned_to") or "") != _user_identifier(user):
        raise HTTPException(status_code=403, detail="Not your lead")
    comment = {
        "id": f"c_{uuid.uuid4().hex[:8]}",
        "by": _user_identifier(user),
        "by_name": user.get("name") or _user_identifier(user),
        "text": text,
        "at": iso(now_utc()),
    }
    await db.leads.update_one(
        {"lead_id": lead_id},
        {"$push": {"comments": comment}, "$set": {"updated_at": iso(now_utc())}}
    )
    return comment


@api.put("/leads/{lead_id}/followup")
async def set_lead_followup(lead_id: str, payload: dict, user: dict = Depends(require_role("admin", "sales", "designer"))):
    when = payload.get("next_followup_at")  # ISO string or null
    lead = await db.leads.find_one({"lead_id": lead_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    if user.get("role") != "admin" and (lead.get("assigned_to") or "") != _user_identifier(user):
        raise HTTPException(status_code=403, detail="Not your lead")
    await db.leads.update_one(
        {"lead_id": lead_id},
        {"$set": {"next_followup_at": when, "updated_at": iso(now_utc())}}
    )
    return {"ok": True}
