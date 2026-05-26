"""Shared infrastructure for the Homesqre backend.

All route modules import:
- `app` — the FastAPI application
- `api` — the `/api` APIRouter (every router registers its handlers on this single instance)
- `db` / `client` — the Mongo connection
- helpers (`now_utc`, `iso`, `hash_password`, …) and auth deps (`current_user`, `require_role`).

`server.py` imports each route module so their decorators run, then calls
`app.include_router(api)` exactly once.
"""

from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import re
import uuid
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

import bcrypt
import jwt
from fastapi import FastAPI, APIRouter, Request, Response, HTTPException, Depends
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient


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
GOOGLE_CLIENT_ID = "792218859682-0c3n97260bmmnihocosutpm00vvliivt.apps.googleusercontent.com"

# Cookie flags — set COOKIE_SAMESITE=none + COOKIE_SECURE=true in production
# when frontend and backend are on different domains.
COOKIE_SAMESITE = os.environ.get("COOKIE_SAMESITE", "lax").lower()
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "false").lower() == "true"

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="Homesqre API")
api = APIRouter(prefix="/api")

# Restricted CORS Origins (Security)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://homesqre.com", "http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s | %(message)s")
log = logging.getLogger("homesqre")


# ---------------------------------------------------------------------------
# Cookies
# ---------------------------------------------------------------------------
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


# ---------------------------------------------------------------------------
# Moderation helpers (legacy real-estate listings)
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
# Pure helpers
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


# ---------------------------------------------------------------------------
# Auth dependencies
# ---------------------------------------------------------------------------
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
