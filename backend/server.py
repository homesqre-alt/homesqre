"""Homesqre Backend — single-file FastAPI app.

Includes:
  - JWT email/password auth (cookies + Bearer)
  - Emergent Google OAuth session exchange
  - Mock OTP verification
  - Object Storage uploads via Emergent integration
  - CRUD: listings, projects, inquiries, banks, amenities, cities/localities
  - Interior leads, loan leads, content CMS, search, admin
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
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any

import bcrypt
import jwt
import requests
from fastapi import (
    FastAPI, APIRouter, Request, Response, HTTPException, Depends,
    UploadFile, File, Header, Query
)
from fastapi.responses import Response as RawResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALG = "HS256"
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
APP_NAME = os.environ.get("APP_NAME", "homesqre")
STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
EMERGENT_AUTH_SESSION_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="Homesqre API")
api = APIRouter(prefix="/api")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,  # using Authorization Bearer + cookies; "*" requires credentials False
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s | %(message)s")
log = logging.getLogger("homesqre")

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
    # else: try Emergent session_token
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
    # Prefer explicit Authorization header over cookies to avoid stale-cookie surprises
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


# ---------------------------------------------------------------------------
# Object Storage
# ---------------------------------------------------------------------------
storage_key: Optional[str] = None


def init_storage():
    global storage_key
    if storage_key:
        return storage_key
    if not EMERGENT_LLM_KEY:
        return None
    try:
        r = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_LLM_KEY}, timeout=30)
        r.raise_for_status()
        storage_key = r.json()["storage_key"]
        log.info("Storage initialised")
        return storage_key
    except Exception as e:
        log.error(f"Storage init failed: {e}")
        return None


def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    if not key:
        raise HTTPException(status_code=500, detail="Storage unavailable")
    r = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data,
        timeout=120,
    )
    r.raise_for_status()
    return r.json()


def get_object(path: str):
    key = init_storage()
    if not key:
        raise HTTPException(status_code=500, detail="Storage unavailable")
    r = requests.get(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key},
        timeout=60,
    )
    r.raise_for_status()
    return r.content, r.headers.get("Content-Type", "application/octet-stream")


# ---------------------------------------------------------------------------
# Seeds
# ---------------------------------------------------------------------------
SEED_BANKS = [
    {"name": "SBI", "rate_min": 8.40, "rate_max": 9.65, "logo": ""},
    {"name": "HDFC Bank", "rate_min": 8.50, "rate_max": 9.80, "logo": ""},
    {"name": "ICICI Bank", "rate_min": 8.55, "rate_max": 9.75, "logo": ""},
    {"name": "Axis Bank", "rate_min": 8.60, "rate_max": 9.90, "logo": ""},
    {"name": "Kotak Mahindra Bank", "rate_min": 8.65, "rate_max": 9.95, "logo": ""},
    {"name": "Bank of Baroda", "rate_min": 8.45, "rate_max": 9.70, "logo": ""},
    {"name": "PNB Housing Finance", "rate_min": 8.70, "rate_max": 10.20, "logo": ""},
    {"name": "LIC Housing Finance", "rate_min": 8.65, "rate_max": 10.10, "logo": ""},
]

SEED_AMENITIES: List[Dict[str, Any]] = [
    # Sports & Fitness
    {"name": "Swimming Pool", "category": "Sports & Fitness", "icon": "waves"},
    {"name": "Gym", "category": "Sports & Fitness", "icon": "dumbbell"},
    {"name": "Badminton Court", "category": "Sports & Fitness", "icon": "circle"},
    {"name": "Tennis Court", "category": "Sports & Fitness", "icon": "circle"},
    {"name": "Cricket Pitch", "category": "Sports & Fitness", "icon": "circle"},
    {"name": "Jogging Track", "category": "Sports & Fitness", "icon": "footprints"},
    {"name": "Yoga Deck", "category": "Sports & Fitness", "icon": "flower"},
    {"name": "Basketball Court", "category": "Sports & Fitness", "icon": "circle"},
    # Lifestyle
    {"name": "Clubhouse", "category": "Lifestyle", "icon": "home"},
    {"name": "Party Hall", "category": "Lifestyle", "icon": "party-popper"},
    {"name": "Rooftop Terrace", "category": "Lifestyle", "icon": "sun"},
    {"name": "BBQ Area", "category": "Lifestyle", "icon": "flame"},
    {"name": "Amphitheatre", "category": "Lifestyle", "icon": "users"},
    {"name": "Co-working Space", "category": "Lifestyle", "icon": "briefcase"},
    {"name": "Library", "category": "Lifestyle", "icon": "book-open"},
    # Kids & Family
    {"name": "Children's Play Area", "category": "Kids & Family", "icon": "baby"},
    {"name": "Creche/Daycare", "category": "Kids & Family", "icon": "baby"},
    {"name": "Kids Pool", "category": "Kids & Family", "icon": "waves"},
    {"name": "Toddler Zone", "category": "Kids & Family", "icon": "baby"},
    # Security
    {"name": "24/7 Security", "category": "Security", "icon": "shield"},
    {"name": "CCTV Surveillance", "category": "Security", "icon": "video"},
    {"name": "Gated Community", "category": "Security", "icon": "lock"},
    {"name": "Video Door Phone", "category": "Security", "icon": "phone"},
    {"name": "Boom Barrier", "category": "Security", "icon": "shield"},
    # Convenience
    {"name": "Power Backup", "category": "Convenience", "icon": "zap"},
    {"name": "Rainwater Harvesting", "category": "Convenience", "icon": "cloud-rain"},
    {"name": "EV Charging", "category": "Convenience", "icon": "battery-charging"},
    {"name": "Covered Parking", "category": "Convenience", "icon": "car"},
    {"name": "Visitor Parking", "category": "Convenience", "icon": "car"},
    {"name": "Supermarket", "category": "Convenience", "icon": "shopping-cart"},
    {"name": "Café", "category": "Convenience", "icon": "coffee"},
    # Green & Wellness
    {"name": "Landscaped Gardens", "category": "Green & Wellness", "icon": "trees"},
    {"name": "Organic Garden", "category": "Green & Wellness", "icon": "leaf"},
    {"name": "Senior Citizen Corner", "category": "Green & Wellness", "icon": "armchair"},
    {"name": "Meditation Zone", "category": "Green & Wellness", "icon": "flower"},
    {"name": "Pet-friendly Zone", "category": "Green & Wellness", "icon": "paw-print"},
]

BANGALORE_LOCALITIES = [
    "Whitefield", "Sarjapur Road", "Electronic City", "HSR Layout",
    "Indiranagar", "Koramangala", "JP Nagar", "Hebbal", "Yelahanka",
    "Bellandur", "Marathahalli", "Bannerghatta Road", "Hennur",
    "Devanahalli", "Kanakapura Road",
]


async def seed_data():
    # indexes
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.password_reset_tokens.create_index("expires_at", expireAfterSeconds=0)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.listings.create_index("slug", unique=True)
    await db.projects.create_index("slug", unique=True)

    # users
    for u in [
        ("admin@homesqre.com", "Homesqre@2026", "admin", "Homesqre Admin", "+919999999999"),
        ("agent@homesqre.com", "Agent@2026", "agent", "Demo Agent", "+919999999991"),
        ("builder@homesqre.com", "Builder@2026", "builder", "Demo Builder", "+919999999992"),
        ("customer@homesqre.com", "Customer@2026", "customer", "Demo Customer", "+919999999993"),
    ]:
        email, pwd, role, name, mobile = u
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
        })

    # banks
    for b in SEED_BANKS:
        exist = await db.banks.find_one({"name": b["name"]})
        if not exist:
            await db.banks.insert_one({
                "bank_id": f"bank_{uuid.uuid4().hex[:8]}",
                "is_active": True,
                "updated_at": iso(now_utc()),
                **b,
            })

    # amenities
    for a in SEED_AMENITIES:
        exist = await db.amenities.find_one({"name": a["name"]})
        if not exist:
            await db.amenities.insert_one({
                "amenity_id": f"am_{uuid.uuid4().hex[:8]}",
                "is_active": True,
                **a,
            })

    # cities/localities
    exist = await db.cities.find_one({"name": "Bangalore"})
    if not exist:
        await db.cities.insert_one({
            "city_id": f"city_{uuid.uuid4().hex[:8]}",
            "name": "Bangalore",
            "slug": "bangalore",
            "is_active": True,
            "state": "Karnataka",
            "intro": "India's Silicon Valley — a thriving metropolis of tech, gardens and modern living.",
        })
    for loc in BANGALORE_LOCALITIES:
        exist = await db.localities.find_one({"name": loc})
        if not exist:
            await db.localities.insert_one({
                "locality_id": f"loc_{uuid.uuid4().hex[:8]}",
                "name": loc,
                "slug": slugify(loc),
                "city": "Bangalore",
                "city_slug": "bangalore",
                "is_active": True,
            })

    # sample listings + projects (only if none)
    listing_count = await db.listings.count_documents({})
    if listing_count == 0:
        agent = await db.users.find_one({"email": "agent@homesqre.com"})
        for i, locality in enumerate(BANGALORE_LOCALITIES[:6]):
            for kind, price, beds in [("sale", 12500000 + i * 1000000, 3), ("rent", 45000 + i * 5000, 2)]:
                listing_id = f"lst_{uuid.uuid4().hex[:10]}"
                title = f"{beds}BHK {'Apartment' if kind=='sale' else 'Flat'} in {locality}"
                await db.listings.insert_one({
                    "listing_id": listing_id,
                    "slug": slugify(f"{title}-{listing_id[-4:]}"),
                    "title": title,
                    "description": "Spacious well-ventilated home with modern fittings, gated community amenities and excellent connectivity.",
                    "kind": kind,
                    "city": "Bangalore",
                    "locality": locality,
                    "address": f"Near main road, {locality}, Bangalore",
                    "lat": 12.9716 + (i * 0.02),
                    "lng": 77.5946 + (i * 0.02),
                    "price": price,
                    "area_sqft": 1450 + i * 100,
                    "area_type": "super_builtup",
                    "bedrooms": beds,
                    "bathrooms": beds,
                    "property_type": "Apartment",
                    "possession_status": "Ready to Move",
                    "photos": [
                        "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200",
                        "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200",
                    ],
                    "videos": [],
                    "floor_plans": [],
                    "agent_id": agent["user_id"] if agent else None,
                    "status": "live",
                    "is_featured": i < 3,
                    "views": random.randint(20, 250),
                    "created_at": iso(now_utc()),
                })

    project_count = await db.projects.count_documents({})
    if project_count == 0:
        builder = await db.users.find_one({"email": "builder@homesqre.com"})
        sample_projects = [
            ("Prestige Lakeside Habitat", "Whitefield", 18500000, 32500000, "3BHK & 4BHK"),
            ("Sobha Royal Pavilion", "Sarjapur Road", 14500000, 24500000, "2BHK & 3BHK"),
            ("Brigade Cornerstone Utopia", "Electronic City", 9500000, 18500000, "2BHK & 3BHK"),
            ("Godrej Reflections", "HSR Layout", 22500000, 42500000, "3BHK & 4BHK"),
        ]
        all_amenities = await db.amenities.find({}, {"_id": 0}).to_list(100)
        all_banks = await db.banks.find({}, {"_id": 0}).to_list(20)
        for i, (name, locality, pmin, pmax, types) in enumerate(sample_projects):
            project_id = f"prj_{uuid.uuid4().hex[:10]}"
            await db.projects.insert_one({
                "project_id": project_id,
                "slug": slugify(name),
                "name": name,
                "tagline": "Live elevated.",
                "description": f"{name} offers thoughtfully crafted homes with world-class amenities, set in the heart of {locality}.",
                "builder_id": builder["user_id"] if builder else None,
                "builder_name": "Premium Builders",
                "city": "Bangalore",
                "city_slug": "bangalore",
                "locality": locality,
                "locality_slug": slugify(locality),
                "address": f"{locality}, Bangalore",
                "lat": 12.9716 + i * 0.03,
                "lng": 77.5946 + i * 0.03,
                "price_min": pmin,
                "price_max": pmax,
                "sqft_min": 1200 + i * 100,
                "sqft_max": 2400 + i * 200,
                "unit_types": types,
                "approvals": ["BBMP", "BMRDA", "BWSSB"],
                "rera_number": f"PRM/KA/RERA/1251/446/PR/22030{i}/0040{i}",
                "rera_state": "Karnataka",
                "rera_date": "2022-03-15",
                "rera_expiry": "2027-03-14",
                "amenity_ids": [a["amenity_id"] for a in all_amenities[: 12 + i]],
                "bank_ids": [b["bank_id"] for b in all_banks],
                "units": [
                    {"type": "3BHK", "size_sqft": 1650, "price": pmin, "availability": "Available", "floor_plan": ""},
                    {"type": "4BHK", "size_sqft": 2400, "price": pmax, "availability": "Limited", "floor_plan": ""},
                ],
                "banner_image": "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=1600",
                "gallery": [
                    "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=1600",
                    "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1600",
                ],
                "brochure_url": "",
                "brand_color": "#06402B",
                "status": "live",
                "is_featured": i < 3,
                "views": random.randint(50, 400),
                "last_updated": iso(now_utc()),
                "created_at": iso(now_utc()),
            })


# ---------------------------------------------------------------------------
# AUTH ROUTES
# ---------------------------------------------------------------------------
@api.post("/auth/register")
async def auth_register(body: RegisterRequest, response: Response):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    role = body.role if body.role in {"customer", "agent", "builder"} else "customer"
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
    }
    await db.users.insert_one(doc)
    log.info(f"[OTP] {email} → {otp}")
    token = make_access_token(user_id, email, role)
    response.set_cookie("access_token", token, httponly=True, samesite="lax", max_age=604800, path="/")
    return {
        "user": {"user_id": user_id, "email": email, "name": body.name, "role": role,
                 "mobile": body.mobile, "is_verified": False, "profile_completed": True},
        "token": token,
        "dev_otp": otp,
    }


@api.post("/auth/verify-otp")
async def auth_verify_otp(body: OtpVerifyRequest):
    email = body.email.lower()
    user = await db.users.find_one({"email": email})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    # accept any 6-digit OTP for development if matches OR if generic dev shortcut "000000"
    if body.otp != user.get("otp") and body.otp != "000000":
        raise HTTPException(status_code=400, detail="Invalid OTP")
    await db.users.update_one({"email": email}, {"$set": {"is_verified": True}, "$unset": {"otp": ""}})
    return {"ok": True}


@api.post("/auth/login")
async def auth_login(body: LoginRequest, response: Response):
    email = body.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not user.get("password_hash") or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = make_access_token(user["user_id"], email, user["role"])
    response.set_cookie("access_token", token, httponly=True, samesite="lax", max_age=604800, path="/")
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
        # don't leak; pretend success
        return {"ok": True}
    import secrets
    token = secrets.token_urlsafe(32)
    await db.password_reset_tokens.insert_one({
        "token": token,
        "user_id": user["user_id"],
        "expires_at": now_utc() + timedelta(hours=1),
        "used": False,
    })
    log.info(f"[RESET] {body.email}: token={token}")
    return {"ok": True, "dev_token": token}


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


@api.post("/auth/google/session")
async def auth_google_session(body: GoogleSessionRequest, response: Response):
    try:
        r = requests.get(
            EMERGENT_AUTH_SESSION_URL,
            headers={"X-Session-ID": body.session_id},
            timeout=20,
        )
        r.raise_for_status()
        data = r.json()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid session: {e}")
    email = (data.get("email") or "").lower()
    if not email:
        raise HTTPException(status_code=400, detail="No email in session")
    user = await db.users.find_one({"email": email})
    if not user:
        role = body.role if body.role in {"customer", "agent", "builder"} else "customer"
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        user = {
            "user_id": user_id,
            "email": email,
            "name": data.get("name", ""),
            "picture": data.get("picture", ""),
            "mobile": "",
            "role": role,
            "is_verified": True,
            "profile_completed": False,
            "created_at": iso(now_utc()),
        }
        await db.users.insert_one(user)
    session_token = data.get("session_token") or jwt.encode(
        {"sub": user["user_id"], "exp": now_utc() + timedelta(days=7)}, JWT_SECRET, algorithm=JWT_ALG
    )
    await db.user_sessions.insert_one({
        "session_token": session_token,
        "user_id": user["user_id"],
        "expires_at": now_utc() + timedelta(days=7),
        "created_at": now_utc(),
    })
    response.set_cookie("session_token", session_token, httponly=True, samesite="lax", max_age=604800, path="/")
    return {"user": clean_doc(user), "token": session_token}


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
# CATALOG: banks / amenities / cities / localities
# ---------------------------------------------------------------------------
@api.get("/banks")
async def list_banks(active_only: bool = True):
    q = {"is_active": True} if active_only else {}
    return await db.banks.find(q, {"_id": 0}).to_list(100)


@api.post("/banks")
async def create_bank(payload: dict, user: dict = Depends(require_role("admin"))):
    payload["bank_id"] = f"bank_{uuid.uuid4().hex[:8]}"
    payload["is_active"] = payload.get("is_active", True)
    payload["updated_at"] = iso(now_utc())
    await db.banks.insert_one(payload)
    return clean_doc(payload)


@api.put("/banks/{bank_id}")
async def update_bank(bank_id: str, payload: dict, user: dict = Depends(require_role("admin"))):
    payload["updated_at"] = iso(now_utc())
    await db.banks.update_one({"bank_id": bank_id}, {"$set": payload})
    bank = await db.banks.find_one({"bank_id": bank_id}, {"_id": 0})
    if bank:
        await db.bank_rates_log.insert_one({
            "bank_id": bank_id,
            "rate_min": bank.get("rate_min"),
            "rate_max": bank.get("rate_max"),
            "changed_at": iso(now_utc()),
        })
    return bank


@api.delete("/banks/{bank_id}")
async def delete_bank(bank_id: str, user: dict = Depends(require_role("admin"))):
    await db.banks.delete_one({"bank_id": bank_id})
    return {"ok": True}


@api.get("/amenities")
async def list_amenities(active_only: bool = True):
    q = {"is_active": True} if active_only else {}
    items = await db.amenities.find(q, {"_id": 0}).to_list(500)
    return items


@api.post("/amenities")
async def create_amenity(payload: dict, user: dict = Depends(current_user)):
    is_admin = user.get("role") == "admin"
    payload["amenity_id"] = f"am_{uuid.uuid4().hex[:8]}"
    payload["is_active"] = is_admin  # builder-suggested goes pending
    payload["pending_approval"] = not is_admin
    payload["suggested_by"] = user["user_id"]
    await db.amenities.insert_one(payload)
    return clean_doc(payload)


@api.put("/amenities/{amenity_id}")
async def update_amenity(amenity_id: str, payload: dict, user: dict = Depends(require_role("admin"))):
    await db.amenities.update_one({"amenity_id": amenity_id}, {"$set": payload})
    return await db.amenities.find_one({"amenity_id": amenity_id}, {"_id": 0})


@api.get("/cities")
async def list_cities():
    return await db.cities.find({"is_active": True}, {"_id": 0}).to_list(100)


@api.get("/localities")
async def list_localities(city: Optional[str] = None):
    q = {"is_active": True}
    if city:
        q["city"] = city
    return await db.localities.find(q, {"_id": 0}).to_list(500)


@api.post("/cities")
async def create_city(payload: dict, user: dict = Depends(require_role("admin"))):
    payload["city_id"] = f"city_{uuid.uuid4().hex[:8]}"
    payload["slug"] = payload.get("slug") or slugify(payload.get("name", ""))
    payload["is_active"] = True
    await db.cities.insert_one(payload)
    return clean_doc(payload)


@api.post("/localities")
async def create_locality(payload: dict, user: dict = Depends(require_role("admin"))):
    payload["locality_id"] = f"loc_{uuid.uuid4().hex[:8]}"
    payload["slug"] = payload.get("slug") or slugify(payload.get("name", ""))
    payload["city_slug"] = payload.get("city_slug") or slugify(payload.get("city", ""))
    payload["is_active"] = True
    await db.localities.insert_one(payload)
    return clean_doc(payload)


# ---------------------------------------------------------------------------
# LISTINGS
# ---------------------------------------------------------------------------
@api.get("/listings")
async def list_listings(
    city: Optional[str] = None,
    locality: Optional[str] = None,
    kind: Optional[str] = None,
    bedrooms: Optional[int] = None,
    price_min: Optional[float] = None,
    price_max: Optional[float] = None,
    status: Optional[str] = "live",
    featured: Optional[bool] = None,
    sort: Optional[str] = "newest",
    limit: int = 60,
    agent_id: Optional[str] = None,
    q: Optional[str] = None,
):
    query: Dict[str, Any] = {}
    if status:
        query["status"] = status
    if city:
        query["city"] = city
    if locality:
        query["locality"] = locality
    if kind:
        query["kind"] = kind
    if bedrooms:
        query["bedrooms"] = bedrooms
    if price_min is not None:
        query.setdefault("price", {})["$gte"] = price_min
    if price_max is not None:
        query.setdefault("price", {})["$lte"] = price_max
    if featured is not None:
        query["is_featured"] = featured
    if agent_id:
        query["agent_id"] = agent_id
    if q:
        query["$or"] = [
            {"title": {"$regex": q, "$options": "i"}},
            {"locality": {"$regex": q, "$options": "i"}},
            {"city": {"$regex": q, "$options": "i"}},
        ]
    sort_field = [("created_at", -1)]
    if sort == "price_asc":
        sort_field = [("price", 1)]
    elif sort == "price_desc":
        sort_field = [("price", -1)]
    elif sort == "popular":
        sort_field = [("views", -1)]
    items = await db.listings.find(query, {"_id": 0}).sort(sort_field).limit(limit).to_list(limit)
    return items


@api.get("/listings/{listing_id}")
async def get_listing(listing_id: str):
    item = await db.listings.find_one({"$or": [{"listing_id": listing_id}, {"slug": listing_id}]}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Listing not found")
    await db.listings.update_one({"listing_id": item["listing_id"]}, {"$inc": {"views": 1}})
    return item


@api.post("/listings")
async def create_listing(payload: dict, user: dict = Depends(require_role("agent", "builder", "admin"))):
    listing_id = f"lst_{uuid.uuid4().hex[:10]}"
    payload["listing_id"] = listing_id
    payload["slug"] = payload.get("slug") or slugify(f"{payload.get('title','listing')}-{listing_id[-4:]}")
    payload["agent_id"] = user["user_id"]
    payload["status"] = payload.get("status", "pending")
    payload["views"] = 0
    payload["is_featured"] = False
    payload["created_at"] = iso(now_utc())
    await db.listings.insert_one(payload)
    return clean_doc(payload)


@api.put("/listings/{listing_id}")
async def update_listing(listing_id: str, payload: dict, user: dict = Depends(current_user)):
    existing = await db.listings.find_one({"listing_id": listing_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Not found")
    if user["role"] != "admin" and existing.get("agent_id") != user["user_id"]:
        raise HTTPException(status_code=403, detail="Not your listing")
    payload.pop("listing_id", None)
    payload.pop("agent_id", None)
    if user["role"] != "admin":
        payload.pop("is_featured", None)
        if payload.get("status") not in {"draft", "pending"}:
            payload["status"] = "pending"
    await db.listings.update_one({"listing_id": listing_id}, {"$set": payload})
    return await db.listings.find_one({"listing_id": listing_id}, {"_id": 0})


@api.delete("/listings/{listing_id}")
async def delete_listing(listing_id: str, user: dict = Depends(current_user)):
    existing = await db.listings.find_one({"listing_id": listing_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Not found")
    if user["role"] != "admin" and existing.get("agent_id") != user["user_id"]:
        raise HTTPException(status_code=403, detail="Not your listing")
    await db.listings.delete_one({"listing_id": listing_id})
    return {"ok": True}


# ---------------------------------------------------------------------------
# PROJECTS
# ---------------------------------------------------------------------------
@api.get("/projects")
async def list_projects(
    city: Optional[str] = None,
    locality: Optional[str] = None,
    status: Optional[str] = "live",
    featured: Optional[bool] = None,
    builder_id: Optional[str] = None,
    limit: int = 60,
    q: Optional[str] = None,
):
    query: Dict[str, Any] = {}
    if status:
        query["status"] = status
    if city:
        query["city"] = city
    if locality:
        query["locality"] = locality
    if featured is not None:
        query["is_featured"] = featured
    if builder_id:
        query["builder_id"] = builder_id
    if q:
        query["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"locality": {"$regex": q, "$options": "i"}},
            {"builder_name": {"$regex": q, "$options": "i"}},
        ]
    return await db.projects.find(query, {"_id": 0}).sort([("created_at", -1)]).limit(limit).to_list(limit)


@api.get("/projects/by-slug/{city}/{locality}/{slug}")
async def get_project_by_slug(city: str, locality: str, slug: str):
    item = await db.projects.find_one({
        "city_slug": city,
        "locality_slug": locality,
        "slug": slug,
    }, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Project not found")
    await db.projects.update_one({"project_id": item["project_id"]}, {"$inc": {"views": 1}})
    return item


@api.get("/projects/{project_id}")
async def get_project(project_id: str):
    item = await db.projects.find_one({"$or": [{"project_id": project_id}, {"slug": project_id}]}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Project not found")
    return item


@api.post("/projects")
async def create_project(payload: dict, user: dict = Depends(require_role("builder", "admin"))):
    project_id = f"prj_{uuid.uuid4().hex[:10]}"
    payload["project_id"] = project_id
    payload["slug"] = payload.get("slug") or slugify(payload.get("name", project_id))
    payload["city_slug"] = slugify(payload.get("city", ""))
    payload["locality_slug"] = slugify(payload.get("locality", ""))
    payload["builder_id"] = user["user_id"]
    payload["status"] = payload.get("status", "pending")
    payload["views"] = 0
    payload["is_featured"] = False
    payload["amenity_ids"] = payload.get("amenity_ids", [])
    payload["bank_ids"] = payload.get("bank_ids", [])
    payload["units"] = payload.get("units", [])
    payload["created_at"] = iso(now_utc())
    payload["last_updated"] = iso(now_utc())
    await db.projects.insert_one(payload)
    return clean_doc(payload)


@api.put("/projects/{project_id}")
async def update_project(project_id: str, payload: dict, user: dict = Depends(current_user)):
    existing = await db.projects.find_one({"project_id": project_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Not found")
    if user["role"] != "admin" and existing.get("builder_id") != user["user_id"]:
        raise HTTPException(status_code=403, detail="Not your project")
    payload.pop("project_id", None)
    payload.pop("builder_id", None)
    if user["role"] != "admin":
        payload.pop("is_featured", None)
    if payload.get("name"):
        payload["slug"] = payload.get("slug") or slugify(payload["name"])
    if payload.get("city"):
        payload["city_slug"] = slugify(payload["city"])
    if payload.get("locality"):
        payload["locality_slug"] = slugify(payload["locality"])
    payload["last_updated"] = iso(now_utc())
    await db.projects.update_one({"project_id": project_id}, {"$set": payload})
    return await db.projects.find_one({"project_id": project_id}, {"_id": 0})


@api.delete("/projects/{project_id}")
async def delete_project(project_id: str, user: dict = Depends(current_user)):
    existing = await db.projects.find_one({"project_id": project_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Not found")
    if user["role"] != "admin" and existing.get("builder_id") != user["user_id"]:
        raise HTTPException(status_code=403, detail="Not your project")
    await db.projects.delete_one({"project_id": project_id})
    return {"ok": True}


# ---------------------------------------------------------------------------
# INQUIRIES & LEADS
# ---------------------------------------------------------------------------
@api.post("/inquiries")
async def create_inquiry(payload: dict):
    """Public inquiry creation. Must be linked to listing_id or project_id."""
    listing_id = payload.get("listing_id")
    project_id = payload.get("project_id")
    if not listing_id and not project_id:
        raise HTTPException(status_code=400, detail="Must link to listing or project")
    owner_id = None
    target_title = ""
    if listing_id:
        lst = await db.listings.find_one({"listing_id": listing_id}, {"_id": 0})
        if not lst:
            raise HTTPException(status_code=404, detail="Listing not found")
        owner_id = lst.get("agent_id")
        target_title = lst.get("title", "")
    elif project_id:
        prj = await db.projects.find_one({"project_id": project_id}, {"_id": 0})
        if not prj:
            raise HTTPException(status_code=404, detail="Project not found")
        owner_id = prj.get("builder_id")
        target_title = prj.get("name", "")

    # duplicate prevention (same mobile + listing/project within 24h)
    cutoff = iso(now_utc() - timedelta(hours=24))
    dup_q = {"mobile": payload.get("mobile"), "created_at": {"$gt": cutoff}}
    if listing_id:
        dup_q["listing_id"] = listing_id
    if project_id:
        dup_q["project_id"] = project_id
    if await db.inquiries.find_one(dup_q):
        raise HTTPException(status_code=409, detail="Duplicate inquiry. Please wait 24 hours.")

    rec = {
        "inquiry_id": f"inq_{uuid.uuid4().hex[:10]}",
        "name": payload.get("name", ""),
        "email": payload.get("email", ""),
        "mobile": payload.get("mobile", ""),
        "message": payload.get("message", ""),
        "listing_id": listing_id,
        "project_id": project_id,
        "target_title": target_title,
        "owner_id": owner_id,
        "status": "new",
        "notes": [],
        "next_followup": None,
        "messages": [],
        "created_at": iso(now_utc()),
    }
    await db.inquiries.insert_one(rec)
    return clean_doc(rec)


@api.get("/inquiries")
async def list_inquiries(user: dict = Depends(current_user), all_inquiries: bool = False):
    if user["role"] == "admin" and all_inquiries:
        q = {}
    else:
        q = {"owner_id": user["user_id"]}
    return await db.inquiries.find(q, {"_id": 0}).sort([("created_at", -1)]).to_list(500)


@api.put("/inquiries/{inquiry_id}")
async def update_inquiry(inquiry_id: str, payload: dict, user: dict = Depends(current_user)):
    inq = await db.inquiries.find_one({"inquiry_id": inquiry_id})
    if not inq:
        raise HTTPException(status_code=404, detail="Not found")
    if user["role"] != "admin" and inq.get("owner_id") != user["user_id"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    allowed = {"status", "next_followup"}
    upd = {k: payload[k] for k in payload if k in allowed}
    if "note" in payload and payload["note"]:
        await db.inquiries.update_one(
            {"inquiry_id": inquiry_id},
            {"$push": {"notes": {"text": payload["note"], "at": iso(now_utc()), "by": user["user_id"]}}}
        )
    if "message" in payload and payload["message"]:
        await db.inquiries.update_one(
            {"inquiry_id": inquiry_id},
            {"$push": {"messages": {"text": payload["message"], "at": iso(now_utc()), "by": user["user_id"]}}}
        )
    if upd:
        await db.inquiries.update_one({"inquiry_id": inquiry_id}, {"$set": upd})
    return await db.inquiries.find_one({"inquiry_id": inquiry_id}, {"_id": 0})


@api.post("/interior-leads")
async def create_interior_lead(payload: dict):
    rec = {
        "lead_id": f"int_{uuid.uuid4().hex[:10]}",
        "name": payload.get("name", ""),
        "phone": payload.get("phone", ""),
        "email": payload.get("email", ""),
        "whatsapp": payload.get("whatsapp", False),
        "property_type": payload.get("property_type", ""),
        "flat_size": payload.get("flat_size", ""),
        "budget": payload.get("budget", ""),
        "style": payload.get("style", ""),
        "move_in": payload.get("move_in", ""),
        "locality": payload.get("locality", ""),
        "status": "new",
        "assigned_to": None,
        "notes": [],
        "call_logs": [],
        "next_followup": None,
        "created_at": iso(now_utc()),
    }
    await db.interior_leads.insert_one(rec)
    return clean_doc(rec)


@api.get("/interior-leads")
async def list_interior_leads(user: dict = Depends(require_role("admin"))):
    return await db.interior_leads.find({}, {"_id": 0}).sort([("created_at", -1)]).to_list(2000)


@api.put("/interior-leads/{lead_id}")
async def update_interior_lead(lead_id: str, payload: dict, user: dict = Depends(require_role("admin"))):
    allowed = {"status", "assigned_to", "next_followup"}
    upd = {k: payload[k] for k in payload if k in allowed}
    if "note" in payload and payload["note"]:
        await db.interior_leads.update_one(
            {"lead_id": lead_id},
            {"$push": {"notes": {"text": payload["note"], "at": iso(now_utc())}}}
        )
    if "call_log" in payload and payload["call_log"]:
        await db.interior_leads.update_one(
            {"lead_id": lead_id},
            {"$push": {"call_logs": {"text": payload["call_log"], "at": iso(now_utc())}}}
        )
    if upd:
        await db.interior_leads.update_one({"lead_id": lead_id}, {"$set": upd})
    return await db.interior_leads.find_one({"lead_id": lead_id}, {"_id": 0})


@api.post("/loan-leads")
async def create_loan_lead(payload: dict):
    rec = {
        "lead_id": f"loan_{uuid.uuid4().hex[:10]}",
        "name": payload.get("name", ""),
        "email": payload.get("email", ""),
        "phone": payload.get("phone", ""),
        "loan_amount": payload.get("loan_amount", 0),
        "interest_rate": payload.get("interest_rate", 0),
        "tenure": payload.get("tenure", 0),
        "bank": payload.get("bank", ""),
        "emi": payload.get("emi", 0),
        "created_at": iso(now_utc()),
    }
    await db.loan_leads.insert_one(rec)
    return clean_doc(rec)


@api.get("/loan-leads")
async def list_loan_leads(user: dict = Depends(require_role("admin"))):
    return await db.loan_leads.find({}, {"_id": 0}).sort([("created_at", -1)]).to_list(2000)


# ---------------------------------------------------------------------------
# SEARCH
# ---------------------------------------------------------------------------
@api.get("/search")
async def universal_search(q: str = Query(..., min_length=1)):
    regex = {"$regex": q, "$options": "i"}
    listings = await db.listings.find({
        "$or": [
            {"title": regex}, {"locality": regex}, {"city": regex},
            {"property_type": regex},
        ],
        "status": "live",
    }, {"_id": 0}).limit(8).to_list(8)
    projects = await db.projects.find({
        "$or": [
            {"name": regex}, {"locality": regex}, {"city": regex}, {"builder_name": regex},
        ],
        "status": "live",
    }, {"_id": 0}).limit(8).to_list(8)
    localities = await db.localities.find({"name": regex}, {"_id": 0}).limit(6).to_list(6)
    return {"listings": listings, "projects": projects, "localities": localities}


# ---------------------------------------------------------------------------
# CONTENT (Homepage / Interiors / About / Contact)
# ---------------------------------------------------------------------------
DEFAULT_HOMEPAGE_CONTENT = {
    "hero": {
        "headline": "Find the home that fits your life.",
        "subheadline": "Premium apartments, villas and projects across Bangalore — curated, verified and beautifully presented.",
        "cta": "Start your search",
        "background": "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=1600",
    },
    "promo_banner": {"text": "", "show": False, "color": "#06402B"},
    "stats": {
        "homes": 1240, "agents": 180, "cities": 1, "projects": 65,
    },
}


DEFAULT_INTERIORS_CONTENT = {
    "hero": {
        "headline": "Interiors that feel like home.",
        "subheadline": "End-to-end home interiors crafted by award-winning designers. 45-day delivery. 10-year warranty.",
        "offer": "Flat 10% off this month",
        "show_offer": True,
        "cta": "Get a Free Design Consultation",
        "backgrounds": [
            "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=1600",
            "https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=1600",
        ],
    },
    "how_it_works": [
        {"step": 1, "icon": "message-circle", "title": "Share your vision", "description": "Tell us your style, budget and timelines."},
        {"step": 2, "icon": "pencil-ruler", "title": "Design & 3D walkthrough", "description": "Approve your design with realistic 3D views."},
        {"step": 3, "icon": "hammer", "title": "Production & install", "description": "Built in our factory, installed in 45 days."},
        {"step": 4, "icon": "key-round", "title": "Move in & warranty", "description": "Move in worry-free with a 10-year warranty."},
    ],
    "services": [
        {"icon": "home", "title": "Full Home Interiors", "description": "Turnkey design for every room."},
        {"icon": "chef-hat", "title": "Modular Kitchen", "description": "Functional, beautiful kitchens."},
        {"icon": "shirt", "title": "Wardrobe & Storage", "description": "Custom storage for every space."},
        {"icon": "lamp", "title": "False Ceiling & Lighting", "description": "Layered lighting that elevates."},
        {"icon": "bath", "title": "Bathroom Design", "description": "Spa-grade bathrooms."},
        {"icon": "briefcase", "title": "Home Office", "description": "Workspaces built for focus."},
    ],
    "why_choose_us": [
        {"icon": "calendar-check", "value": "45-Day", "label": "Delivery"},
        {"icon": "shield-check", "value": "10-Year", "label": "Warranty"},
        {"icon": "home", "value": "500+", "label": "Homes Designed"},
        {"icon": "credit-card", "value": "EMI", "label": "Available"},
        {"icon": "palette", "value": "50+", "label": "Design Styles"},
    ],
    "cost_matrix": {
        "1BHK": {"Basic": [350000, 500000], "Standard": [550000, 750000], "Premium": [800000, 1200000]},
        "2BHK": {"Basic": [500000, 750000], "Standard": [800000, 1100000], "Premium": [1200000, 1800000]},
        "3BHK": {"Basic": [750000, 1100000], "Standard": [1200000, 1700000], "Premium": [1800000, 2700000]},
        "4BHK": {"Basic": [1100000, 1500000], "Standard": [1700000, 2400000], "Premium": [2500000, 4000000]},
    },
    "gallery": [
        {"room": "Living Room", "title": "Warm minimal living", "url": "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=1200"},
        {"room": "Kitchen", "title": "Emerald modular", "url": "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200"},
        {"room": "Bedroom", "title": "Soft neutrals", "url": "https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=1200"},
        {"room": "Wardrobe", "title": "Walk-in luxury", "url": "https://images.unsplash.com/photo-1558985212-8378e29b0d09?w=1200"},
        {"room": "Bathroom", "title": "Spa retreat", "url": "https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?w=1200"},
        {"room": "Kids Room", "title": "Playful palette", "url": "https://images.unsplash.com/photo-1617104551722-3b2d51366400?w=1200"},
    ],
    "reviews": [
        {"name": "Anita R.", "flat": "3BHK", "locality": "Whitefield", "rating": 5, "text": "Loved the process — design to delivery was seamless."},
        {"name": "Raghav M.", "flat": "2BHK", "locality": "HSR Layout", "rating": 5, "text": "Quality is genuinely premium. Highly recommend."},
        {"name": "Priya S.", "flat": "4BHK", "locality": "Sarjapur", "rating": 5, "text": "Beautiful work. Our home turned out exactly as we imagined."},
    ],
    "faq": [
        {"q": "How long does it take?", "a": "Typically 45 days from design lock to handover."},
        {"q": "Do you offer EMI?", "a": "Yes — 0% EMI for up to 12 months on select packages."},
        {"q": "Is there a warranty?", "a": "Yes — 10 years on modular, 1 year on services."},
    ],
    "final_cta": {
        "headline": "Ready to design your dream home?",
        "subtext": "Book a free 60-minute consultation with a senior designer.",
        "cta": "Book Free Consultation",
        "background": "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=1600",
    },
}


@api.get("/content/{key}")
async def get_content(key: str):
    doc = await db.content.find_one({"key": key}, {"_id": 0})
    if doc:
        return doc.get("value", {})
    if key == "homepage":
        return DEFAULT_HOMEPAGE_CONTENT
    if key == "interiors":
        return DEFAULT_INTERIORS_CONTENT
    return {}


@api.put("/content/{key}")
async def set_content(key: str, payload: dict, user: dict = Depends(require_role("admin"))):
    await db.content.update_one(
        {"key": key},
        {"$set": {"key": key, "value": payload, "updated_at": iso(now_utc())}},
        upsert=True,
    )
    return payload


# ---------------------------------------------------------------------------
# ADMIN
# ---------------------------------------------------------------------------
@api.get("/admin/users")
async def admin_list_users(user: dict = Depends(require_role("admin"))):
    return await db.users.find({}, {"_id": 0, "password_hash": 0}).sort([("created_at", -1)]).to_list(1000)


@api.put("/admin/users/{user_id}")
async def admin_update_user(user_id: str, payload: dict, user: dict = Depends(require_role("admin"))):
    allowed = {"role", "is_active", "is_suspended", "is_verified", "name"}
    upd = {k: payload[k] for k in payload if k in allowed}
    await db.users.update_one({"user_id": user_id}, {"$set": upd})
    return await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})


@api.put("/admin/listings/{listing_id}/status")
async def admin_listing_status(listing_id: str, payload: dict, user: dict = Depends(require_role("admin"))):
    upd = {}
    if "status" in payload:
        upd["status"] = payload["status"]
    if "is_featured" in payload:
        upd["is_featured"] = bool(payload["is_featured"])
    if upd:
        await db.listings.update_one({"listing_id": listing_id}, {"$set": upd})
    return await db.listings.find_one({"listing_id": listing_id}, {"_id": 0})


@api.put("/admin/projects/{project_id}/status")
async def admin_project_status(project_id: str, payload: dict, user: dict = Depends(require_role("admin"))):
    upd = {}
    if "status" in payload:
        upd["status"] = payload["status"]
    if "is_featured" in payload:
        upd["is_featured"] = bool(payload["is_featured"])
    if upd:
        await db.projects.update_one({"project_id": project_id}, {"$set": upd})
    return await db.projects.find_one({"project_id": project_id}, {"_id": 0})


@api.get("/admin/analytics")
async def admin_analytics(user: dict = Depends(require_role("admin"))):
    return {
        "total_users": await db.users.count_documents({}),
        "total_listings": await db.listings.count_documents({}),
        "live_listings": await db.listings.count_documents({"status": "live"}),
        "total_projects": await db.projects.count_documents({}),
        "total_inquiries": await db.inquiries.count_documents({}),
        "new_inquiries": await db.inquiries.count_documents({"status": "new"}),
        "interior_leads": await db.interior_leads.count_documents({}),
        "loan_leads": await db.loan_leads.count_documents({}),
        "by_role": {
            "agent": await db.users.count_documents({"role": "agent"}),
            "builder": await db.users.count_documents({"role": "builder"}),
            "customer": await db.users.count_documents({"role": "customer"}),
        },
    }


@api.put("/me/profile")
async def update_my_profile(payload: dict, user: dict = Depends(current_user)):
    allowed = {"name", "mobile", "role", "picture"}
    upd = {k: payload[k] for k in payload if k in allowed and payload[k] not in (None, "")}
    if upd.get("role") and upd["role"] not in {"customer", "agent", "builder"}:
        upd.pop("role")
    upd["profile_completed"] = True
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": upd})
    return await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "password_hash": 0})


# ---------------------------------------------------------------------------
# CUSTOMER: favourites, recent searches
# ---------------------------------------------------------------------------
@api.post("/me/favourites")
async def add_favourite(payload: dict, user: dict = Depends(current_user)):
    await db.favourites.update_one(
        {"user_id": user["user_id"], "kind": payload["kind"], "ref_id": payload["ref_id"]},
        {"$set": {"user_id": user["user_id"], "kind": payload["kind"], "ref_id": payload["ref_id"], "at": iso(now_utc())}},
        upsert=True,
    )
    return {"ok": True}


@api.delete("/me/favourites/{kind}/{ref_id}")
async def remove_favourite(kind: str, ref_id: str, user: dict = Depends(current_user)):
    await db.favourites.delete_one({"user_id": user["user_id"], "kind": kind, "ref_id": ref_id})
    return {"ok": True}


@api.get("/me/favourites")
async def list_favourites(user: dict = Depends(current_user)):
    favs = await db.favourites.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(500)
    listing_ids = [f["ref_id"] for f in favs if f["kind"] == "listing"]
    project_ids = [f["ref_id"] for f in favs if f["kind"] == "project"]
    listings = await db.listings.find({"listing_id": {"$in": listing_ids}}, {"_id": 0}).to_list(500)
    projects = await db.projects.find({"project_id": {"$in": project_ids}}, {"_id": 0}).to_list(500)
    return {"listings": listings, "projects": projects}


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
        log.info("Seeds ensured")
    except Exception as e:
        log.error(f"seed failed: {e}")


@app.on_event("shutdown")
async def shutdown_event():
    client.close()
