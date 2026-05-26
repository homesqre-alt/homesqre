"""CRM Settings — statuses + sources."""
from typing import Optional
from pydantic import BaseModel, ConfigDict


class StatusOut(BaseModel):
    name: str
    sort_order: int
    assign_to_role: Optional[str] = None


class StatusCreateRequest(BaseModel):
    name: str
    sort_order: int = 999
    assign_to_role: Optional[str] = None


class StatusUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    sort_order: Optional[int] = None
    assign_to_role: Optional[str] = None


class SourceOut(BaseModel):
    name: str
    sort_order: int


class SourceCreateRequest(BaseModel):
    name: str
    sort_order: int = 999


class SourceUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    sort_order: Optional[int] = None
