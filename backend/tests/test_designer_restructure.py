"""Designer-dashboard restructure regression (Feb 2026 v2):
- /leads must strip phone/email when caller is a designer
- /admin/design/projects/{id} must include the linked verification's pdf_urls
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

BASE_URL = os.environ.get("TEST_BASE_URL", "https://crm-phase-tracker.preview.emergentagent.com")
API = f"{BASE_URL}/api"

ADMIN = ("admin@homesqre.com", "Homesqre@2026")
CUSTOMER = ("designer-restructure-cust@homesqre.com", "Pass@123")
DESIGNER = ("designer-restructure-des@homesqre.com", "Pass@123")


def hp(p): return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()
def now_iso(): return datetime.now(timezone.utc).isoformat()
def auth(t): return {"Authorization": f"Bearer {t}"}


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
                "mobile": "+919998811111",
                "role": role,
                "is_verified": True, "profile_completed": True,
                "password_hash": hp(CUSTOMER[1] if email == CUSTOMER[0] else DESIGNER[1]),
                "created_at": now_iso(), "project_phase": "unpaid",
            })
        await db.leads.delete_many({"email": CUSTOMER[0]})
        c.close()
    event_loop.run_until_complete(_seed())
    yield


def login(email, pwd):
    r = httpx.post(f"{API}/auth/login", json={"email": email, "password": pwd}, timeout=10)
    r.raise_for_status()
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_token(): return login(*ADMIN)
@pytest.fixture(scope="module")
def customer_token(): return login(*CUSTOMER)
@pytest.fixture(scope="module")
def designer_token(): return login(*DESIGNER)


# ---------------------------------------------------------------------------
def test_leads_endpoint_strips_phone_email_for_designer(admin_token, designer_token):
    # Create a lead assigned to the designer
    lead = httpx.post(f"{API}/leads", headers=auth(admin_token), json={
        "name": "PII Test", "phone": "+9199999999", "email": "pii-test@example.com",
        "assigned_to": DESIGNER[0],
    }, timeout=10).json()
    lead_id = lead["lead_id"]

    # Designer list call → must NOT include phone/email
    items = httpx.get(f"{API}/leads?limit=10", headers=auth(designer_token), timeout=10).json()["items"]
    mine = next(li for li in items if li["lead_id"] == lead_id)
    assert "phone" not in mine, f"phone leaked to designer: {mine}"
    assert "email" not in mine, f"email leaked to designer: {mine}"

    # Designer detail call → also stripped
    detail = httpx.get(f"{API}/leads/{lead_id}", headers=auth(designer_token), timeout=10).json()
    assert "phone" not in detail
    assert "email" not in detail

    # Admin still sees them
    admin_view = httpx.get(f"{API}/leads/{lead_id}", headers=auth(admin_token), timeout=10).json()
    assert admin_view["phone"] == "+9199999999"
    assert admin_view["email"] == "pii-test@example.com"


def test_design_project_detail_includes_verification_pdfs(
    admin_token, customer_token, designer_token, event_loop,
):
    # 1. Customer submits verification with multi-file
    r = httpx.post(f"{API}/verifications", headers=auth(customer_token), json={
        "project_name": "Restructure verif",
        "property_type": "apartment", "bhk_or_units": "3",
        "invoice_paid": 12000,
        "pdf_urls": ["/api/files/restructure_a.pdf", "/api/files/restructure_b.pdf"],
        "room_requirements": "Test",
    }, timeout=10)
    assert r.status_code == 200, r.text
    ver_id = r.json()["verification_id"]

    # 2. Designer approves → design project auto-created with verification_id
    a = httpx.put(f"{API}/admin/verifications/{ver_id}", headers=auth(designer_token), json={
        "action": "approve",
    }, timeout=10)
    assert a.status_code == 200
    proj_id = a.json()["design_project_id"]

    # 3. Designer fetches the project detail → must include the verification
    #    record with `pdf_urls` so the UI can render download links.
    detail = httpx.get(f"{API}/admin/design/projects/{proj_id}", headers=auth(designer_token), timeout=10).json()
    assert detail.get("verification"), "design project detail missing 'verification'"
    assert detail["verification"]["pdf_urls"] == [
        "/api/files/restructure_a.pdf", "/api/files/restructure_b.pdf",
    ]
    # No phone/email anywhere in the designer payload
    assert "email" not in (detail.get("customer") or {})
    assert "mobile" not in (detail.get("customer") or {})
