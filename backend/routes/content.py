"""Public CMS content."""
from fastapi import HTTPException

from core import api, db
from defaults import DEFAULT_HOMEPAGE_CONTENT, DEFAULT_INTERIORS_CONTENT


@api.get("/content/{key}")
async def get_content(key: str):
    doc = await db.content.find_one({"key": key})
    defaults_map = {"interiors": DEFAULT_INTERIORS_CONTENT, "homepage": DEFAULT_HOMEPAGE_CONTENT}
    # Accept either schema: new docs use `data`, legacy docs may use `value`.
    if doc:
        payload = doc.get("data") or doc.get("value")
        if isinstance(payload, dict) and payload:
            return payload
    if key in defaults_map:
        return defaults_map[key]
    raise HTTPException(status_code=404, detail="Content not found")


@api.get("/")
async def root():
    return {"ok": True, "service": "homesqre"}
