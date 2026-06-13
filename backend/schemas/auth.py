"""Auth request/response shapes."""
from typing import Optional
from pydantic import BaseModel, EmailStr, ConfigDict


# ---- Requests -------------------------------------------------------------
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


class LoginOtpRequest(BaseModel):
    mobile: str


class LoginOtpVerifyRequest(BaseModel):
    mobile: str
    otp: str


class ForgotRequest(BaseModel):
    email: EmailStr


class ResetRequest(BaseModel):
    token: str
    new_password: str


class GoogleAuthRequest(BaseModel):
    token: str


# ---- Responses ------------------------------------------------------------
class UserOut(BaseModel):
    """Public-facing user shape. Extra fields (project_phase, project_name,
    lead_id, site_visit_at, package_adjustment, picture, …) are passed through
    untouched so existing UI code keeps working."""
    model_config = ConfigDict(extra="allow")

    user_id: str
    email: EmailStr
    name: Optional[str] = None
    mobile: Optional[str] = None
    role: str
    is_verified: Optional[bool] = None
    profile_completed: Optional[bool] = None
    project_phase: Optional[str] = None


class AuthResponse(BaseModel):
    """`/auth/login`, `/auth/register`, `/auth/google` all return this shape."""
    model_config = ConfigDict(extra="allow")

    user: UserOut
    token: str
