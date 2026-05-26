"""CRM Settings — admin-customisable statuses, sources, budget options."""
from typing import List

from fastapi import Depends, HTTPException

from core import api, db, current_user, require_role
from crm_helpers import BUDGET_OPTIONS
from schemas import (
    StatusOut, StatusCreateRequest, StatusUpdateRequest,
    SourceOut, SourceCreateRequest, SourceUpdateRequest, OkResponse,
)


# ----- Statuses -----
@api.get("/crm/statuses", response_model=List[StatusOut])
async def list_crm_statuses(user: dict = Depends(current_user)):
    return await db.crm_statuses.find({}, {"_id": 0}).sort("sort_order", 1).to_list(None)


@api.post("/crm/statuses", response_model=StatusOut)
async def create_crm_status(body: StatusCreateRequest, user: dict = Depends(require_role("admin"))):
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    if await db.crm_statuses.find_one({"name": name}):
        raise HTTPException(status_code=400, detail="Status already exists")
    doc = {"name": name, "sort_order": int(body.sort_order), "assign_to_role": body.assign_to_role}
    await db.crm_statuses.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.put("/crm/statuses/{name}", response_model=OkResponse)
async def update_crm_status(name: str, body: StatusUpdateRequest, user: dict = Depends(require_role("admin"))):
    update = body.model_dump(exclude_unset=True)
    if not update:
        raise HTTPException(status_code=400, detail="Nothing to update")
    if "sort_order" in update and update["sort_order"] is not None:
        update["sort_order"] = int(update["sort_order"])
    res = await db.crm_statuses.update_one({"name": name}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Status not found")
    return {"ok": True}


@api.delete("/crm/statuses/{name}", response_model=OkResponse)
async def delete_crm_status(name: str, user: dict = Depends(require_role("admin"))):
    in_use = await db.leads.count_documents({"status": name})
    if in_use:
        raise HTTPException(status_code=400, detail=f"Cannot delete: {in_use} lead(s) are using this status")
    await db.crm_statuses.delete_one({"name": name})
    return {"ok": True}


# ----- Sources -----
@api.get("/crm/sources", response_model=List[SourceOut])
async def list_crm_sources(user: dict = Depends(current_user)):
    return await db.crm_sources.find({}, {"_id": 0}).sort("sort_order", 1).to_list(None)


@api.post("/crm/sources", response_model=SourceOut)
async def create_crm_source(body: SourceCreateRequest, user: dict = Depends(require_role("admin"))):
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    if await db.crm_sources.find_one({"name": name}):
        raise HTTPException(status_code=400, detail="Source already exists")
    doc = {"name": name, "sort_order": int(body.sort_order)}
    await db.crm_sources.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.put("/crm/sources/{name}", response_model=OkResponse)
async def update_crm_source(name: str, body: SourceUpdateRequest, user: dict = Depends(require_role("admin"))):
    update = body.model_dump(exclude_unset=True)
    if not update:
        raise HTTPException(status_code=400, detail="Nothing to update")
    if "sort_order" in update and update["sort_order"] is not None:
        update["sort_order"] = int(update["sort_order"])
    res = await db.crm_sources.update_one({"name": name}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Source not found")
    return {"ok": True}


@api.delete("/crm/sources/{name}", response_model=OkResponse)
async def delete_crm_source(name: str, user: dict = Depends(require_role("admin"))):
    in_use = await db.leads.count_documents({"source": name})
    if in_use:
        raise HTTPException(status_code=400, detail=f"Cannot delete: {in_use} lead(s) are using this source")
    await db.crm_sources.delete_one({"name": name})
    return {"ok": True}


@api.get("/crm/budget-options", response_model=List[str])
async def list_budget_options():
    return BUDGET_OPTIONS

