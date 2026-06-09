"""Unified Document Vault and Site Visit management."""
import uuid
from typing import List

from fastapi import Depends, HTTPException, UploadFile, File
from core import api, db, now_utc, iso, require_role, log
from storage_helpers import put_object, FLOOR_PLAN_ALLOWED_EXTS, FLOOR_PLAN_ALLOWED_TYPES, _validate_upload

@api.get("/leads/{lead_id}/vault")
async def get_document_vault(
    lead_id: str,
    user: dict = Depends(require_role("admin", "designer", "customer"))
):
    """Aggregate files from verifications, design_projects, and site visits for a lead."""
    lead = await db.leads.find_one({"lead_id": lead_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
        
    # Get the associated user (customer) to trace their verifications and design projects
    target_user = await db.users.find_one({"lead_id": lead_id})
    if not target_user:
        return {"files": []}

    # For a customer request, they can only view their own vault
    if user.get("role") == "customer" and user["user_id"] != target_user["user_id"]:
        raise HTTPException(status_code=403, detail="Not authorized to view this vault")

    files = []

    # 1. Verification Floor Plans
    verifications = await db.verifications.find({"user_id": target_user["user_id"]}).to_list(None)
    for v in verifications:
        for idx, url in enumerate(v.get("pdf_urls", [v.get("pdf_url")] if v.get("pdf_url") else [])):
            files.append({
                "type": "floor_plan",
                "url": url,
                "label": f"Floor Plan {idx + 1}",
                "uploaded_at": v.get("created_at")
            })

    # 2. Approved Design Renders
    projects = await db.design_projects.find({"user_id": target_user["user_id"]}).to_list(None)
    for p in projects:
        for img in p.get("images", []):
            files.append({
                "type": "design_render",
                "url": img.get("url"),
                "label": f"Design Render (Round {img.get('round', 1)})" + (f" - {img.get('customer_status').capitalize()}" if img.get('customer_status') else ""),
                "uploaded_at": img.get("reviewed_at") or img.get("uploaded_at")
            })
        
        # 3. Site Visit Documents (stored directly in design_projects)
        for sv_doc in p.get("site_visit_files", []):
            files.append({
                "type": "site_visit",
                "url": sv_doc.get("url"),
                "label": sv_doc.get("filename", "Measurement Document"),
                "uploaded_at": sv_doc.get("uploaded_at")
            })

    # Sort files by uploaded_at descending
    files.sort(key=lambda x: x.get("uploaded_at") or "", reverse=True)
    return {"files": files}


@api.post("/admin/leads/{lead_id}/site-visit-done")
async def mark_site_visit_done(
    lead_id: str,
    file: UploadFile = File(...),
    user: dict = Depends(require_role("admin"))
):
    """Admin completes a site visit by uploading a mandatory measurement document."""
    target_user = await db.users.find_one({"lead_id": lead_id})
    if not target_user:
        raise HTTPException(status_code=404, detail="Customer not found for this lead")
        
    data = await file.read()
    _validate_upload(file, data, FLOOR_PLAN_ALLOWED_TYPES, FLOOR_PLAN_ALLOWED_EXTS)
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else "bin"
    path = f"homesqre/site_visits/{lead_id}/{uuid.uuid4().hex}.{ext}"
    result = put_object(path, data, file.content_type or "application/octet-stream")
    
    file_record = {
        "url": f"/api/files/{result['path']}",
        "filename": file.filename,
        "uploaded_at": iso(now_utc()),
        "uploaded_by": user["email"]
    }
    
    # Update the user record
    await db.users.update_one(
        {"user_id": target_user["user_id"]},
        {"$set": {"site_visit_done": True, "site_visit_done_at": iso(now_utc())}}
    )
    
    # Store the file in their active design project if it exists
    project = await db.design_projects.find_one(
        {"user_id": target_user["user_id"]},
        sort=[("created_at", -1)]
    )
    
    if project:
        await db.design_projects.update_one(
            {"project_id": project["project_id"]},
            {
                "$push": {"site_visit_files": file_record},
                "$set": {"site_visit_done": True, "site_visit_done_at": iso(now_utc())},
            }
        )
    else:
        log.warning(f"Lead {lead_id} had a site visit completed but no design project exists yet.")
        
    return {"ok": True, "file": file_record}
