"""Homesqre Backend — single-file FastAPI app.

Includes:
  - JWT email/password auth (cookies + Bearer)
  - Emergent Google OAuth session exchange
  - Mock OTP verification
  - Object Storage uploads via Emergent integration
  - CRUD: listings, projects, inquiries, banks, amenities, cities/localities
  - Interior leads, loan leads, content CMS, search, admin
  - Homesqre Interiors: Verifications, Discovery Calls & 15-Min Auto-Router
  - Seeds on startup: admin/test users, banks, amenities, Bangalore cities + localities
"""

from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import uuid
import logging
import random
import re
import secrets
import asyncio
import csv
import io
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any

import bcrypt
import jwt
import requests
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from fastapi import (
    FastAPI, APIRouter, Request, Response, HTTPException, Depends,
    UploadFile, File, Form, Header, Query
)
from fastapi.responses import Response as RawResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr

# Local modules
from defaults import (
    SEED_BANKS,
    SEED_AMENITIES,
    BANGALORE_LOCALITIES,
    DEFAULT_HOMEPAGE_CONTENT,
    DEFAULT_INTERIORS_CONTENT,
)
from storage import get_storage

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALG = "HS256"
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
APP_NAME = os.environ.get("APP_NAME", "homesqre")
EMERGENT_AUTH_SESSION_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"

# Cookie flags — set COOKIE_SAMESITE=none + COOKIE_SECURE=true in production
# when frontend and backend are on different domains.
COOKIE_SAMESITE = os.environ.get("COOKIE_SAMESITE", "lax").lower()
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "false").lower() == "true"

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="Homesqre API")
api = APIRouter(prefix="/api")

# C-4 SECURITY PATCH: Restricted CORS Origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://homesqre.com", "http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _set_auth_cookie(response: Response, name: str, value: str) -> None:
    """Centralised cookie setter so SameSite/Secure stay consistent app-wide."""
    response.set_cookie(
        name,
        value,
        httponly=True,
        samesite=COOKIE_SAMESITE,
        secure=COOKIE_SECURE,
        max_age=604800,
        path="/",
    )

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s | %(message)s")
log = logging.getLogger("homesqre")

# ---------------------------------------------------------------------------
# Moderation helpers
# ---------------------------------------------------------------------------
MODERATION_STATUSES = {"pending", "approved", "rejected"}

def _public_status_filter(value: Optional[str]):
    """Build a Mongo filter for the public-facing list endpoints."""
    if value is None or value == "approved":
        return "approved"
    if value in ("all", ""):
        return None
    return value


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def now_utc() -> datetime:
    return datetime.now(timezone.utc)

def iso(dt: datetime) -> str:
    return dt.isoformat()

def slugify(text: str) -> str:
    text = (text or "").lower().strip()
    text = re.sub(r"[^a-z0-9\s-]", "", text)
    text = re.sub(r"[\s_-]+", "-", text)
    return text.strip("-") or uuid.uuid4().hex[:8]

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False

def make_access_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "type": "access",
        "exp": now_utc() + timedelta(days=7),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)

def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except Exception:
        return None

def clean_doc(doc: Optional[dict]) -> Optional[dict]:
    if doc is None:
        return None
    doc.pop("_id", None)
    doc.pop("password_hash", None)
    return doc

async def get_user_from_token(token: str) -> Optional[dict]:
    if not token:
        return None
    payload = decode_token(token)
    if payload and payload.get("type") == "access":
        user = await db.users.find_one({"user_id": payload["sub"]}, {"_id": 0, "password_hash": 0})
        if user:
            return user
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if session:
        expires_at = session["expires_at"]
        if isinstance(expires_at, str):
            expires_at = datetime.fromisoformat(expires_at)
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at >= now_utc():
            user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0, "password_hash": 0})
            return user
    return None

async def current_user(request: Request) -> dict:
    token = None
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth[7:]
    if not token:
        token = request.cookies.get("access_token") or request.cookies.get("session_token")
    user = await get_user_from_token(token) if token else None
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user

async def current_user_optional(request: Request) -> Optional[dict]:
    try:
        return await current_user(request)
    except HTTPException:
        return None

def require_role(*roles: str):
    async def _dep(user: dict = Depends(current_user)):
        if user.get("role") not in roles and user.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Forbidden")
        return user
    return _dep


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class RegisterRequest(BaseModel):
    name: str
    email: EmailStr
    mobile: str
    password: str
    role: str = "customer"

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class OtpVerifyRequest(BaseModel):
    email: EmailStr
    otp: str

class GoogleSessionRequest(BaseModel):
    session_id: str
    role: Optional[str] = "customer"

class ForgotRequest(BaseModel):
    email: EmailStr

class ResetRequest(BaseModel):
    token: str
    new_password: str

class DiscoveryCallCreate(BaseModel):
    name: str
    phone: str

class VerificationCreate(BaseModel):
    property_type: str
    bhk_or_units: str
    invoice_paid: float
    pdf_url: str
    room_requirements: str


# ---------------------------------------------------------------------------
# Object Storage
# ---------------------------------------------------------------------------
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


# ---------------------------------------------------------------------------
# Seeds
# ---------------------------------------------------------------------------
async def _migrate_status_fields():
    await db.listings.update_many({"status": "live"}, {"$set": {"status": "approved"}})
    await db.projects.update_many({"status": "live"}, {"$set": {"status": "approved"}})
    await db.localities.update_many(
        {"status": {"$exists": False}}, {"$set": {"status": "approved"}}
    )

