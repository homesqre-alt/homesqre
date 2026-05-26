"""File-upload + serve routes — generic /upload and /files/{path}."""
import uuid

from fastapi import Depends, File, HTTPException, UploadFile
from fastapi.responses import Response as RawResponse

from core import api, db, iso, now_utc, current_user, APP_NAME
from storage_helpers import (
    put_object, get_object, _validate_upload,
    FLOOR_PLAN_ALLOWED_TYPES, FLOOR_PLAN_ALLOWED_EXTS,
)


@api.post("/upload")
async def upload_file(file: UploadFile = File(...), user: dict = Depends(current_user)):
    data = await file.read()
    _validate_upload(file, data, FLOOR_PLAN_ALLOWED_TYPES, FLOOR_PLAN_ALLOWED_EXTS)
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else "bin"
    path = f"{APP_NAME}/uploads/{user['user_id']}/{uuid.uuid4().hex}.{ext}"
    result = put_object(path, data, file.content_type or "application/octet-stream")
    rec = {
        "file_id": f"f_{uuid.uuid4().hex[:12]}",
        "storage_path": result["path"],
        "original_filename": file.filename,
        "content_type": file.content_type or "application/octet-stream",
        "size": result.get("size", len(data)),
        "owner_id": user["user_id"],
        "is_deleted": False,
        "created_at": iso(now_utc()),
    }
    await db.files.insert_one(rec)
    return {"file_id": rec["file_id"], "url": f"/api/files/{result['path']}", "path": result["path"]}


@api.get("/files/{path:path}")
async def serve_file(path: str):
    rec = await db.files.find_one({"storage_path": path, "is_deleted": False})
    if not rec:
        raise HTTPException(status_code=404, detail="File not found")
    data, ct = get_object(path)
    return RawResponse(content=data, media_type=rec.get("content_type", ct))
