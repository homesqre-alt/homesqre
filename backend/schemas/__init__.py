"""Pydantic schemas — typed request/response shapes that drive both runtime
validation and the OpenAPI spec exposed at `/docs`.

Naming convention:
- `*Request` → request body model
- `*Out`    → response model
- `*ListOut` → paginated list response

We deliberately use `model_config = {"extra": "allow"}` on most response models
so admin-enriched fields (`customer`, `lead`, `site_visit_at`, …) flow through
without ever losing data if the backend adds new attributes later.
"""

from .common import OkResponse, MessageResponse  # noqa: F401
from .auth import (  # noqa: F401
    RegisterRequest, LoginRequest, OtpVerifyRequest,
    ForgotRequest, ResetRequest, GoogleAuthRequest,
    UserOut, AuthResponse,
)
from .crm import (  # noqa: F401
    StatusOut, StatusCreateRequest, StatusUpdateRequest,
    SourceOut, SourceCreateRequest, SourceUpdateRequest,
)
from .leads import (  # noqa: F401
    LeadOut, LeadCommentOut, LeadHistoryOut, LeadListOut,
    PublicLeadRequest, LeadCreateRequest, LeadUpdateRequest,
    LeadStatusUpdateRequest, LeadCommentCreateRequest, LeadFollowupRequest,
    LeadStatusUpdateOut, DiscoveryCallCreate,
)
from .verifications import (  # noqa: F401
    VerificationCreateRequest, VerificationOut,
    VerificationModerateRequest, VerificationModerateOut,
)
from .design import (  # noqa: F401
    DesignImageOut, DesignProjectOut,
    ImageReviewRequest, ImageReviewOut,
    DesignProjectStartOut, QuotationStatusRequest,
)
from .admin import (  # noqa: F401
    AnalyticsCardsOut, AnalyticsBucket, AnalyticsDayBucket, AnalyticsOverviewOut,
    EmployeeOut, EmployeeCreateRequest, EmployeeUpdateRequest,
)
from .me import (  # noqa: F401
    PhaseUpdateRequest, PhaseUpdateOut,
    SiteVisitRequest, SiteVisitOut,
    PackageAdjustmentOut,
    MobileOtpRequest, MobileUpdateRequest, PasswordUpdateRequest,
)