async def seed_data():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.password_reset_tokens.create_index("expires_at", expireAfterSeconds=0)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.listings.create_index("slug", unique=True)
    await db.projects.create_index("slug", unique=True)

    admin_pwd = os.environ.get("ADMIN_PASSWORD")
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@homesqre.com")
    if admin_pwd:
        existing = await db.users.find_one({"email": admin_email})
        if not existing:
            await db.users.insert_one({
                "user_id": f"user_{uuid.uuid4().hex[:12]}",
                "email": admin_email,
                "name": "Homesqre Admin",
                "mobile": os.environ.get("ADMIN_MOBILE", "+919999999999"),
                "role": "admin",
                "is_verified": True,
                "profile_completed": True,
                "password_hash": hash_password(admin_pwd),
                "created_at": iso(now_utc()),
                "project_phase": "unpaid"
            })
            log.info(f"Admin user seeded: {admin_email}")

    if os.environ.get("SEED_DEMO_USERS", "false").lower() == "true":
        for email, pwd, role, name, mobile in [
            ("agent@homesqre.com", "Agent@2026", "agent", "Demo Agent", "+919999999991"),
            ("builder@homesqre.com", "Builder@2026", "builder", "Demo Builder", "+919999999992"),
            ("customer@homesqre.com", "Customer@2026", "customer", "Demo Customer", "+919999999993"),
        ]:
            existing = await db.users.find_one({"email": email})
            if existing:
                continue
            await db.users.insert_one({
                "user_id": f"user_{uuid.uuid4().hex[:12]}",
                "email": email,
                "name": name,
                "mobile": mobile,
                "role": role,
                "is_verified": True,
                "profile_completed": True,
                "password_hash": hash_password(pwd),
                "created_at": iso(now_utc()),
                "project_phase": "unpaid"
            })
        log.info("Demo users seeded (SEED_DEMO_USERS=true)")

    # Seed CMS content blobs (idempotent)
    for key, payload in [
        ("interiors", DEFAULT_INTERIORS_CONTENT),
        ("homepage", DEFAULT_HOMEPAGE_CONTENT),
    ]:
        existing = await db.content.find_one({"key": key})
        if not existing:
            await db.content.insert_one({
                "key": key,
                "data": payload,
                "updated_at": iso(now_utc()),
            })
            log.info(f"Content seeded: {key}")


# ---------------------------------------------------------------------------
# AUTH ROUTES
# ---------------------------------------------------------------------------
@api.post("/auth/register")
async def auth_register(body: RegisterRequest, response: Response):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
        
    # C-1 SECURITY PATCH: Force all new signups to be customers
    role = "customer" 
    
    otp = f"{secrets.randbelow(900000) + 100000}"
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    doc = {
        "user_id": user_id,
        "email": email,
        "name": body.name,
        "mobile": body.mobile,
        "role": role,
        "is_verified": False,
        "profile_completed": True,
        "password_hash": hash_password(body.password),
        "otp": otp,
        "otp_expires_at": iso(now_utc() + timedelta(minutes=10)),
        "created_at": iso(now_utc()),
        "project_phase": "unpaid"
    }
    await db.users.insert_one(doc)
    log.info(f"[OTP] OTP generated for {email}")
    token = make_access_token(user_id, email, role)
    _set_auth_cookie(response, "access_token", token)
    return {
        "user": {"user_id": user_id, "email": email, "name": body.name, "role": role,
                 "mobile": body.mobile, "is_verified": False, "profile_completed": True},
        "token": token,
    }

@api.post("/auth/verify-otp")
async def auth_verify_otp(body: OtpVerifyRequest):
    email = body.email.lower()
    user = await db.users.find_one({"email": email})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    otp_exp = user.get("otp_expires_at")
    if otp_exp:
        exp_dt = datetime.fromisoformat(otp_exp) if isinstance(otp_exp, str) else otp_exp
        if exp_dt.tzinfo is None:
            exp_dt = exp_dt.replace(tzinfo=timezone.utc)
        if exp_dt < now_utc():
            raise HTTPException(status_code=400, detail="OTP has expired")
    if not user.get("otp") or body.otp != user["otp"]:
        raise HTTPException(status_code=400, detail="Invalid OTP")
        
    await db.users.update_one(
        {"email": email},
        {"$set": {"is_verified": True}, "$unset": {"otp": "", "otp_expires_at": ""}}
    )
    return {"ok": True}

@api.post("/auth/login")
async def auth_login(body: LoginRequest, response: Response):
    email = body.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not user.get("password_hash") or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = make_access_token(user["user_id"], email, user["role"])
    _set_auth_cookie(response, "access_token", token)
    return {"user": clean_doc(user), "token": token}

@api.post("/auth/logout")
async def auth_logout(response: Response, request: Request):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("session_token", path="/")
    return {"ok": True}

@api.get("/auth/me")
async def auth_me(user: dict = Depends(current_user)):
    return user


# Client-initiated phase transitions (e.g. "unpaid" → "briefing" after payment).
# Backend-driven transitions (verification → scheduling etc.) happen via their
# dedicated admin endpoints — they are intentionally NOT permitted here.
ALLOWED_PHASE_TRANSITIONS = {
    "unpaid": {"briefing"},
}


@api.put("/me/phase")
async def update_my_phase(payload: dict, user: dict = Depends(current_user)):
    target = (payload.get("phase") or "").strip()
    current = (user.get("project_phase") or "unpaid")
    allowed_next = ALLOWED_PHASE_TRANSITIONS.get(current, set())
    if target not in allowed_next:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot transition from '{current}' to '{target}'"
        )
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"project_phase": target, "phase_updated_at": iso(now_utc())}}
    )
    return {"ok": True, "project_phase": target}

@api.post("/auth/forgot-password")
async def auth_forgot(body: ForgotRequest):
    user = await db.users.find_one({"email": body.email.lower()})
    if not user:
        return {"ok": True}
    token = secrets.token_urlsafe(32)
    await db.password_reset_tokens.insert_one({
        "token": token,
        "user_id": user["user_id"],
        "expires_at": now_utc() + timedelta(hours=1),
        "used": False,
    })
    log.info(f"[RESET] Password reset requested for {body.email.lower()}")
    return {"ok": True}

@api.post("/auth/reset-password")
async def auth_reset(body: ResetRequest):
    rec = await db.password_reset_tokens.find_one({"token": body.token, "used": False})
    if not rec:
        raise HTTPException(status_code=400, detail="Invalid or expired token")
    exp = rec["expires_at"]
    if isinstance(exp, str):
        exp = datetime.fromisoformat(exp)
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp < now_utc():
        raise HTTPException(status_code=400, detail="Token expired")
    await db.users.update_one(
        {"user_id": rec["user_id"]},
        {"$set": {"password_hash": hash_password(body.new_password)}},
    )
    await db.password_reset_tokens.update_one({"_id": rec["_id"]}, {"$set": {"used": True}})
    return {"ok": True}

