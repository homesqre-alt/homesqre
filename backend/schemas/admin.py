"""Admin analytics + departments shapes."""
from typing import List, Optional
from pydantic import BaseModel, ConfigDict


# ---- Analytics ------------------------------------------------------------
class AnalyticsCardsOut(BaseModel):
    total_retainers: float
    pending_verifications: int
    active_site_visits: int
    in_3d_design: int
    ready_for_quotation: int
    followups_today: int


class AnalyticsBucket(BaseModel):
    name: str
    count: int


class AnalyticsDayBucket(BaseModel):
    date: str
    count: int


class AnalyticsOverviewOut(BaseModel):
    cards: AnalyticsCardsOut
    leads_by_status: List[AnalyticsBucket]
    leads_by_source: List[AnalyticsBucket]
    leads_by_day: List[AnalyticsDayBucket]
    customers_by_phase: List[AnalyticsBucket]


# ---- Departments / Employees ---------------------------------------------
class EmployeeOut(BaseModel):
    model_config = ConfigDict(extra="allow")

    user_id: str
    email: str
    name: Optional[str] = None
    mobile: Optional[str] = None
    role: str
    is_verified: Optional[bool] = None
    created_at: Optional[str] = None


class EmployeeCreateRequest(BaseModel):
    email: str
    role: str
    password: str
    phone: Optional[str] = ""


class EmployeeUpdateRequest(BaseModel):
    role: str
