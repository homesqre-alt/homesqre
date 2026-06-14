"""Verifications + admin moderation."""
from typing import List, Optional
from pydantic import BaseModel, ConfigDict


class VerificationCreateRequest(BaseModel):
    property_type: Optional[str] = None
    bhk_or_units: Optional[str] = None
    invoice_paid: Optional[float] = 0
    pdf_url: Optional[str] = None
    pdf_urls: Optional[List[str]] = None
    room_requirements: Optional[str] = None
    project_name: Optional[str] = None
    budget_range: Optional[str] = None
    design_styles: Optional[str] = None


class VerificationOut(BaseModel):
    """Customer + admin/designer-enriched payload. `extra='allow'` keeps the
    enrichment fields (customer, design_project_id, site_visit_at, etc.) flowing."""
    model_config = ConfigDict(extra="allow")

    verification_id: str
    user_id: str
    project_name: Optional[str] = None
    property_type: Optional[str] = None
    bhk_or_units: Optional[str] = None
    invoice_paid: Optional[float] = 0
    pdf_url: Optional[str] = None
    pdf_urls: Optional[List[str]] = None
    room_requirements: str
    status: str
    created_at: str


class VerificationModerateRequest(BaseModel):
    """`assign_package` -> assign the package, discount, and expiry."""
    model_config = ConfigDict(extra="allow")
    action: str
    corrected_property_type: Optional[str] = None
    corrected_bhk_or_units: Optional[str] = None
    reason: Optional[str] = None
    discount_amount: Optional[float] = 0
    discount_expiry_hours: Optional[float] = 24


class VerificationModerateOut(BaseModel):
    """Returned by the moderate endpoint — shape varies by action:
    - approve → {ok, design_project_id}
    - reject_package → {ok, differential_amount, auto_approved}
    - reject → {ok}"""
    model_config = ConfigDict(extra="allow")
    ok: bool = True
    design_project_id: Optional[str] = None
    differential_amount: Optional[float] = None
    auto_approved: Optional[bool] = None