# ---------------------------------------------------------------------------
# CUSTOM GOOGLE OAUTH
# ---------------------------------------------------------------------------
GOOGLE_CLIENT_ID = "792218859682-0c3n97260bmmnihocosutpm00vvliivt.apps.googleusercontent.com"

@api.post("/auth/google")
async def auth_google(body: dict, response: Response):
    token = body.get("token")
    if not token:
        raise HTTPException(status_code=400, detail="No token provided")
    try:
        idinfo = id_token.verify_oauth2_token(token, google_requests.Request(), GOOGLE_CLIENT_ID)
        email = idinfo['email'].lower()
    except Exception as e:
        log.error(f"Google token verification failed: {e}")
        raise HTTPException(status_code=400, detail="Invalid Google token")

    user = await db.users.find_one({"email": email})
    if not user:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        user = {
            "user_id": user_id,
            "email": email,
            "name": idinfo.get("name", ""),
            "picture": idinfo.get("picture", ""),
            "mobile": "",
            "role": "customer",
            "is_verified": True,
            "profile_completed": False,
            "project_phase": "unpaid",
            "created_at": iso(now_utc()),
        }
        await db.users.insert_one(user)
    
    token = make_access_token(user["user_id"], email, user["role"])
    _set_auth_cookie(response, "access_token", token)
    return {"user": clean_doc(user), "token": token}


# ---------------------------------------------------------------------------
# UPLOADS
# ---------------------------------------------------------------------------
# Allowed file types for customer floor-plan uploads. Used by the generic
# /upload endpoint plus dedicated /upload/floor-plan endpoint.
FLOOR_PLAN_ALLOWED_TYPES = {
    "image/png", "image/jpeg", "image/jpg", "image/webp", "application/pdf"
}
FLOOR_PLAN_ALLOWED_EXTS = {"png", "jpg", "jpeg", "webp", "pdf"}
MAX_UPLOAD_BYTES = 15 * 1024 * 1024  # 15 MB


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


# ---------------------------------------------------------------------------
# HOMESQRE CRM: UNIFIED LEADS + ADMIN-CUSTOMIZABLE STATUSES/SOURCES
# ---------------------------------------------------------------------------
# Default CRM settings seeded on first startup. Admin can extend/edit later.
DEFAULT_CRM_STATUSES = [
    {"name": "New",                          "sort_order": 0, "assign_to_role": "sales"},
    {"name": "No Answer / Not Reachable",    "sort_order": 1, "assign_to_role": "sales"},
    {"name": "Not Interested",               "sort_order": 2, "assign_to_role": None},
    {"name": "Send to Design",               "sort_order": 3, "assign_to_role": "designer"},
    {"name": "Awaiting Customer Approval",   "sort_order": 4, "assign_to_role": None},
]
DEFAULT_CRM_SOURCES = [
    {"name": "Website",   "sort_order": 0},
    {"name": "Reference", "sort_order": 1},
]
BUDGET_OPTIONS = [
    "Under ₹3L", "₹3L – ₹5L", "₹5L – ₹8L", "₹8L – ₹12L",
    "₹12L – ₹18L", "₹18L – ₹25L", "₹25L+", "Not Sure",
]


def _user_identifier(u: dict) -> str:
    """Stable identifier for assigned_to. Email is unique-by-construction."""
    return (u.get("email") or "").lower()


async def _round_robin_assignee(role: str) -> Optional[str]:
    """Pick next staff identifier (email) for a given role using round-robin."""
    users = await db.users.find(
        {"role": role},
        {"_id": 0, "email": 1, "created_at": 1}
    ).sort("created_at", 1).to_list(None)
    emails = [_user_identifier(u) for u in users if u.get("email")]
    if not emails:
        return None
    # Look at the most-recent lead assigned in this role's status pool to find rotation pointer.
    last = await db.leads.find_one(
        {"assigned_to": {"$in": emails}},
        sort=[("updated_at", -1)]
    )
    last_email = last.get("assigned_to") if last else None
    if last_email in emails:
        idx = (emails.index(last_email) + 1) % len(emails)
    else:
        idx = 0
    return emails[idx]


async def _auto_assign_for_status(status_name: str, current_assignee: Optional[str]) -> Optional[str]:
    """Return the user identifier to (re)assign this lead to based on its status'
    `assign_to_role`. Returns None if no rule or no eligible user; preserves
    current_assignee in that case (caller decides what to do with None)."""
    status_def = await db.crm_statuses.find_one({"name": status_name}, {"_id": 0})
    role = (status_def or {}).get("assign_to_role")
    if not role:
        return current_assignee  # No rule — keep existing assignee.
    return await _round_robin_assignee(role) or current_assignee


def _build_lead(payload: dict, created_by: str, default_status: str = "New") -> dict:
    return {
        "lead_id": f"lead_{uuid.uuid4().hex[:10]}",
        "name": (payload.get("name") or "").strip(),
        "phone": (payload.get("phone") or "").strip(),
        "email": (payload.get("email") or "").strip().lower(),
        "budget_range": payload.get("budget_range") or "",
        "message": payload.get("message") or "",
        "source": payload.get("source") or "Website",
        "status": payload.get("status") or default_status,
        "assigned_to": (payload.get("assigned_to") or "").lower() or None,
        "next_followup_at": payload.get("next_followup_at") or None,
        "comments": [],
        "history": [],
        "created_at": iso(now_utc()),
        "updated_at": iso(now_utc()),
        "created_by": created_by,
    }


def _append_history(updates: dict, from_status: str, to_status: str, by: str):
    updates.setdefault("$push", {})
    updates["$push"]["history"] = {
        "from_status": from_status, "to_status": to_status,
        "at": iso(now_utc()), "by": by,
    }


def _validate_status_source(status: Optional[str], source: Optional[str], known_statuses: List[str], known_sources: List[str]):
    if status and status not in known_statuses:
        raise HTTPException(status_code=400, detail=f"Unknown status: {status}")
    if source and source not in known_sources:
        raise HTTPException(status_code=400, detail=f"Unknown source: {source}")


