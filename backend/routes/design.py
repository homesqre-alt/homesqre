"""3D Design Iteration loop — customer review + designer/admin uploads + admin
quotation pipeline."""
import uuid
from typing import List, Optional

from fastapi import Depends, File, Form, HTTPException, UploadFile

from core import (
    api, db, iso, now_utc,
    current_user, require_role, APP_NAME,
)
from crm_helpers import _user_identifier
from storage_helpers import (
    put_object, _validate_upload,
    FLOOR_PLAN_ALLOWED_TYPES, FLOOR_PLAN_ALLOWED_EXTS,
)
from design_helpers import ensure_design_project, maybe_promote_to_quotation
from schemas import (
    DesignProjectOut, DesignImageOut,
    ImageReviewRequest, ImageReviewOut,
    DesignProjectStartOut, QuotationStatusRequest, OkResponse,
)


# ----- Customer view -----
@api.get("/design/my-project", response_model=Optional[DesignProjectOut])
async def design_my_project(user: dict = Depends(current_user)):
    project = await db.design_projects.find_one(
        {"user_id": user["user_id"]}, {"_id": 0}, sort=[("created_at", -1)]
    )
    if not project:
        return None
    return project


@api.put("/design/my-project/images/{image_id}/review", response_model=ImageReviewOut)
async def review_image(image_id: str, body: ImageReviewRequest, user: dict = Depends(current_user)):
    decision = (body.decision or "").strip()  # 'approved' | 'needs_improvement'
    comment = (body.comment or "").strip()
    if decision not in ("approved", "needs_improvement"):
        raise HTTPException(status_code=400, detail="decision must be 'approved' or 'needs_improvement'")
    if decision == "needs_improvement" and not comment:
        raise HTTPException(status_code=400, detail="Comment is required when requesting improvement")
    project = await db.design_projects.find_one(
        {"user_id": user["user_id"], "images.image_id": image_id}
    )
    if not project:
        raise HTTPException(status_code=404, detail="Image not found in your projects")
    await db.design_projects.update_one(
        {"project_id": project["project_id"], "images.image_id": image_id},
        {"$set": {
            "images.$.customer_status": decision,
            "images.$.customer_comment": comment or None,
            "images.$.reviewed_at": iso(now_utc()),
            "updated_at": iso(now_utc()),
        }}
    )
    promoted = await maybe_promote_to_quotation(project["project_id"])
    return {"ok": True, "ready_for_quotation": promoted}


# ----- Designer + Admin views -----
@api.get("/admin/design/projects", response_model=List[DesignProjectOut])
async def list_design_projects(
    status_filter: Optional[str] = None,
    user: dict = Depends(require_role("admin", "designer")),
):
    flt = {}
    if status_filter:
        flt["status"] = status_filter
    if user["role"] == "designer":
        flt["$or"] = [{"designer_id": _user_identifier(user)}, {"designer_id": None}]
    projects = await db.design_projects.find(flt, {"_id": 0}).sort([("created_at", -1)]).to_list(500)
    is_designer = user.get("role") == "designer"
    out = []
    for p in projects:
        u = await db.users.find_one(
            {"user_id": p["user_id"]},
            {"_id": 0, "email": 1, "name": 1, "mobile": 1, "project_name": 1, "site_visit_at": 1},
        ) or {}
        if is_designer:
            p["customer"] = {"name": u.get("name"), "project_name": u.get("project_name")}
        else:
            p["customer"] = u
        p["site_visit_at"] = u.get("site_visit_at")
        if p.get("lead_id"):
            ld = await db.leads.find_one(
                {"lead_id": p["lead_id"]},
                {"_id": 0, "lead_id": 1, "status": 1, "assigned_to": 1, "name": 1},
            )
            p["lead"] = ld
        out.append(p)
    return out


