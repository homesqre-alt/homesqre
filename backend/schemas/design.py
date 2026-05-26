"""3D Design Iteration loop shapes."""
from typing import List, Optional
from pydantic import BaseModel, ConfigDict


class DesignImageOut(BaseModel):
    model_config = ConfigDict(extra="allow")
    image_id: str
    url: str
    filename: Optional[str] = None
    designer_comment: Optional[str] = None
    customer_status: str          # 'pending' | 'approved' | 'needs_improvement'
    customer_comment: Optional[str] = None
    round: int = 1
    uploaded_at: str
    uploaded_by: Optional[str] = None
    reviewed_at: Optional[str] = None


class DesignProjectOut(BaseModel):
    """Customer/admin/designer view of a project. `extra='allow'` keeps
    `customer`, `lead`, `site_visit_at`, `quotation_status` flowing without
    forcing every consumer to extend the model."""
    model_config = ConfigDict(extra="allow")

    project_id: str
    user_id: str
    lead_id: Optional[str] = None
    verification_id: Optional[str] = None
    designer_id: Optional[str] = None
    status: str                   # 'in_progress' | 'ready_for_quotation'
    quotation_status: Optional[str] = None
    images: List[DesignImageOut] = []
    created_at: str
    updated_at: Optional[str] = None
    approved_at: Optional[str] = None


class ImageReviewRequest(BaseModel):
    decision: str                 # 'approved' | 'needs_improvement'
    comment: Optional[str] = None


class ImageReviewOut(BaseModel):
    ok: bool = True
    ready_for_quotation: bool = False


class DesignProjectStartOut(BaseModel):
    ok: bool = True
    project_id: str


class QuotationStatusRequest(BaseModel):
    quotation_status: str
