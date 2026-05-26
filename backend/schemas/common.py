"""Generic small response shapes used across many endpoints."""
from typing import Optional
from pydantic import BaseModel, ConfigDict


class OkResponse(BaseModel):
    """Standard "operation succeeded" reply. Many endpoints simply return {ok: true}.
    `extra='allow'` lets us tack on a small payload (e.g. `lead_id`) without
    defining a whole new response model."""
    model_config = ConfigDict(extra="allow")
    ok: bool = True


class MessageResponse(BaseModel):
    """`OkResponse` plus a human-readable note (department CRUD, etc.)."""
    ok: bool = True
    message: Optional[str] = None
