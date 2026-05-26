"""Verifications + admin moderation."""
from typing import List, Optional
from pydantic import BaseModel, ConfigDict


class VerificationCreateRequest(BaseModel):
    property_type: str
    bhk_or_units: str
    invoice_paid: float
    pdf_url: Optional[str] = None
    pdf_urls: Optional[List[str]] = None
    room_requirements: str
    project_name: Optional[str] = None


class VerificationOut(BaseModel):
    """Customer + admin/designer-enriched payload. `extra='allow'` keeps the
    enrichment fields (customer, design_project_id, site_visit_at, etc.) flowing."""
    model_config = ConfigDict(extra="allow")

    verification_id: str
    user_id: str
    project_name: Optional[str] = None
    property_type: str
    bhk_or_units: str
    invoice_paid: float
    pdf_url: Optional[str] = None
    pdf_urls: Optional[List[str]] = None
    room_requirements: str
    status: str
    created_at: str


class VerificationModerateRequest(BaseModel):
    """`approve`, `reject_package`, or legacy `reject`. Different fields apply
    per action; we accept anything (`extra='allow'`) and validate per-action
    inside the route."""
    model_config = ConfigDict(extra="allow")
    action: str
    corrected_property_type: Optional[str] = None
    corrected_bhk_or_units: Optional[str] = None
    reason: Optional[str] = None
    deficit_amount: Optional[float] = None


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