# ----- CRM Settings: statuses -----
@api.get("/crm/statuses")
async def list_crm_statuses(user: dict = Depends(current_user)):
    docs = await db.crm_statuses.find({}, {"_id": 0}).sort("sort_order", 1).to_list(None)
    return docs


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


# ----- CRM Settings: sources -----
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


# ----- Public lead capture (from /interiors homepage and Customer dashboard CTAs) -----
@api.post("/leads/public")
async def create_public_lead(payload: dict):
    """Anonymous lead capture. Source defaults to 'Website'. Auto-assigns based
    on the default status rule (Sales)."""
    if not payload.get("name") or not payload.get("phone"):
        raise HTTPException(status_code=400, detail="Name and phone are required")
    lead = _build_lead(payload, created_by="public", default_status="New")
    lead["source"] = payload.get("source") or "Website"
    lead["assigned_to"] = await _auto_assign_for_status(lead["status"], None)
    await db.leads.insert_one(lead)
    log.info(f"[CRM] Public lead {lead['name']} created → assigned to {lead['assigned_to']}")
    return {"ok": True, "lead_id": lead["lead_id"]}


# ----- Backward-compat shims (homepage form + customer-dashboard CTA) -----
@api.post("/interior-leads")
async def create_interior_lead_shim(payload: Dict[str, Any]):
    """Compat shim — homepage interior-lead form. Maps richer fields into the
    unified `leads` collection and stores the original blob under `extra`."""
    if not (payload.get("name") and payload.get("phone")):
        raise HTTPException(status_code=400, detail="Name and phone are required")
    lead = _build_lead({
        "name": payload.get("name"),
        "phone": payload.get("phone"),
        "email": payload.get("email"),
        "budget_range": payload.get("budget") or "",
        "message": " | ".join([s for s in [
            payload.get("property_type"), payload.get("flat_size"),
            payload.get("style"), payload.get("move_in"),
            (f"Locality: {payload['locality']}" if payload.get("locality") else None),
        ] if s]),
        "source": "Website",
    }, created_by="public", default_status="New")
    lead["extra"] = {k: payload.get(k) for k in (
        "whatsapp", "property_type", "flat_size", "budget", "style", "move_in", "locality"
    )}
    lead["assigned_to"] = await _auto_assign_for_status(lead["status"], None)
    await db.leads.insert_one(lead)
    return {"ok": True, "lead_id": lead["lead_id"]}


@api.post("/discovery-calls")
async def create_discovery_call_shim(payload: DiscoveryCallCreate, user: Optional[dict] = Depends(current_user_optional)):
    """Compat shim — customer-dashboard discovery-call CTA. Writes to unified
    `leads` collection. Kept so existing frontend keeps working unchanged."""
    lead = _build_lead({
        "name": payload.name,
        "phone": payload.phone,
        "source": "Website",
    }, created_by=(user["email"].lower() if user else "public"), default_status="New")
    lead["extra"] = {"discovery_cta": True, "user_id": user["user_id"] if user else None}
    lead["assigned_to"] = await _auto_assign_for_status(lead["status"], None)
    await db.leads.insert_one(lead)
    lead.pop("_id", None)
    return {"call_id": lead["lead_id"], **lead}


# ----- Authenticated lead CRUD -----
def _lead_scope_filter(u: dict) -> dict:
    """Sales sees only own leads; admin sees everything."""
    if u.get("role") == "admin":
        return {}
    return {"assigned_to": _user_identifier(u)}


@api.get("/leads")
async def list_leads(
    user: dict = Depends(require_role("admin", "sales", "designer")),
    status: Optional[str] = None,
    source: Optional[str] = None,
    assigned_to: Optional[str] = None,
    q: Optional[str] = None,
    followup: Optional[str] = None,          # "today" | "overdue" | "upcoming"
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    limit: int = 200,
    offset: int = 0,
):
    flt: dict = _lead_scope_filter(user)
    if status:
        flt["status"] = status
    if source:
        flt["source"] = source
    if assigned_to and user.get("role") == "admin":
        flt["assigned_to"] = assigned_to.lower()
    if q:
        rx = {"$regex": re.escape(q), "$options": "i"}
        flt["$or"] = [{"name": rx}, {"phone": rx}, {"email": rx}]
    if from_date:
        flt.setdefault("created_at", {})["$gte"] = from_date
    if to_date:
        flt.setdefault("created_at", {})["$lte"] = to_date
    if followup:
        today = now_utc().date().isoformat()
        if followup == "today":
            flt["next_followup_at"] = {"$gte": today, "$lt": today + "T23:59:59"}
        elif followup == "overdue":
            flt["next_followup_at"] = {"$lt": today}
        elif followup == "upcoming":
            flt["next_followup_at"] = {"$gte": today}
    docs = await db.leads.find(flt, {"_id": 0}).sort([("updated_at", -1)]).skip(offset).limit(min(limit, 1000)).to_list(None)
    total = await db.leads.count_documents(flt)
    return {"items": docs, "total": total}


@api.get("/leads/export.csv")
async def export_leads_csv(user: dict = Depends(require_role("admin"))):
    docs = await db.leads.find({}, {"_id": 0}).sort([("created_at", -1)]).to_list(None)
    cols = ["lead_id", "name", "phone", "email", "budget_range", "message",
            "source", "status", "assigned_to", "next_followup_at",
            "created_at", "updated_at", "created_by"]
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(cols + ["comments"])
    for d in docs:
        row = [d.get(c, "") for c in cols]
        comments = " | ".join(f"[{c.get('at','')}] {c.get('by_name') or c.get('by','')}: {c.get('text','')}"
                              for c in d.get("comments", []))
        writer.writerow(row + [comments])
    out.seek(0)
    return RawResponse(
        content=out.getvalue().encode("utf-8"),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="leads.csv"'},
    )


