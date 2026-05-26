"""Authentication routes: register, login, logout, /me, OTP, password reset, Google."""
import uuid
import secrets
from datetime import datetime, timezone, timedelta

from fastapi import Depends, HTTPException, Response
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

from core import (
    api, db, log, iso, now_utc, hash_password, verify_password,
    make_access_token, clean_doc, current_user, _set_auth_cookie,
    GOOGLE_CLIENT_ID,
)
from schemas import (
    RegisterRequest, LoginRequest, OtpVerifyRequest, ForgotRequest, ResetRequest,
    GoogleAuthRequest, UserOut, AuthResponse, OkResponse,
)


# ---------------------------------------------------------------------------
@api.post("/auth/register", response_model=AuthResponse)
async def auth_register(body: RegisterRequest, response: Response):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    # SECURITY: force all self-registered users to be customers
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


@api.post("/auth/verify-otp", response_model=OkResponse)
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


@api.post("/auth/login", response_model=AuthResponse)
async def auth_login(body: LoginRequest, response: Response):
    email = body.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not user.get("password_hash") or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = make_access_token(user["user_id"], email, user["role"])
    _set_auth_cookie(response, "access_token", token)
    return {"user": clean_doc(user), "token": token}


@api.post("/auth/logout", response_model=OkResponse)
async def auth_logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("session_token", path="/")
    return {"ok": True}


@api.get("/auth/me", response_model=UserOut)
async def auth_me(user: dict = Depends(current_user)):
    return user


@api.post("/auth/forgot-password", response_model=OkResponse)
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


@api.post("/auth/reset-password", response_model=OkResponse)
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


@api.post("/auth/google", response_model=AuthResponse)
async def auth_google(body: GoogleAuthRequest, response: Response):
    if not body.token:
        raise HTTPException(status_code=400, detail="No token provided")
    try:
        idinfo = id_token.verify_oauth2_token(body.token, google_requests.Request(), GOOGLE_CLIENT_ID)
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

