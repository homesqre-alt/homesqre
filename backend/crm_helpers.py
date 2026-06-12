"""CRM domain helpers shared across routes.

Owns:
- DEFAULT_* status / source seeds + the idempotent seed helper.
- Round-robin auto-assignment rule.
- The single canonical lead builder + history append helpers.
- `_find_or_create_lead_for_user` (used by both verifications/design when a
  paying customer gets linked into the CRM pipeline).
"""
import uuid
from typing import Optional, List

from fastapi import HTTPException

from core import db, log, iso, now_utc


# ---------------------------------------------------------------------------
# Seeds
# ---------------------------------------------------------------------------
DEFAULT_CRM_STATUSES = [
    {"name": "New",                          "sort_order": 0, "assign_to_role": "sales"},
    {"name": "No Answer / Not Reachable",    "sort_order": 1, "assign_to_role": "sales"},
    {"name": "Not Interested",               "sort_order": 2, "assign_to_role": None},
    {"name": "Send to Design",               "sort_order": 3, "assign_to_role": "designer"},
    {"name": "Designing",                    "sort_order": 4, "assign_to_role": "designer"},
    {"name": "Awaiting Customer Approval",   "sort_order": 5, "assign_to_role": None},
    {"name": "Ready for Quotation",          "sort_order": 6, "assign_to_role": "admin"},
]
DEFAULT_CRM_SOURCES = [
    {"name": "Website",   "sort_order": 0},
    {"name": "Reference", "sort_order": 1},
]
BUDGET_OPTIONS = [
    "Under ₹3L", "₹3L – ₹5L", "₹5L – ₹8L", "₹8L – ₹12L",
    "₹12L – ₹18L", "₹18L – ₹25L", "₹25L+", "Not Sure",
]


async def seed_crm_defaults():
    """Idempotent — only insert missing statuses/sources. Allows new defaults
    (e.g. "Ready for Quotation") to flow into existing deployments."""
    existing_status_names = {
        s["name"] async for s in db.crm_statuses.find({}, {"_id": 0, "name": 1})
    }
    to_insert = [dict(s) for s in DEFAULT_CRM_STATUSES if s["name"] not in existing_status_names]
    if to_insert:
        await db.crm_statuses.insert_many(to_insert)
        log.info(f"[CRM] Seeded {len(to_insert)} missing default statuses")

    existing_source_names = {
        s["name"] async for s in db.crm_sources.find({}, {"_id": 0, "name": 1})
    }
    src_to_insert = [dict(s) for s in DEFAULT_CRM_SOURCES if s["name"] not in existing_source_names]
    if src_to_insert:
        await db.crm_sources.insert_many(src_to_insert)
        log.info(f"[CRM] Seeded {len(src_to_insert)} missing default sources")


async def migrate_to_unified_leads():
    """Idempotent: migrate legacy `interior_leads` and `discovery_calls` into
    the unified `leads` collection. Marks originals with `migrated=True`."""
    migrated_count = 0
    async for d in db.interior_leads.find({"migrated": {"$ne": True}}):
        lead = _build_lead({
            "name": d.get("name"), "phone": d.get("phone"), "email": d.get("email"),
            "budget_range": d.get("budget") or "",
            "message": " | ".join(s for s in [d.get("property_type"), d.get("flat_size"),
                                              d.get("style"), d.get("move_in"),
                                              (f"Locality: {d['locality']}" if d.get("locality") else None)] if s),
            "source": "Website",
        }, created_by="migration", default_status="New")
        lead["created_at"] = d.get("created_at") or lead["created_at"]
        lead["extra"] = {"migrated_from": "interior_leads", "original_id": d.get("lead_id")}
        await db.leads.insert_one(lead)
        await db.interior_leads.update_one({"_id": d["_id"]}, {"$set": {"migrated": True}})
        migrated_count += 1
    async for d in db.discovery_calls.find({"migrated": {"$ne": True}}):
        lead = _build_lead({
            "name": d.get("name"), "phone": d.get("phone"),
            "source": "Website",
        }, created_by="migration", default_status="New")
        lead["created_at"] = d.get("created_at") or lead["created_at"]
        legacy_assignee = d.get("assigned_to")
        if legacy_assignee:
            existing = await db.users.find_one(
                {"$or": [{"email": legacy_assignee.lower()}, {"name": legacy_assignee}]},
                {"_id": 0, "email": 1}
            )
            lead["assigned_to"] = (existing["email"] if existing else
                                   await _auto_assign_for_status(lead["status"], None))
        else:
            lead["assigned_to"] = await _auto_assign_for_status(lead["status"], None)
        lead["extra"] = {"migrated_from": "discovery_calls", "original_id": d.get("call_id")}
        await db.leads.insert_one(lead)
        await db.discovery_calls.update_one({"_id": d["_id"]}, {"$set": {"migrated": True}})
        migrated_count += 1
    if migrated_count:
        log.info(f"[CRM] Migrated {migrated_count} legacy leads into unified `leads` collection")


# ---------------------------------------------------------------------------
# Assignment + lead-build helpers
# ---------------------------------------------------------------------------
def _user_identifier(u: dict) -> str:
    """Stable identifier for assigned_to. Email is unique-by-construction."""
    return (u.get("email") or "").lower()