@api.get("/leads/{lead_id}")
async def get_lead(lead_id: str, user: dict = Depends(require_role("admin", "sales", "designer"))):
    lead = await db.leads.find_one({"lead_id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    if user.get("role") != "admin" and (lead.get("assigned_to") or "") != _user_identifier(user):
        raise HTTPException(status_code=403, detail="Not your lead")
    return lead


@api.post("/leads")
async def create_lead(payload: dict, user: dict = Depends(require_role("admin", "sales"))):
    if not payload.get("name") or not payload.get("phone"):
        raise HTTPException(status_code=400, detail="Name and phone are required")
    statuses = [s["name"] for s in await db.crm_statuses.find({}, {"name": 1}).to_list(None)]
    sources = [s["name"] for s in await db.crm_sources.find({}, {"name": 1}).to_list(None)]
    _validate_status_source(payload.get("status"), payload.get("source"), statuses, sources)
    lead = _build_lead(payload, created_by=_user_identifier(user))
    # Sales auto-assigns to themselves; admin may pass assigned_to explicitly,
    # otherwise we apply the status' default-role rule.
    if user.get("role") == "sales":
        lead["assigned_to"] = _user_identifier(user)
    elif not lead["assigned_to"]:
        lead["assigned_to"] = await _auto_assign_for_status(lead["status"], None)
    await db.leads.insert_one(lead)
    return clean_doc(lead)


@api.put("/leads/{lead_id}")
async def update_lead(lead_id: str, payload: dict, user: dict = Depends(require_role("admin"))):
    """Admin-only full update (basic fields). Sales uses the focused endpoints
    below (status / comment / followup)."""
    lead = await db.leads.find_one({"lead_id": lead_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    allowed = {"name", "phone", "email", "budget_range", "message", "source", "next_followup_at", "assigned_to"}
    update = {k: payload[k] for k in payload if k in allowed}
    if "email" in update:
        update["email"] = (update["email"] or "").strip().lower()
    if "assigned_to" in update:
        update["assigned_to"] = (update["assigned_to"] or "").lower() or None
    if not update:
        raise HTTPException(status_code=400, detail="No editable fields supplied")
    update["updated_at"] = iso(now_utc())
    await db.leads.update_one({"lead_id": lead_id}, {"$set": update})
    return {"ok": True}


@api.delete("/leads/{lead_id}")
async def delete_lead(lead_id: str, user: dict = Depends(require_role("admin"))):
    res = await db.leads.delete_one({"lead_id": lead_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Lead not found")
    return {"ok": True}


@api.put("/leads/{lead_id}/status")
async def update_lead_status(lead_id: str, payload: dict, user: dict = Depends(require_role("admin", "sales"))):
    new_status = (payload.get("status") or "").strip()
    if not new_status:
        raise HTTPException(status_code=400, detail="status is required")
    lead = await db.leads.find_one({"lead_id": lead_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    if user.get("role") != "admin" and (lead.get("assigned_to") or "") != _user_identifier(user):
        raise HTTPException(status_code=403, detail="Not your lead")
    if not await db.crm_statuses.find_one({"name": new_status}):
        raise HTTPException(status_code=400, detail=f"Unknown status: {new_status}")
    old_status = lead.get("status")
    next_assignee = await _auto_assign_for_status(new_status, lead.get("assigned_to"))
    update = {
        "status": new_status,
        "assigned_to": next_assignee,
        "updated_at": iso(now_utc()),
    }
    await db.leads.update_one(
        {"lead_id": lead_id},
        {"$set": update,
         "$push": {"history": {"from_status": old_status, "to_status": new_status,
                                "at": iso(now_utc()), "by": _user_identifier(user)}}}
    )
    return {"ok": True, "assigned_to": next_assignee}


@api.post("/leads/{lead_id}/comments")
async def add_lead_comment(lead_id: str, payload: dict, user: dict = Depends(require_role("admin", "sales", "designer"))):
    text = (payload.get("text") or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Comment text is required")
    lead = await db.leads.find_one({"lead_id": lead_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    if user.get("role") != "admin" and (lead.get("assigned_to") or "") != _user_identifier(user):
        raise HTTPException(status_code=403, detail="Not your lead")
    comment = {
        "id": f"c_{uuid.uuid4().hex[:8]}",
        "by": _user_identifier(user),
        "by_name": user.get("name") or _user_identifier(user),
        "text": text,
        "at": iso(now_utc()),
    }
    await db.leads.update_one(
        {"lead_id": lead_id},
        {"$push": {"comments": comment}, "$set": {"updated_at": iso(now_utc())}}
    )
    return comment


@api.put("/leads/{lead_id}/followup")
async def set_lead_followup(lead_id: str, payload: dict, user: dict = Depends(require_role("admin", "sales"))):
    when = payload.get("next_followup_at")  # ISO string or null
    lead = await db.leads.find_one({"lead_id": lead_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    if user.get("role") != "admin" and (lead.get("assigned_to") or "") != _user_identifier(user):
        raise HTTPException(status_code=403, detail="Not your lead")
    await db.leads.update_one(
        {"lead_id": lead_id},
        {"$set": {"next_followup_at": when, "updated_at": iso(now_utc())}}
    )
    return {"ok": True}


# ----- CRM seeding + migration -----
async def _seed_crm_defaults():
    if await db.crm_statuses.count_documents({}) == 0:
        await db.crm_statuses.insert_many([dict(s) for s in DEFAULT_CRM_STATUSES])
        log.info("[CRM] Seeded default statuses")
    if await db.crm_sources.count_documents({}) == 0:
        await db.crm_sources.insert_many([dict(s) for s in DEFAULT_CRM_SOURCES])
        log.info("[CRM] Seeded default sources")


async def _migrate_to_unified_leads():
    """Idempotent: migrate `interior_leads` and `discovery_calls` into `leads`.
    Marks originals with `migrated=True` so a re-run is a no-op."""
    migrated_count = 0
    async for d in db.interior_leads.find({"migrated": {"$ne": True}}):
        lead = _build_lead({
            "name": d.get("name"), "phone": d.get("phone"), "email": d.get("email"),
            "budget_range": d.get("budget") or "",
            "message": " | ".join(s for s in [d.get("property_type"), d.get("flat_size"),
                                              d.get("style"), d.get("move_in"),
                                              (f"Locality: {d['locality']}" if d.get("locality") else None)] if s),
            "source": "Website",
        }, created_by="migration", default_status="New")
        lead["created_at"] = d.get("created_at") or lead["created_at"]
        lead["extra"] = {"migrated_from": "interior_leads", "original_id": d.get("lead_id")}
        await db.leads.insert_one(lead)
        await db.interior_leads.update_one({"_id": d["_id"]}, {"$set": {"migrated": True}})
        migrated_count += 1
    async for d in db.discovery_calls.find({"migrated": {"$ne": True}}):
        lead = _build_lead({
            "name": d.get("name"), "phone": d.get("phone"),
            "source": "Website",
        }, created_by="migration", default_status="New")
        lead["created_at"] = d.get("created_at") or lead["created_at"]
        # Carry over the legacy assignee if it matches a real user email; else
        # let the auto-assign rule fill it.
        legacy_assignee = d.get("assigned_to")
        if legacy_assignee:
            existing = await db.users.find_one(
                {"$or": [{"email": legacy_assignee.lower()}, {"name": legacy_assignee}]},
                {"_id": 0, "email": 1}
            )
            lead["assigned_to"] = (existing["email"] if existing else
                                   await _auto_assign_for_status(lead["status"], None))
        else:
            lead["assigned_to"] = await _auto_assign_for_status(lead["status"], None)
        lead["extra"] = {"migrated_from": "discovery_calls", "original_id": d.get("call_id")}
        await db.leads.insert_one(lead)
        await db.discovery_calls.update_one({"_id": d["_id"]}, {"$set": {"migrated": True}})
        migrated_count += 1
    if migrated_count:
        log.info(f"[CRM] Migrated {migrated_count} legacy leads into unified `leads` collection")


# ---------------------------------------------------------------------------
# HOMESQRE INTERIORS: PACKAGE PRICING + FLOOR PLAN VERIFICATION QUEUE
# ---------------------------------------------------------------------------
# Canonical package pricing — must stay in sync with the customer-dashboard
# checkout calculator. Owns the math; designer cannot enter a custom amount.
def calculate_package_price(property_type: str, bhk_or_units: Any) -> int:
    pt = (property_type or "").strip().lower()
    spec = str(bhk_or_units or "").strip().lower()
    if pt == "apartment":
        if spec in ("1-2", "1", "2", "1bhk", "2bhk"):
            return 10000
        if spec in ("3", "3bhk"):
            return 12000
        if spec in ("4+", "4", "4bhk", "5", "5bhk"):
            return 15000
        return 0
    if pt == "villa":
        if spec in ("duplex",):
            return 15000
        if spec in ("triplex",):
            return 18000
        return 0
    if pt == "independent":
        try:
            n = int(spec)
        except (TypeError, ValueError):
            return 0
        if n <= 1:
            return 12000
        return max(20000, 6000 * n)
    return 0


PACKAGE_OPTIONS = {
    "apartment":   [{"value": "1-2", "label": "1–2 BHK", "price": 10000},
                    {"value": "3",   "label": "3 BHK",   "price": 12000},
                    {"value": "4+",  "label": "4+ BHK",  "price": 15000}],
    "villa":       [{"value": "duplex",  "label": "Duplex",  "price": 15000},
                    {"value": "triplex", "label": "Triplex", "price": 18000}],
    "independent": [{"value": "1", "label": "1 unit (Rental/Independent)", "price": 12000},
                    {"value": "2", "label": "2 units", "price": 20000},
                    {"value": "3", "label": "3 units", "price": 20000},
                    {"value": "4", "label": "4 units", "price": 24000},
                    {"value": "5", "label": "5 units", "price": 30000}],
}


@api.get("/packages")
async def list_packages():
    """Designer dashboard reads this to populate the corrected-package dropdown."""
    return PACKAGE_OPTIONS


@api.post("/verifications")
async def create_verification(payload: VerificationCreate, user: dict = Depends(current_user)):
    ver_id = f"ver_{uuid.uuid4().hex[:10]}"
    rec = {
        "verification_id": ver_id,
        "user_id": user["user_id"],
        "property_type": payload.property_type,
        "bhk_or_units": payload.bhk_or_units,
        "invoice_paid": payload.invoice_paid,
        "pdf_url": payload.pdf_url,
        "room_requirements": payload.room_requirements,
        "status": "pending",
        "created_at": iso(now_utc()),
    }
    await db.verifications.insert_one(rec)
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"project_phase": "verification"}})
    return clean_doc(rec)


@api.get("/admin/verifications")
async def admin_list_verifications(user: dict = Depends(require_role("admin", "designer"))):
    return await db.verifications.find({}, {"_id": 0}).sort([("created_at", -1)]).to_list(500)


@api.put("/admin/verifications/{ver_id}")
async def admin_moderate_verification(
    ver_id: str,
    payload: dict,
    user: dict = Depends(require_role("admin", "designer")),
):
    """Approve → push customer into 'scheduling'.
    reject_package → designer selects corrected package; backend auto-calculates
    the differential customer must pay. No manual amount input from designer.
    """
    action = payload.get("action")
    ver = await db.verifications.find_one({"verification_id": ver_id})
    if not ver:
        raise HTTPException(status_code=404, detail="Verification not found")

    if action == "approve":
        await db.verifications.update_one(
            {"verification_id": ver_id},
            {"$set": {"status": "approved", "moderated_by": _user_identifier(user),
                      "moderated_at": iso(now_utc())}}
        )
        await db.users.update_one(
            {"user_id": ver["user_id"]},
            {"$set": {"project_phase": "scheduling"}}
        )
        return {"ok": True}

    if action == "reject_package":
        corrected_pt = (payload.get("corrected_property_type") or "").strip()
        corrected_spec = payload.get("corrected_bhk_or_units")
        if not corrected_pt or corrected_spec in (None, ""):
            raise HTTPException(status_code=400, detail="corrected_property_type and corrected_bhk_or_units are required")
        new_price = calculate_package_price(corrected_pt, corrected_spec)
        if new_price <= 0:
            raise HTTPException(status_code=400, detail="Unknown package combination")
        invoice_paid = float(ver.get("invoice_paid") or 0)
        differential = max(0, new_price - int(invoice_paid))
        update = {
            "status": "package_mismatch",
            "corrected_property_type": corrected_pt,
            "corrected_bhk_or_units": str(corrected_spec),
            "corrected_price": new_price,
            "differential_amount": differential,
            "rejection_reason": payload.get("reason") or "Floor plan did not match selected package",
            "moderated_by": _user_identifier(user),
            "moderated_at": iso(now_utc()),
        }
        await db.verifications.update_one({"verification_id": ver_id}, {"$set": update})
        # If price already covered, treat as accepted — bypass payment, push to designing.
        if differential == 0:
            await db.verifications.update_one(
                {"verification_id": ver_id},
                {"$set": {"status": "package_adjusted_paid"}}
            )
            await db.users.update_one(
                {"user_id": ver["user_id"]},
                {"$set": {"project_phase": "designing"}}
            )
            return {"ok": True, "differential_amount": 0, "auto_approved": True}
        # Otherwise: customer must pay the differential before designing begins.
        await db.users.update_one(
            {"user_id": ver["user_id"]},
            {"$set": {
                "project_phase": "package_adjustment",
                "package_adjustment": {
                    "verification_id": ver_id,
                    "corrected_property_type": corrected_pt,
                    "corrected_bhk_or_units": str(corrected_spec),
                    "corrected_price": new_price,
                    "invoice_paid": int(invoice_paid),
                    "differential_amount": differential,
                    "raised_at": iso(now_utc()),
                },
            }}
        )
        return {"ok": True, "differential_amount": differential, "auto_approved": False}

    # Legacy "reject" with explicit deficit_amount — preserved for back-compat
    if action == "reject":
        deficit_amount = payload.get("deficit_amount", 0)
        await db.verifications.update_one(
            {"verification_id": ver_id},
            {"$set": {"status": "rejected", "deficit_amount": deficit_amount}}
        )
        await db.users.update_one(
            {"user_id": ver["user_id"]},
            {"$set": {"project_phase": "unpaid", "deficit_due": deficit_amount}}
        )
        return {"ok": True}

    raise HTTPException(status_code=400, detail=f"Unknown action: {action}")


@api.post("/me/pay-package-adjustment")
async def pay_package_adjustment(user: dict = Depends(current_user)):
    """Customer-facing payment endpoint for the package-mismatch differential.
    On success: marks the verification as paid and advances phase to 'designing'.
    NOTE: real payment integration (Razorpay) will replace this stub by calling
    the same logic from the payment-success webhook. The differential AMOUNT is
    canonical from the verification record — it cannot be tampered with by the
    client."""
    adj = user.get("package_adjustment")
    if not adj or not adj.get("verification_id"):
        raise HTTPException(status_code=400, detail="No pending package adjustment")
    ver_id = adj["verification_id"]
    ver = await db.verifications.find_one({"verification_id": ver_id})
    if not ver or ver.get("status") != "package_mismatch":
        raise HTTPException(status_code=400, detail="Verification is not in package_mismatch state")
    await db.verifications.update_one(
        {"verification_id": ver_id},
        {"$set": {
            "status": "package_adjusted_paid",
            "differential_paid_at": iso(now_utc()),
            "final_invoice": int(ver.get("invoice_paid") or 0) + int(adj.get("differential_amount") or 0),
        }}
    )
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"project_phase": "designing"},
         "$unset": {"package_adjustment": ""}}
    )
    await _ensure_design_project(user["user_id"], verification_id=ver_id)
    return {"ok": True, "final_invoice": int(ver.get("invoice_paid") or 0) + int(adj.get("differential_amount") or 0)}


# ---------------------------------------------------------------------------
# PHASE C — 3D DESIGN ITERATION LOOP
# ---------------------------------------------------------------------------
# Workflow:
#   1. Customer reaches phase=designing (via Phase B pay OR admin start)
#   2. Backend lazily creates a design_project for them
#   3. Designer uploads images, each with a mandatory comment
#   4. Customer per-image: Approve OR Need Improvement (mandatory comment)
#   5. Designer can upload more images at any time (typically replacements)
#   6. When ALL images are approved AND >=1 image exists → project flips to
#      'ready_for_quotation', user phase advances, admin sees in dedicated tab.
async def _ensure_design_project(user_id: str, verification_id: Optional[str] = None) -> dict:
    existing = await db.design_projects.find_one({"user_id": user_id, "status": {"$in": ["in_progress", "ready_for_quotation"]}})
    if existing:
        return existing
    rec = {
        "project_id": f"dp_{uuid.uuid4().hex[:10]}",
        "user_id": user_id,
        "verification_id": verification_id,
        "designer_id": None,         # claimed when first designer uploads an image
        "status": "in_progress",
        "quotation_status": None,    # set when ready_for_quotation: admin uses crm_statuses
        "images": [],
        "created_at": iso(now_utc()),
        "updated_at": iso(now_utc()),
    }
    await db.design_projects.insert_one(rec)
    rec.pop("_id", None)
    log.info(f"[DESIGN] Created project {rec['project_id']} for user {user_id}")
    return rec


def _project_all_approved(project: dict) -> bool:
    imgs = project.get("images", [])
    return len(imgs) > 0 and all(i.get("customer_status") == "approved" for i in imgs)


async def _maybe_promote_to_quotation(project_id: str) -> bool:
    project = await db.design_projects.find_one({"project_id": project_id})
    if not project or project.get("status") != "in_progress":
        return False
    if not _project_all_approved(project):
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
    log.info(f"[DESIGN] Project {project_id} promoted to ready_for_quotation")
    return True


# ----- Customer view -----
@api.get("/design/my-project")
async def design_my_project(user: dict = Depends(current_user)):
    project = await db.design_projects.find_one({"user_id": user["user_id"]}, {"_id": 0}, sort=[("created_at", -1)])
    if not project:
        return None
    return project


@api.put("/design/my-project/images/{image_id}/review")
async def review_image(image_id: str, payload: dict, user: dict = Depends(current_user)):
    decision = (payload.get("decision") or "").strip()  # 'approved' | 'needs_improvement'
    comment = (payload.get("comment") or "").strip()
    if decision not in ("approved", "needs_improvement"):
        raise HTTPException(status_code=400, detail="decision must be 'approved' or 'needs_improvement'")
    if decision == "needs_improvement" and not comment:
        raise HTTPException(status_code=400, detail="Comment is required when requesting improvement")
    project = await db.design_projects.find_one({"user_id": user["user_id"], "images.image_id": image_id})
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
    promoted = await _maybe_promote_to_quotation(project["project_id"])
    return {"ok": True, "ready_for_quotation": promoted}


# ----- Designer + Admin views -----
@api.get("/admin/design/projects")
async def list_design_projects(
    status_filter: Optional[str] = None,
    user: dict = Depends(require_role("admin", "designer")),
):
    flt = {}
    if status_filter:
        flt["status"] = status_filter
    if user["role"] == "designer":
        # Designer sees: (a) projects already claimed by them, (b) unclaimed projects
        flt["$or"] = [{"designer_id": _user_identifier(user)}, {"designer_id": None}]
    projects = await db.design_projects.find(flt, {"_id": 0}).sort([("created_at", -1)]).to_list(500)
    # Attach minimal customer info for the queue UI
    out = []
    for p in projects:
        u = await db.users.find_one({"user_id": p["user_id"]}, {"_id": 0, "email": 1, "name": 1, "mobile": 1})
        p["customer"] = u or {}
        out.append(p)
    return out


@api.get("/admin/design/projects/{project_id}")
async def get_design_project(project_id: str, user: dict = Depends(require_role("admin", "designer"))):
    p = await db.design_projects.find_one({"project_id": project_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    u = await db.users.find_one({"user_id": p["user_id"]}, {"_id": 0, "email": 1, "name": 1, "mobile": 1})
    p["customer"] = u or {}
    return p


@api.post("/admin/design/projects/{project_id}/images")
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
    # Round = max(existing round) + 1 if any current images have a comment from customer
    next_round = max([i.get("round", 1) for i in project.get("images", [])] + [0]) + 1
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


@api.post("/admin/design/projects/start/{user_id}")
async def admin_start_designing(user_id: str, user: dict = Depends(require_role("admin", "designer"))):
    target = await db.users.find_one({"user_id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="Customer not found")
    await db.users.update_one({"user_id": user_id}, {"$set": {"project_phase": "designing"}})
    project = await _ensure_design_project(user_id)
    return {"ok": True, "project_id": project["project_id"]}


@api.put("/admin/design/projects/{project_id}/quotation-status")
async def update_quotation_status(
    project_id: str,
    payload: dict,
    user: dict = Depends(require_role("admin")),
):
    new_status = (payload.get("quotation_status") or "").strip()
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


# ---------------------------------------------------------------------------
# TEAM MANAGEMENT
# ---------------------------------------------------------------------------
@api.get("/admin/employees")
async def list_employees(user: dict = Depends(require_role("admin"))):
    """Fetches the list of all staff members for the admin table."""
    return await db.users.find(
        {"role": {"$in": ["sales", "designer", "admin"]}}, 
        {"_id": 0, "password_hash": 0}
    ).to_list(100)

@api.post("/admin/employees")
async def create_team_member(payload: dict, user: dict = Depends(require_role("admin"))):
    """Creates a brand new staff account from the admin dashboard."""
    email = payload.get("email", "").lower()
    phone = payload.get("phone", "")
    new_role = payload.get("role")
    temp_password = payload.get("password")

    if not email or not new_role or not temp_password:
        raise HTTPException(status_code=400, detail="Email, role, and temporary password are required")

    # 1. Check if they already exist
    existing_user = await db.users.find_one({"email": email})
    if existing_user:
        raise HTTPException(status_code=400, detail="An account with this email already exists.")

    # 2. Create the new staff account directly
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    new_user = {
        "user_id": user_id,
        "email": email,
        "name": "Team Member", # They can update their name later in their profile
        "mobile": phone,
        "role": new_role,
        "is_verified": True, # Pre-verified since the Admin created it
        "profile_completed": True,
        "password_hash": hash_password(temp_password),
        "created_at": iso(now_utc()),
        "project_phase": "unpaid"
    }
    
    await db.users.insert_one(new_user)
    return {"ok": True, "message": f"Successfully created {new_role} account for {email}!"}

@api.delete("/admin/employees/{email}")
async def delete_team_member(email: str, user: dict = Depends(require_role("admin"))):
    """Deletes a staff account."""
    # Safety check: prevent the main admin from accidentally deleting themselves
    if email == user.get("email"):
        raise HTTPException(status_code=400, detail="You cannot delete your own admin account.")

    result = await db.users.delete_one({"email": email})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {"ok": True, "message": f"Successfully deleted {email}"}

@api.put("/admin/employees/{email}")
async def update_team_member(email: str, payload: dict, user: dict = Depends(require_role("admin"))):
    """Updates a staff account's role."""
    new_role = payload.get("role")
    if not new_role:
        raise HTTPException(status_code=400, detail="Role is required")

    result = await db.users.update_one({"email": email}, {"$set": {"role": new_role}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
        
    return {"ok": True, "message": f"Successfully updated {email} to {new_role}"}

# ---------------------------------------------------------------------------
# Public content (CMS) + interior leads
# ---------------------------------------------------------------------------
@api.get("/content/{key}")
async def get_content(key: str):
    doc = await db.content.find_one({"key": key})
    defaults_map = {"interiors": DEFAULT_INTERIORS_CONTENT, "homepage": DEFAULT_HOMEPAGE_CONTENT}
    # Accept either schema: new docs use `data`, legacy docs may use `value`
    if doc:
        payload = doc.get("data") or doc.get("value")
        if isinstance(payload, dict) and payload:
            return payload
    # Fallback to defaults if doc missing or empty (handles legacy/stale docs in prod)
    if key in defaults_map:
        return defaults_map[key]
    raise HTTPException(status_code=404, detail="Content not found")


# ---------------------------------------------------------------------------
# Health + startup
# ---------------------------------------------------------------------------
@api.get("/")
async def root():
    return {"ok": True, "service": "homesqre"}

app.include_router(api)

@app.on_event("startup")
async def startup_event():
    try:
        init_storage()
    except Exception as e:
        log.warning(f"storage init: {e}")
    try:
        await seed_data()
        await _migrate_status_fields()
        await _seed_crm_defaults()
        await _migrate_to_unified_leads()
        log.info("Seeds ensured")
    except Exception as e:
        log.error(f"seed failed: {e}")

@app.on_event("shutdown")
async def shutdown_event():
    client.close()
