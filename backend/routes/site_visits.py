from fastapi import Depends, HTTPException, Query
from core import api, db, now_utc, iso, current_user, require_role
from pydantic import BaseModel

class BlockSlotRequest(BaseModel):
    slot: str

@api.get("/site-visits/slots")
async def get_available_slots(start_date: str = Query(...), end_date: str = Query(...)):
    """
    Returns a list of all slots that are ALREADY booked or blocked 
    between start_date and end_date.
    The frontend will filter them out from the generic slot list.
    start_date and end_date should be in format "YYYY-MM-DD" or ISO strings.
    """
    # 1. Get blocked slots from admin
    blocks = await db.site_visit_blocks.find({
        "slot": {"$gte": start_date, "$lte": end_date + "T23:59:59"}
    }).to_list(None)
    blocked_slots = [b["slot"] for b in blocks]
    
    # 2. Get slots booked by customers
    bookings = await db.users.find({
        "site_visit_at": {"$gte": start_date, "$lte": end_date + "T23:59:59"}
    }).to_list(None)
    booked_slots = [b.get("site_visit_at") for b in bookings if b.get("site_visit_at")]
    
    return {
        "ok": True,
        "unavailable_slots": list(set(blocked_slots + booked_slots)),
        "blocked_slots": blocked_slots,
        "booked_slots": booked_slots
    }

@api.post("/admin/site-visits/blocks")
async def block_slot(body: BlockSlotRequest, admin: dict = Depends(require_role("admin"))):
    await db.site_visit_blocks.update_one(
        {"slot": body.slot},
        {"$set": {"slot": body.slot, "blocked_by": admin["user_id"], "created_at": iso(now_utc())}},
        upsert=True
    )
    return {"ok": True}

@api.delete("/admin/site-visits/blocks/{slot}")
async def unblock_slot(slot: str, admin: dict = Depends(require_role("admin"))):
    await db.site_visit_blocks.delete_one({"slot": slot})
    return {"ok": True}
