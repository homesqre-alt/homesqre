"""
Workflow tweaks regression suite (Feb 2026):
- Customer briefing accepts `project_name` + multiple `pdf_urls`
- Customer.project_name is persisted on the user record
- Designer's `/admin/design/projects` & `/admin/verifications` hide email/mobile
  (privacy) and show only customer name + project_name
- Admin's view of the same endpoints DOES include email/mobile
- New admin analytics endpoint returns expected cards + chart data
- MasterLeadPipeline supports a `followup=today` filter (regression check)
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
CUSTOMER = ("workflow-cust@homesqre.com", "Pass@123")
DESIGNER = ("workflow-des@homesqre.com", "Pass@123")


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
def seed_users(event_loop):
    async def _seed():
        c = AsyncIOMotorClient(os.environ["MONGO_URL"])
        db = c[os.environ["DB_NAME"]]
        for email, role in [(CUSTOMER[0], "customer"), (DESIGNER[0], "designer")]:
            await db.users.delete_one({"email": email})
            await db.users.insert_one({
                "user_id": f"user_{uuid.uuid4().hex[:12]}",
                "email": email, "name": email.split("@")[0],
                "mobile": "+919999911111", "role": role,
                "is_verified": True, "profile_completed": True,
                "password_hash": hp(CUSTOMER[1] if email == CUSTOMER[0] else DESIGNER[1]),
                "created_at": now_iso(), "project_phase": "unpaid",
            })
        c.close()
    event_loop.run_until_complete(_seed())
    yield


def login(email, pwd):
    r = httpx.post(f"{API}/auth/login", json={"email": email, "password": pwd}, timeout=10)
    r.raise_for_status()
    return r.json()["token"]


def auth(t):
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="module")
def admin_token():
    return login(*ADMIN)


@pytest.fixture(scope="module")
def customer_token():
    return login(*CUSTOMER)


@pytest.fixture(scope="module")
def designer_token():
    return login(*DESIGNER)


# ---------------------------------------------------------------------------
# Verification model — project_name + multi-file
# ---------------------------------------------------------------------------
def test_verification_accepts_project_name_and_multiple_pdf_urls(customer_token, admin_token):
    pdfs = [f"/api/files/floor_{i}.pdf" for i in range(3)]
    r = httpx.post(f"{API}/verifications", headers=auth(customer_token), json={
        "project_name": "Lotus Apartment 3BHK",
        "property_type": "apartment",
        "bhk_or_units": "3",
        "invoice_paid": 12000,
        "pdf_urls": pdfs,
        "room_requirements": "Pooja unit in living room.",
    }, timeout=10)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["project_name"] == "Lotus Apartment 3BHK"
    assert body["pdf_urls"] == pdfs
    assert body["pdf_url"] == pdfs[0]    # legacy field kept

    # Customer's user record now has project_name
    me = httpx.get(f"{API}/auth/me", headers=auth(customer_token), timeout=10).json()
    assert me["project_name"] == "Lotus Apartment 3BHK"

    # Admin sees full customer info on the verification list
    items = httpx.get(f"{API}/admin/verifications", headers=auth(admin_token), timeout=10).json()
    mine = next(v for v in items if v["verification_id"] == body["verification_id"])
    assert mine["customer"]["email"] == CUSTOMER[0]
    assert mine["customer"]["project_name"] == "Lotus Apartment 3BHK"


def test_verification_rejects_empty_pdf_urls(customer_token):
    r = httpx.post(f"{API}/verifications", headers=auth(customer_token), json={
        "project_name": "No file test",
        "property_type": "apartment", "bhk_or_units": "3",
        "invoice_paid": 12000, "pdf_urls": [], "room_requirements": "x",
    }, timeout=10)
    assert r.status_code == 400


def test_verification_legacy_single_pdf_still_works(customer_token):
    r = httpx.post(f"{API}/verifications", headers=auth(customer_token), json={
        "property_type": "apartment", "bhk_or_units": "3",
        "invoice_paid": 12000, "pdf_url": "/api/files/legacy.pdf",
        "room_requirements": "Legacy client",
    }, timeout=10)
    assert r.status_code == 200
    body = r.json()
    assert body["pdf_urls"] == ["/api/files/legacy.pdf"]


# ---------------------------------------------------------------------------
# Designer privacy — designer must NOT see email / mobile
# ---------------------------------------------------------------------------
def test_designer_verifications_hide_email_mobile(designer_token):
    items = httpx.get(f"{API}/admin/verifications", headers=auth(designer_token), timeout=10).json()
    assert len(items) > 0
    for v in items:
        cust = v.get("customer") or {}
        # designer must NOT see email or mobile
        assert "email" not in cust, f"designer leaked email: {cust}"
        assert "mobile" not in cust, f"designer leaked mobile: {cust}"
        # name + project_name still allowed
        assert "name" in cust or "project_name" in cust


def test_designer_design_projects_hide_email_mobile(designer_token, admin_token, customer_token, event_loop):
    """Start a design project for the customer, then verify designer view is sanitized."""
    async def _start():
        c = AsyncIOMotorClient(os.environ["MONGO_URL"])
        db = c[os.environ["DB_NAME"]]
        u = await db.users.find_one({"email": CUSTOMER[0]})
        c.close()
        return u["user_id"]
    user_id = event_loop.run_until_complete(_start())
    r = httpx.post(f"{API}/admin/design/projects/start/{user_id}", headers=auth(admin_token), timeout=10)
    assert r.status_code == 200, r.text

    # Designer list
    items = httpx.get(f"{API}/admin/design/projects", headers=auth(designer_token), timeout=10).json()
    target = next(p for p in items if p["user_id"] == user_id)
    cust = target.get("customer") or {}
    assert "email" not in cust
    assert "mobile" not in cust
    assert cust.get("project_name") == "Lotus Apartment 3BHK"

    # Designer detail
    detail = httpx.get(f"{API}/admin/design/projects/{target['project_id']}", headers=auth(designer_token), timeout=10).json()
    dc = detail.get("customer") or {}
    assert "email" not in dc
    assert "mobile" not in dc

    # Admin view DOES include them
    admin_detail = httpx.get(f"{API}/admin/design/projects/{target['project_id']}", headers=auth(admin_token), timeout=10).json()
    ac = admin_detail.get("customer") or {}
    assert ac.get("email") == CUSTOMER[0]
    assert "mobile" in ac


# ---------------------------------------------------------------------------
# Admin analytics overview
# ---------------------------------------------------------------------------
def test_admin_analytics_overview_shape(admin_token):
    r = httpx.get(f"{API}/admin/analytics/overview", headers=auth(admin_token), timeout=10)
    assert r.status_code == 200
    body = r.json()
    for key in ("cards", "leads_by_status", "leads_by_source", "leads_by_day", "customers_by_phase"):
        assert key in body
    card_keys = {"total_retainers", "pending_verifications", "active_site_visits",
                 "in_3d_design", "ready_for_quotation", "followups_today"}
    assert card_keys.issubset(set(body["cards"].keys()))
    assert len(body["leads_by_day"]) == 14   # last 14 days


def test_admin_analytics_overview_forbidden_for_non_admin(designer_token):
    r = httpx.get(f"{API}/admin/analytics/overview", headers=auth(designer_token), timeout=10)
    assert r.status_code == 403


# ---------------------------------------------------------------------------
# Leads followup=today filter still functions (CRM "Follow-ups Today" button)
# ---------------------------------------------------------------------------
def test_leads_followup_today_filter(admin_token):
    r = httpx.get(f"{API}/leads?followup=today", headers=auth(admin_token), timeout=10)
    assert r.status_code == 200
    body = r.json()
    assert "items" in body
    assert "total" in body


# ---------------------------------------------------------------------------
# Approved-floor-plans wiring: approval auto-creates design project, advances
# phase to 'designing', and exposes design_project_id on /admin/verifications.
# Site-visit endpoint lets the customer pick date/time.
# ---------------------------------------------------------------------------
def test_approve_floor_plan_wires_design_and_site_visit(customer_token, designer_token, admin_token):
    # Fresh verification for this scenario (legacy single-file path is fine).
    r = httpx.post(f"{API}/verifications", headers=auth(customer_token), json={
        "project_name": "Wiring Test Project",
        "property_type": "apartment", "bhk_or_units": "3",
        "invoice_paid": 12000, "pdf_urls": ["/api/files/floor_wiring.pdf"],
        "room_requirements": "Wiring regression",
    }, timeout=10)
    assert r.status_code == 200, r.text
    ver_id = r.json()["verification_id"]

    # Designer approves → backend must return design_project_id, phase=designing
    a = httpx.put(f"{API}/admin/verifications/{ver_id}", headers=auth(designer_token), json={
        "action": "approve",
    }, timeout=10)
    assert a.status_code == 200, a.text
    proj_id = a.json().get("design_project_id")
    assert proj_id, "approve response missing design_project_id"

    me = httpx.get(f"{API}/auth/me", headers=auth(customer_token), timeout=10).json()
    assert me["project_phase"] == "designing"
    assert me.get("site_visit_at") in (None, ""), "site_visit_at must be cleared so the banner shows"

    # Admin sees the approved verification with design_project_id + site_visit_at attached
    admin_items = httpx.get(f"{API}/admin/verifications", headers=auth(admin_token), timeout=10).json()
    found = next(v for v in admin_items if v["verification_id"] == ver_id)
    assert found["design_project_id"] == proj_id
    assert "site_visit_at" in found

    # Designer also sees the same shape via the same endpoint (privacy still applies)
    des_items = httpx.get(f"{API}/admin/verifications", headers=auth(designer_token), timeout=10).json()
    des_found = next(v for v in des_items if v["verification_id"] == ver_id)
    assert des_found["design_project_id"] == proj_id
    assert "email" not in (des_found.get("customer") or {})

    # Customer books site visit
    when = "2026-06-15T10:30:00"
    sv = httpx.put(f"{API}/me/site-visit", headers=auth(customer_token), json={
        "site_visit_at": when,
    }, timeout=10)
    assert sv.status_code == 200
    assert sv.json()["site_visit_at"] == when

    me2 = httpx.get(f"{API}/auth/me", headers=auth(customer_token), timeout=10).json()
    assert me2["site_visit_at"] == when

    # Admin now sees the confirmed slot on the verification
    after = httpx.get(f"{API}/admin/verifications", headers=auth(admin_token), timeout=10).json()
    after_v = next(v for v in after if v["verification_id"] == ver_id)
    assert after_v["site_visit_at"] == when


def test_site_visit_endpoint_rejects_empty():
    cust_token = login(*CUSTOMER)
    r = httpx.put(f"{API}/me/site-visit", headers=auth(cust_token), json={
        "site_visit_at": "",
    }, timeout=10)
    assert r.status_code == 400
