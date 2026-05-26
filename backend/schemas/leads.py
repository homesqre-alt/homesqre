"""Unified leads — CRM pipeline shapes."""
from typing import List, Optional
from pydantic import BaseModel, ConfigDict


# ---- Nested embedded shapes -----------------------------------------------
class LeadCommentOut(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: str
    by: Optional[str] = None
    by_name: Optional[str] = None
    text: str
    at: str


class LeadHistoryOut(BaseModel):
    model_config = ConfigDict(extra="allow")
    from_status: Optional[str] = None
    to_status: Optional[str] = None
    at: str
    by: Optional[str] = None


# ---- Lead ----------------------------------------------------------------
class LeadOut(BaseModel):
    """`extra='allow'` so legacy/migrated fields like `extra`, `auto_created_for_user`,
    `whatsapp`, `property_type`, etc. still come through."""
    model_config = ConfigDict(extra="allow")

    lead_id: str
    name: str
    phone: str
    email: Optional[str] = None
    budget_range: Optional[str] = ""
    message: Optional[str] = ""
    source: str
    status: str
    assigned_to: Optional[str] = None
    next_followup_at: Optional[str] = None
    comments: List[LeadCommentOut] = []
    history: List[LeadHistoryOut] = []
    created_at: str
    updated_at: Optional[str] = None
    created_by: Optional[str] = None


class LeadListOut(BaseModel):
    items: List[LeadOut]
    total: int


# ---- Requests -------------------------------------------------------------
class PublicLeadRequest(BaseModel):
    """Anonymous capture (homepage / customer dashboard CTAs)."""
    model_config = ConfigDict(extra="allow")
    name: str
    phone: str
    email: Optional[str] = None
    budget_range: Optional[str] = None
    message: Optional[str] = None
    source: Optional[str] = "Website"


class LeadCreateRequest(BaseModel):
    """Authenticated sales/admin create. Required fields enforced inside the
    handler (so we can return 400 with a friendly message instead of Pydantic's
    422 schema error)."""
    model_config = ConfigDict(extra="allow")
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    budget_range: Optional[str] = None
    message: Optional[str] = None
    source: Optional[str] = None
    status: Optional[str] = None
    assigned_to: Optional[str] = None
    next_followup_at: Optional[str] = None


class LeadUpdateRequest(BaseModel):
    """Admin-only full edit. Server filters down to its whitelist before write."""
    model_config = ConfigDict(extra="allow")
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    budget_range: Optional[str] = None
    message: Optional[str] = None
    source: Optional[str] = None
    next_followup_at: Optional[str] = None
    assigned_to: Optional[str] = None


class LeadStatusUpdateRequest(BaseModel):
    status: str


class LeadCommentCreateRequest(BaseModel):
    text: str


class LeadFollowupRequest(BaseModel):
    next_followup_at: Optional[str] = None  # ISO datetime; None clears it


class LeadStatusUpdateOut(BaseModel):
    ok: bool = True
    assigned_to: Optional[str] = None


# ---- Legacy compat shim model --------------------------------------------
class DiscoveryCallCreate(BaseModel):
    """Old discovery-call CTA still calls /api/discovery-calls. We keep the
    legacy body shape (name + phone) but write into the unified leads
    collection on the backend."""
    name: str
    phone: str
