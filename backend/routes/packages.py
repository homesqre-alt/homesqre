"""CMS Packages endpoints for dynamic property packages."""
from typing import List
from fastapi import Depends
from pydantic import BaseModel

from core import api, db, require_role, iso, now_utc

class PackageOption(BaseModel):
    value: str
    label: str
    price: int
    blurb: str

class PackageGroup(BaseModel):
    group: str
    property_type: str
    options: List[PackageOption]

class PackagesUpdateRequest(BaseModel):
    packages: List[PackageGroup]

DEFAULT_PACKAGES = [
    {
        "group": "Apartment / Flat",
        "property_type": "apartment",
        "options": [
            {"value": "1-2", "label": "1–2 BHK", "price": 10000, "blurb": "Ideal for cozy 1-2 BHK apartments"},
            {"value": "3",   "label": "3 BHK",   "price": 12000, "blurb": "Perfect for spacious 3 BHK homes"},
            {"value": "4+",  "label": "4+ BHK",  "price": 15000, "blurb": "Designed for premium large apartments"}
        ]
    },
    {
        "group": "Villa / Individual Home",
        "property_type": "villa",
        "options": [
            {"value": "duplex",  "label": "Duplex",  "price": 15000, "blurb": "Multi-floor villas with premium designs"},
            {"value": "triplex", "label": "Triplex", "price": 18000, "blurb": "Three floors of luxury living interior design"}
        ]
    },
    {
        "group": "Rental Building",
        "property_type": "independent",
        "options": [
            {"value": "1", "label": "1 unit (Rental/Independent)", "price": 12000, "blurb": "Single rental unit setup"},
            {"value": "2", "label": "2 units", "price": 20000, "blurb": "Double rental units setup"},
            {"value": "3", "label": "3 units", "price": 20000, "blurb": "Three rental units setup"},
            {"value": "4", "label": "4 units", "price": 24000, "blurb": "Four rental units setup"},
            {"value": "5", "label": "5 units", "price": 30000, "blurb": "Five rental units setup"}
        ]
    }
]

@api.get("/packages")
async def get_packages():
    """Public endpoint to fetch dynamic package pricing."""
    doc = await db.cms_packages.find_one({"_id": "current"}, {"_id": 0})
    if doc and "packages" in doc and len(doc["packages"]) > 0:
        return doc["packages"]
    return DEFAULT_PACKAGES

@api.put("/admin/packages")
async def update_packages(req: PackagesUpdateRequest, user: dict = Depends(require_role("admin"))):
    """Admin updates the package catalogue."""
    await db.cms_packages.update_one(
        {"_id": "current"},
        {"$set": {
            "packages": [p.model_dump() for p in req.packages],
            "updated_at": iso(now_utc()),
            "updated_by": user["email"]
        }},
        upsert=True
    )
    return {"ok": True, "message": "Packages updated successfully"}
