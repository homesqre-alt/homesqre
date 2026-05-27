"""Design-project lifecycle helpers.

`ensure_design_project` is the single source of truth for creating/linking a
customer's 3D design project. `maybe_promote_to_quotation` runs after every
customer review and (a) flips the project to ready_for_quotation when all
images are approved, (b) auto-advances the linked lead to "Ready for Quotation"
and reassigns it to the admin pool.
"""
import uuid
from typing import Optional

from core import db, log, iso, now_utc
from crm_helpers import (
    find_or_create_lead_for_user,
    _auto_assign_for_status,
)


async def ensure_design_project(user_id: str, verification_id: Optional[str] = None) -> dict:
    existing = await db.design_projects.find_one(
        {"user_id": user_id, "status": {"$in": ["in_progress", "ready_for_quotation"]}}
    )
    if existing:
        # Backfill lead_id on legacy projects.
        if not existing.get("lead_id"):
            u = await db.users.find_one({"user_id": user_id})
            if u:
                lead_id = await find_or_create_lead_for_user(u, status="Designing")
                await db.design_projects.update_one(
                    {"project_id": existing["project_id"]},
                    {"$set": {"lead_id": lead_id, "updated_at": iso(now_utc())}},
                )
                existing["lead_id"] = lead_id
        return existing
    u = await db.users.find_one({"user_id": user_id})
    lead_id = await find_or_create_lead_for_user(u, status="Designing") if u else None
    rec = {
        "project_id": f"dp_{uuid.uuid4().hex[:10]}",
        "user_id": user_id,
        "lead_id": lead_id,
        "verification_id": verification_id,
        "designer_id": None,
        "status": "in_progress",
        "quotation_status": None,
        "images": [],
        "created_at": iso(now_utc()),
        "updated_at": iso(now_utc()),
    }
    await db.design_projects.insert_one(rec)
    rec.pop("_id", None)
    log.info(f"[DESIGN] Created project {rec['project_id']} for user {user_id} (lead {lead_id})")
    return rec


def project_all_approved(project: dict) -> bool:
    """Return True only when the customer has reviewed and approved the entire
    latest round of renders uploaded by the designer.

    Earlier rounds may contain "needs_improvement" entries (they were superseded
    by newer rounds), so we only look at images whose round equals the current
    maximum round number.  We also require that NO image anywhere is still in
    "pending" state — safety guard in case the data gets into an unexpected state.
    """
    imgs = project.get("images", [])
    if not imgs:
        return False
    # Safety: any unreviewed images → not ready
    if any(i.get("customer_status") == "pending" for i in imgs):
        return False
    # Only the latest round needs to be fully approved; earlier rounds may have
    # "needs_improvement" items that have since been superseded.
    max_round = max(i.get("round", 1) for i in imgs)
    latest_round_imgs = [i for i in imgs if i.get("round") == max_round]
    return len(latest_round_imgs) > 0 and all(
        i.get("customer_status") == "approved" for i in latest_round_imgs
    )


async def maybe_promote_to_quotation(project_id: str) -> bool:
    project = await db.design_projects.find_one({"project_id": project_id})
    if not project or project.get("status") != "in_progress":
        return False
    if not project_all_approved(project):
        return False
    await db.design_projects.update_one(
        {"project_id": project_id},
        {"$set": {"status": "ready_for_quotation",
                  "quotation_status": "Awaiting Customer Approval",
                  "approved_at": iso(now_utc()),
                  "updated_at": iso(now_utc())}}
    )
    await db.users.update_one(
        {"user_id": project["user_id"]},
        {"$set": {"project_phase": "ready_for_quotation"}}
    )
    # Mirror the milestone onto the linked lead: status → "Ready for Quotation",
    # reassign to the admin pool (status' assign_to_role drives this).
    lead_id = project.get("lead_id")
    if lead_id:
        lead = await db.leads.find_one({"lead_id": lead_id})
        if lead:
            new_assignee = await _auto_assign_for_status("Ready for Quotation", lead.get("assigned_to"))
            await db.leads.update_one(
                {"lead_id": lead_id},
                {
                    "$set": {
                        "status": "Ready for Quotation",
                        "assigned_to": new_assignee,
                        "updated_at": iso(now_utc()),
                    },
                    "$push": {"history": {
                        "from_status": lead.get("status"),
                        "to_status": "Ready for Quotation",
                        "at": iso(now_utc()),
                        "by": "system:design-approved",
                    }},
                },
            )
            log.info(f"[CRM] Lead {lead_id} promoted to 'Ready for Quotation' (assignee={new_assignee})")
    log.info(f"[DESIGN] Project {project_id} promoted to ready_for_quotation")
    return True
