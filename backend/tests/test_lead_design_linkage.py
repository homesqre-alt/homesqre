"""
Lead ↔ Design-project linkage (Feb 2026):
- "Ready for Quotation" status is seeded and auto-assigns to admin.
- Design projects gain a `lead_id` field and a `lead` summary on GET.
- Approving a verification auto-creates/links a lead (matched by email).
- When the customer approves the final render, the lead status auto-advances to
  "Ready for Quotation" and reassigns to admin.
- Designer can change the lead status / add a comment via the existing
  /leads/{id}/* endpoints (they're already assignees → workflow editable).
"""
import os
import asyncio
import uuid
import bcrypt
import pytest
import httpx
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

BASE_URL = os.environ.get("TEST_BASE_URL", "https://homesqre-styled.preview.emergentagent.com")
API = f"{BASE_URL}/api"

ADMIN = ("admin@homesqre.com", "Homesqre@2026")
CUSTOMER = ("leadlink-cust@homesqre.com", "Pass@123")
DESIGNER = ("leadlink-des@homesqre.com", "Pass@123")


def hp(p):
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()


def now_iso():
    return datetime.now(timezone.utc).isoformat()


@pytest.fixture(scope="module")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="module", autouse=True)
def seed(event_loop):
    async def _seed():
        c = AsyncIOMotorClient(os.environ["MONGO_URL"])
        db = c[os.environ["DB_NAME"]]
        for email, role in [(CUSTOMER[0], "customer"), (DESIGNER[0], "designer")]:
            await db.users.delete_one({"email": email})
            await db.users.insert_one({
                "user_id": f"user_{uuid.uuid4().hex[:12]}",
                "email": email, "name": email.split("@")[0],
                "mobile": "+919998877777" if role == "customer" else "+919998877222",
                "role": role,
                "is_verified": True, "profile_completed": True,
                "password_hash": hp(CUSTOMER[1] if email == CUSTOMER[0] else DESIGNER[1]),
                "created_at": now_iso(), "project_phase": "unpaid",
            })
        # purge prior leads for this customer to keep assertions deterministic
        await db.leads.delete_many({"email": CUSTOMER[0]})
        c.close()
    event_loop.run_until_complete(_seed())
    yield


def login(email, pwd):
    r = httpx.post(f"{API}/auth/login", json={"email": email, "password": pwd}, timeout=10)
    r.raise_for_status()
    return r.json()["token"]


def auth(t): return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="module")
def admin_token(): return login(*ADMIN)


@pytest.fixture(scope="module")
def customer_token(): return login(*CUSTOMER)


@pytest.fixture(scope="module")
def designer_token(): return login(*DESIGNER)


# ---------------------------------------------------------------------------
def test_ready_for_quotation_status_seeded(admin_token):
    statuses = httpx.get(f"{API}/crm/statuses", headers=auth(admin_token), timeout=10).json()
    by_name = {s["name"]: s for s in statuses}
    assert "Ready for Quotation" in by_name
    assert by_name["Ready for Quotation"]["assign_to_role"] == "admin"


def test_approval_links_lead_and_auto_promotes_to_quotation(
    admin_token, customer_token, designer_token, event_loop
):
    # 1. Customer submits a verification
    r = httpx.post(f"{API}/verifications", headers=auth(customer_token), json={
        "project_name": "Lead-link test project",
        "property_type": "apartment", "bhk_or_units": "3",
        "invoice_paid": 12000, "pdf_urls": ["/api/files/floor_link.pdf"],
        "room_requirements": "Lead link regression",
    }, timeout=10)
    assert r.status_code == 200, r.text
    ver_id = r.json()["verification_id"]

    # 2. Designer approves → backend auto-creates design project + links a lead
    a = httpx.put(f"{API}/admin/verifications/{ver_id}", headers=auth(designer_token), json={
        "action": "approve",
    }, timeout=10)
    assert a.status_code == 200, a.text
    proj_id = a.json()["design_project_id"]

    # 3. Inspect the design project — it now has a lead_id + embedded lead summary
    proj = httpx.get(f"{API}/admin/design/projects/{proj_id}", headers=auth(admin_token), timeout=10).json()
    assert proj.get("lead_id"), "design project missing lead_id after approve"
    assert proj.get("lead"), "design project missing embedded lead summary"
    lead_id = proj["lead_id"]
    assert proj["lead"]["lead_id"] == lead_id
    # Lead status promoted into design pipeline (Designing or Send to Design)
    assert proj["lead"]["status"] in ("Designing", "Send to Design")

    # 4. Designer uploads a render (mandatory comment)
    files = {"file": ("r1.png", b"\x89PNG\r\n\x1a\n" + b"\x00" * 64, "image/png")}
    up = httpx.post(
        f"{API}/admin/design/projects/{proj_id}/images",
        headers=auth(designer_token), files=files, data={"comment": "First render"},
        timeout=15,
    )
    assert up.status_code == 200, up.text
    image_id = up.json()["image_id"]

    # 5. Customer approves the only render → triggers _maybe_promote_to_quotation
    rev = httpx.put(
        f"{API}/design/my-project/images/{image_id}/review",
        headers=auth(customer_token), json={"decision": "approved"},
        timeout=10,
    )
    assert rev.status_code == 200, rev.text
    assert rev.json().get("ready_for_quotation") is True

    # 6. Linked lead must have advanced to "Ready for Quotation" + reassigned to admin
    lead = httpx.get(f"{API}/leads/{lead_id}", headers=auth(admin_token), timeout=10).json()
    assert lead["status"] == "Ready for Quotation", f"lead status was {lead['status']}"
    assert lead["assigned_to"] == ADMIN[0], f"lead reassignment failed: {lead['assigned_to']}"
    # History must record the system-driven status change
    last_hist = lead["history"][-1]
    assert last_hist["to_status"] == "Ready for Quotation"
    assert last_hist["by"] == "system:design-approved"


def test_designer_can_change_linked_lead_status_and_comment(
    admin_token, customer_token, designer_token
):
    # Re-use the lead from previous test (now status=Ready for Quotation)
    leads = httpx.get(f"{API}/leads?q={CUSTOMER[0]}", headers=auth(admin_token), timeout=10).json()
    assert leads["total"] >= 1
    lead = leads["items"][0]
    lead_id = lead["lead_id"]

    # Reassign back to designer so designer is authorized to touch workflow
    httpx.put(
        f"{API}/leads/{lead_id}",
        headers=auth(admin_token),
        json={"assigned_to": DESIGNER[0]},
        timeout=10,
    )

    # Designer adds a comment via the same endpoint sales uses
    r = httpx.post(
        f"{API}/leads/{lead_id}/comments",
        headers=auth(designer_token), json={"text": "Designer-side note: final render shared."},
        timeout=10,
    )
    assert r.status_code == 200, r.text

    # Designer flips status to "Designing"
    r2 = httpx.put(
        f"{API}/leads/{lead_id}/status",
        headers=auth(designer_token), json={"status": "Designing"},
        timeout=10,
    )
    assert r2.status_code == 200, r2.text

    fresh = httpx.get(f"{API}/leads/{lead_id}", headers=auth(admin_token), timeout=10).json()
    assert fresh["status"] == "Designing"
    assert any(c.get("text") == "Designer-side note: final render shared." for c in (fresh.get("comments") or []))
