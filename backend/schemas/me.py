"""Customer-side /me/* request + response shapes."""
from pydantic import BaseModel


class PhaseUpdateRequest(BaseModel):
    phase: str


class PhaseUpdateOut(BaseModel):
    ok: bool = True
    project_phase: str


class SiteVisitRequest(BaseModel):
    site_visit_at: str    # ISO datetime; empty string → 400


class SiteVisitOut(BaseModel):
    ok: bool = True
    site_visit_at: str


class PackageAdjustmentOut(BaseModel):
    ok: bool = True
    final_invoice: int