async def _round_robin_assignee(role: str) -> Optional[str]:
    """Pick next staff identifier (email) for a given role using round-robin."""
    users = await db.users.find(
        {"role": role},
        {"_id": 0, "email": 1, "created_at": 1}
    ).sort("created_at", 1).to_list(None)
    emails = [_user_identifier(u) for u in users if u.get("email")]
    if not emails:
        return None
    last = await db.leads.find_one(
        {"assigned_to": {"$in": emails}},
        sort=[("updated_at", -1)]
    )
    last_email = last.get("assigned_to") if last else None
    if last_email in emails:
        idx = (emails.index(last_email) + 1) % len(emails)
    else:
        idx = 0
    return emails[idx]


async def _auto_assign_for_status(status_name: str, current_assignee: Optional[str]) -> Optional[str]:
    status_def = await db.crm_statuses.find_one({"name": status_name}, {"_id": 0})
    role = (status_def or {}).get("assign_to_role")
    if not role:
        return current_assignee
    return await _round_robin_assignee(role) or current_assignee


def _build_lead(payload: dict, created_by: str, default_status: str = "New") -> dict:
    return {
        "lead_id": f"lead_{uuid.uuid4().hex[:10]}",
        "name": (payload.get("name") or "").strip(),
        "phone": (payload.get("phone") or "").strip(),
        "email": (payload.get("email") or "").strip().lower(),
        "budget_range": payload.get("budget_range") or "",
        "message": payload.get("message") or "",
        "source": payload.get("source") or "Website",
        "status": payload.get("status") or default_status,
        "assigned_to": (payload.get("assigned_to") or "").lower() or None,
        "next_followup_at": payload.get("next_followup_at") or None,
        "comments": [],
        "history": [],
        "created_at": iso(now_utc()),
        "updated_at": iso(now_utc()),
        "created_by": created_by,
    }


def _append_history(updates: dict, from_status: str, to_status: str, by: str):
    updates.setdefault("$push", {})
    updates["$push"]["history"] = {
        "from_status": from_status, "to_status": to_status,
        "at": iso(now_utc()), "by": by,
    }


def _validate_status_source(status: Optional[str], source: Optional[str],
                            known_statuses: List[str], known_sources: List[str]):
    if status and status not in known_statuses:
        raise HTTPException(status_code=400, detail=f"Unknown status: {status}")
    if source and source not in known_sources:
        raise HTTPException(status_code=400, detail=f"Unknown source: {source}")


# ---------------------------------------------------------------------------
# Customer-to-lead linker
# ---------------------------------------------------------------------------
async def find_or_create_lead_for_user(user_doc: dict, status: str = "Send to Design", comment_text: Optional[str] = None) -> str:
    """Find the most recent lead for this user (match by email or phone) or
    create one. Returns the lead_id. Idempotent: if the user already has a
    `lead_id` field, returns it directly."""
    if user_doc.get("lead_id"):
        return user_doc["lead_id"]

    email = (user_doc.get("email") or "").strip().lower()
    phone = (user_doc.get("mobile") or "").strip()
    or_clauses = []
    if email:
        or_clauses.append({"email": email})
    if phone:
        or_clauses.append({"phone": phone})
    lead = None
    if or_clauses:
        lead = await db.leads.find_one({"$or": or_clauses}, sort=[("created_at", -1)])

    if not lead:
        lead = _build_lead(
            {
                "name": user_doc.get("name") or email.split("@")[0] or "Customer",
                "phone": phone, "email": email,
                "source": "Website",
                "status": status,
            },
            created_by="system:auto-link",
            default_status=status,
        )
        lead["assigned_to"] = await _auto_assign_for_status(lead["status"], None)
        lead["extra"] = {"auto_created_for_user": user_doc.get("user_id")}
        
        if comment_text:
            lead["comments"].append({
                "id": f"c_{uuid.uuid4().hex[:8]}",
                "by": "system:auto-link",
                "by_name": "System Auto-Link",
                "text": comment_text,
                "at": iso(now_utc())
            })
            
        await db.leads.insert_one(lead)
        log.info(f"[CRM] Auto-created lead {lead['lead_id']} for user {user_doc.get('user_id')}")
    else:
        terminal_progress = {"Send to Design", "Designing", "Awaiting Customer Approval", "Ready for Quotation"}
        
        updates = {"$set": {"updated_at": iso(now_utc())}}
        
        if lead.get("status") not in terminal_progress:
            new_assignee = await _auto_assign_for_status(status, lead.get("assigned_to"))
            updates["$set"]["status"] = status
            updates["$set"]["assigned_to"] = new_assignee
            updates.setdefault("$push", {})
            updates["$push"]["history"] = {
                "from_status": lead.get("status"), "to_status": status,
                "at": iso(now_utc()), "by": "system:auto-link",
            }
            
        if comment_text:
            updates.setdefault("$push", {})
            updates["$push"].setdefault("comments", {
                "$each": [{
                    "id": f"c_{uuid.uuid4().hex[:8]}",
                    "by": "system:auto-link",
                    "by_name": "System Auto-Link",
                    "text": comment_text,
                    "at": iso(now_utc())
                }]
            })
            
        if "$push" in updates or len(updates["$set"]) > 1: # updated_at is always there
            await db.leads.update_one(
                {"lead_id": lead["lead_id"]},
                updates
            )

    await db.users.update_one(
        {"user_id": user_doc["user_id"]},
        {"$set": {"lead_id": lead["lead_id"]}},
    )
    return lead["lead_id"]