@api.get("/admin/design/projects/{project_id}", response_model=DesignProjectOut)
async def get_design_project(project_id: str, user: dict = Depends(require_role("admin", "designer"))):
    p = await db.design_projects.find_one({"project_id": project_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    u = await db.users.find_one(
        {"user_id": p["user_id"]},
        {"_id": 0, "email": 1, "name": 1, "mobile": 1, "project_name": 1, "site_visit_at": 1},
    ) or {}
    if user.get("role") == "designer":
        p["customer"] = {"name": u.get("name"), "project_name": u.get("project_name")}
    else:
        p["customer"] = u
    p["site_visit_at"] = u.get("site_visit_at")
    if p.get("lead_id"):
        ld = await db.leads.find_one(
            {"lead_id": p["lead_id"]},
            {"_id": 0, "lead_id": 1, "status": 1, "assigned_to": 1, "name": 1, "next_followup_at": 1},
        )
        p["lead"] = ld
    # Attach the linked verification's floor-plan files so the designer can
    # download them straight from the project detail view.
    if p.get("verification_id"):
        v = await db.verifications.find_one(
            {"verification_id": p["verification_id"]},
            {"_id": 0, "pdf_url": 1, "pdf_urls": 1, "room_requirements": 1,
             "property_type": 1, "bhk_or_units": 1, "budget_range": 1, "design_styles": 1},
        )
        p["verification"] = v
    return p


@api.post("/admin/design/projects/{project_id}/images", response_model=DesignImageOut)
async def upload_design_image(
    project_id: str,
    file: UploadFile = File(...),
    comment: str = Form(...),
    user: dict = Depends(require_role("admin", "designer")),
):
    if not (comment or "").strip():
        raise HTTPException(status_code=400, detail="Designer comment is required")
    data = await file.read()
    _validate_upload(file, data, FLOOR_PLAN_ALLOWED_TYPES, FLOOR_PLAN_ALLOWED_EXTS)
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else "bin"
    path = f"{APP_NAME}/designs/{project_id}/{uuid.uuid4().hex}.{ext}"
    result = put_object(path, data, file.content_type or "application/octet-stream")
    project = await db.design_projects.find_one({"project_id": project_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.get("status") != "in_progress":
        raise HTTPException(status_code=400, detail="Project is not in_progress")
    # Smart round assignment: if there are already pending images (from a
    # sequential batch upload in the same session), keep the same round number
    # so all images in one upload session share one round.  Only start a new
    # round when there are no pending images (i.e. all previous images have
    # already been reviewed by the customer).
    existing = project.get("images", [])
    pending_count = sum(1 for i in existing if i.get("customer_status") == "pending")
    max_existing_round = max([i.get("round", 1) for i in existing] + [0])
    next_round = max_existing_round if pending_count > 0 else max_existing_round + 1
    image = {
        "image_id": f"img_{uuid.uuid4().hex[:10]}",
        "url": f"/api/files/{result['path']}",
        "filename": file.filename,
        "designer_comment": comment.strip(),
        "customer_status": "pending",
        "customer_comment": None,
        "round": next_round,
        "uploaded_at": iso(now_utc()),
        "uploaded_by": _user_identifier(user),
        "reviewed_at": None,
    }
    update = {"$push": {"images": image},
              "$set": {"updated_at": iso(now_utc())}}
    if not project.get("designer_id"):
        update["$set"]["designer_id"] = _user_identifier(user)
    await db.design_projects.update_one({"project_id": project_id}, update)
    return image


@api.post("/admin/design/projects/start/{user_id}", response_model=DesignProjectStartOut)
async def admin_start_designing(user_id: str, user: dict = Depends(require_role("admin", "designer"))):
    target = await db.users.find_one({"user_id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="Customer not found")
    await db.users.update_one({"user_id": user_id}, {"$set": {"project_phase": "designing"}})
    project = await ensure_design_project(user_id)
    return {"ok": True, "project_id": project["project_id"]}


@api.post("/admin/design/projects/{project_id}/measurements", response_model=DesignProjectOut)
async def upload_site_measurements(
    project_id: str,
    notes: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    user: dict = Depends(require_role("admin", "designer")),
):
    project = await db.design_projects.find_one({"project_id": project_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    measurements = project.get("site_measurements", {})
    if notes is not None:
        measurements["notes"] = notes.strip()

    if file and file.filename:
        data = await file.read()
        _validate_upload(file, data, FLOOR_PLAN_ALLOWED_TYPES, FLOOR_PLAN_ALLOWED_EXTS)
        ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else "bin"
        path = f"{APP_NAME}/measurements/{project_id}/{uuid.uuid4().hex}.{ext}"
        result = put_object(path, data, file.content_type or "application/octet-stream")
        measurements["url"] = f"/api/files/{result['path']}"
        measurements["filename"] = file.filename

    await db.design_projects.update_one(
        {"project_id": project_id},
        {"$set": {
            "site_measurements": measurements,
            "updated_at": iso(now_utc())
        }}
    )
    
    project["site_measurements"] = measurements
    return project


@api.put("/admin/design/projects/{project_id}/quotation-status", response_model=OkResponse)
async def update_quotation_status(
    project_id: str,
    body: QuotationStatusRequest,
    user: dict = Depends(require_role("admin")),
):
    new_status = (body.quotation_status or "").strip()
    if not new_status:
        raise HTTPException(status_code=400, detail="quotation_status is required")
    if not await db.crm_statuses.find_one({"name": new_status}):
        raise HTTPException(status_code=400, detail=f"Unknown status: {new_status}")
    res = await db.design_projects.update_one(
        {"project_id": project_id, "status": "ready_for_quotation"},
        {"$set": {"quotation_status": new_status, "updated_at": iso(now_utc())}}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Project not in ready_for_quotation state")
    return {"ok": True}

