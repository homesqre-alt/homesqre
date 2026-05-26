"""Object-storage upload helpers shared by all upload-capable routes."""
from fastapi import HTTPException, UploadFile
from storage import get_storage
from core import log


# Allowed file types for customer floor-plan and designer render uploads.
FLOOR_PLAN_ALLOWED_TYPES = {
    "image/png", "image/jpeg", "image/jpg", "image/webp", "application/pdf"
}
FLOOR_PLAN_ALLOWED_EXTS = {"png", "jpg", "jpeg", "webp", "pdf"}
MAX_UPLOAD_BYTES = 15 * 1024 * 1024  # 15 MB


def init_storage():
    try:
        get_storage()
        log.info("Storage backend ready")
    except Exception as e:
        log.warning(f"Storage init: {e}")


def put_object(path: str, data: bytes, content_type: str) -> dict:
    try:
        return get_storage().put(path, data, content_type)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Storage unavailable: {e}")


def get_object(path: str):
    try:
        return get_storage().get(path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Storage unavailable: {e}")


def _validate_upload(file: UploadFile, data: bytes, allowed_types: set, allowed_exts: set):
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File too large (max 15 MB)")
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else ""
    ctype = (file.content_type or "").lower()
    if ext not in allowed_exts and ctype not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail="Only PNG, JPG, JPEG, WEBP, or PDF files are allowed."
        )
