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
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any

import bcrypt
import jwt
import requests
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from fastapi import (
    FastAPI, APIRouter, Request, Response, HTTPException, Depends,
    UploadFile, File, Header, Query
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
@api.post("/upload")
async def upload_file(file: UploadFile = File(...), user: dict = Depends(current_user)):
    data = await file.read()
    ext = file.filename.split(".")[-1] if "." in file.filename else "bin"
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
# HOMESQRE INTERIORS: DISCOVERY CALLS & AUTO-ROUTING
# ---------------------------------------------------------------------------
@api.post("/discovery-calls")
async def create_discovery_call(payload: DiscoveryCallCreate, user: Optional[dict] = Depends(current_user_optional)):
    call_id = f"call_{uuid.uuid4().hex[:10]}"
    rec = {
        "call_id": call_id,
        "user_id": user["user_id"] if user else None,
        "name": payload.name,
        "phone": payload.phone,
        "assigned_to": "Girish", 
        "status": "pending",
        "assigned_at": iso(now_utc()),
        "created_at": iso(now_utc()),
    }
    await db.discovery_calls.insert_one(rec)
    return clean_doc(rec)

@api.get("/admin/discovery-calls")
async def admin_list_discovery_calls(user: dict = Depends(require_role("admin", "sales"))):
    return await db.discovery_calls.find({}, {"_id": 0}).sort([("created_at", -1)]).to_list(500)

@api.put("/admin/discovery-calls/{call_id}/status")
async def admin_update_call_status(call_id: str, payload: dict, user: dict = Depends(require_role("admin", "sales"))):
    new_status = payload.get("status")
    if new_status not in ["pending", "connected", "missed"]:
        raise HTTPException(status_code=400, detail="Invalid status")
    
    await db.discovery_calls.update_one(
        {"call_id": call_id}, 
        {"$set": {"status": new_status, "updated_by": user["user_id"], "updated_at": iso(now_utc())}}
    )
    return {"ok": True}


# ---------------------------------------------------------------------------
# HOMESQRE INTERIORS: FLOOR PLAN VERIFICATION QUEUE
# ---------------------------------------------------------------------------
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
async def admin_moderate_verification(ver_id: str, payload: dict, user: dict = Depends(require_role("admin", "designer"))):
    action = payload.get("action")
    deficit_amount = payload.get("deficit_amount", 0)
    ver = await db.verifications.find_one({"verification_id": ver_id})
    
    if not ver:
        raise HTTPException(status_code=404, detail="Not found")

    if action == "approve":
        await db.verifications.update_one({"verification_id": ver_id}, {"$set": {"status": "approved"}})
        await db.users.update_one({"user_id": ver["user_id"]}, {"$set": {"project_phase": "scheduling"}})
    elif action == "reject":
        await db.verifications.update_one({"verification_id": ver_id}, {"$set": {"status": "rejected", "deficit_amount": deficit_amount}})
        await db.users.update_one({"user_id": ver["user_id"]}, {"$set": {"project_phase": "unpaid", "deficit_due": deficit_amount}})
    
    return {"ok": True}


# ---------------------------------------------------------------------------
# BACKGROUND WORKER: 15-MINUTE AUTO-ASSIGN ROUTER
# ---------------------------------------------------------------------------
async def discovery_call_auto_router():
    """Runs continuously in the background. Rotates leads every 15 mins."""
    SALES_TEAM = ["Girish", "Rajendra", "Karunakar"]
    
    while True:
        try:
            timeout_threshold = now_utc() - timedelta(minutes=15)
            stale_calls = await db.discovery_calls.find({
                "status": "pending",
                "assigned_at": {"$lt": iso(timeout_threshold)}
            }).to_list(None)

            for call in stale_calls:
                current_assignee = call.get("assigned_to", "Girish")
                try:
                    current_index = SALES_TEAM.index(current_assignee)
                    next_index = (current_index + 1) % len(SALES_TEAM)
                except ValueError:
                    next_index = 0
                
                next_assignee = SALES_TEAM[next_index]
                await db.discovery_calls.update_one(
                    {"_id": call["_id"]},
                    {"$set": {
                        "assigned_to": next_assignee,
                        "assigned_at": iso(now_utc())
                    }}
                )
                log.info(f"[AUTO-ROUTER] Reassigned lead {call['name']} from {current_assignee} to {next_assignee}")
        except Exception as e:
            log.error(f"[AUTO-ROUTER] Error: {e}")
        
        await asyncio.sleep(60)

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
    if doc:
        return doc.get("data", {})
    # Lazy fallback if seeding hasn't run yet
    defaults_map = {"interiors": DEFAULT_INTERIORS_CONTENT, "homepage": DEFAULT_HOMEPAGE_CONTENT}
    if key in defaults_map:
        return defaults_map[key]
    raise HTTPException(status_code=404, detail="Content not found")


@api.post("/interior-leads")
async def create_interior_lead(payload: Dict[str, Any]):
    lead = {
        "lead_id": f"lead_{uuid.uuid4().hex[:10]}",
        "name": (payload.get("name") or "").strip(),
        "phone": (payload.get("phone") or "").strip(),
        "email": (payload.get("email") or "").strip(),
        "whatsapp": bool(payload.get("whatsapp", True)),
        "property_type": payload.get("property_type") or "Apartment",
        "flat_size": payload.get("flat_size") or "",
        "budget": payload.get("budget") or "",
        "style": payload.get("style") or "",
        "move_in": payload.get("move_in") or "",
        "locality": payload.get("locality") or "",
        "status": "new",
        "source": "interiors_page",
        "created_at": iso(now_utc()),
    }
    if not lead["name"] or not lead["phone"]:
        raise HTTPException(status_code=400, detail="Name and phone are required")
    await db.interior_leads.insert_one(lead)
    return {"ok": True, "lead_id": lead["lead_id"]}


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
        log.info("Seeds ensured")
    except Exception as e:
        log.error(f"seed failed: {e}")
        
    asyncio.create_task(discovery_call_auto_router())

@app.on_event("shutdown")
async def shutdown_event():
    client.close()
