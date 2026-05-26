"""CRM Settings — admin-customisable statuses, sources, budget options."""
from fastapi import Depends, HTTPException

from core import api, db, current_user, require_role
from crm_helpers import BUDGET_OPTIONS


# ----- Statuses -----
@api.get("/crm/statuses")
async def list_crm_statuses(user: dict = Depends(current_user)):
    return await db.crm_statuses.find({}, {"_id": 0}).sort("sort_order", 1).to_list(None)


@api.post("/crm/statuses")
async def create_crm_status(payload: dict, user: dict = Depends(require_role("admin"))):
    name = (payload.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    if await db.crm_statuses.find_one({"name": name}):
        raise HTTPException(status_code=400, detail="Status already exists")
    doc = {
        "name": name,
        "sort_order": int(payload.get("sort_order", 999)),
        "assign_to_role": payload.get("assign_to_role") or None,
    }
    await db.crm_statuses.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.put("/crm/statuses/{name}")
async def update_crm_status(name: str, payload: dict, user: dict = Depends(require_role("admin"))):
    update = {}
    if "sort_order" in payload:
        update["sort_order"] = int(payload["sort_order"])
    if "assign_to_role" in payload:
        update["assign_to_role"] = payload["assign_to_role"] or None
    if not update:
        raise HTTPException(status_code=400, detail="Nothing to update")
    res = await db.crm_statuses.update_one({"name": name}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Status not found")
    return {"ok": True}


@api.delete("/crm/statuses/{name}")
async def delete_crm_status(name: str, user: dict = Depends(require_role("admin"))):
    in_use = await db.leads.count_documents({"status": name})
    if in_use:
        raise HTTPException(status_code=400, detail=f"Cannot delete: {in_use} lead(s) are using this status")
    await db.crm_statuses.delete_one({"name": name})
    return {"ok": True}


# ----- Sources -----
@api.get("/crm/sources")
async def list_crm_sources(user: dict = Depends(current_user)):
    return await db.crm_sources.find({}, {"_id": 0}).sort("sort_order", 1).to_list(None)


@api.post("/crm/sources")
async def create_crm_source(payload: dict, user: dict = Depends(require_role("admin"))):
    name = (payload.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    if await db.crm_sources.find_one({"name": name}):
        raise HTTPException(status_code=400, detail="Source already exists")
    doc = {"name": name, "sort_order": int(payload.get("sort_order", 999))}
    await db.crm_sources.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.put("/crm/sources/{name}")
async def update_crm_source(name: str, payload: dict, user: dict = Depends(require_role("admin"))):
    update = {}
    if "sort_order" in payload:
        update["sort_order"] = int(payload["sort_order"])
    if not update:
        raise HTTPException(status_code=400, detail="Nothing to update")
    res = await db.crm_sources.update_one({"name": name}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Source not found")
    return {"ok": True}


@api.delete("/crm/sources/{name}")
async def delete_crm_source(name: str, user: dict = Depends(require_role("admin"))):
    in_use = await db.leads.count_documents({"source": name})
    if in_use:
        raise HTTPException(status_code=400, detail=f"Cannot delete: {in_use} lead(s) are using this source")
    await db.crm_sources.delete_one({"name": name})
    return {"ok": True}


@api.get("/crm/budget-options")
async def list_budget_options():
    return BUDGET_OPTIONS
