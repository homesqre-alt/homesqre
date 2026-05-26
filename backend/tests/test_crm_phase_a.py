"""
Phase A — Master CRM regression suite.
Exercises every /leads, /crm endpoint plus role gates and auto-assignment.
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

BASE_URL = os.environ.get(
    "TEST_BASE_URL",
    "https://homesqre-preview.preview.emergentagent.com",
)
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@homesqre.com"
ADMIN_PASS = "Homesqre@2026"
SALES_EMAIL = "salestest@homesqre.com"
SALES_PASS = "Pass@123"
DESIGNER_EMAIL = "designertest@homesqre.com"
DESIGNER_PASS = "Pass@123"


def hp(p):
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()


def now():
    return datetime.now(timezone.utc).isoformat()


@pytest.fixture(scope="module", autouse=True)
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="module")
def seeded_users(event_loop):
    """Ensure deterministic test users exist."""
    async def _seed():
        client = AsyncIOMotorClient(os.environ["MONGO_URL"])
        db = client[os.environ["DB_NAME"]]
        for email, role in [(SALES_EMAIL, "sales"), (DESIGNER_EMAIL, "designer")]:
            await db.users.delete_one({"email": email})
            await db.users.insert_one({
                "user_id": f"user_{uuid.uuid4().hex[:12]}",
                "email": email, "name": email.split("@")[0],
                "mobile": "+919000000000", "role": role,
                "is_verified": True, "profile_completed": True,
                "password_hash": hp("Pass@123"),
                "created_at": now(), "project_phase": "unpaid",
            })
        client.close()
    event_loop.run_until_complete(_seed())
    yield


def login(email, password):
    r = httpx.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    r.raise_for_status()
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_token(seeded_users):
    return login(ADMIN_EMAIL, ADMIN_PASS)


@pytest.fixture(scope="module")
def sales_token(seeded_users):
    return login(SALES_EMAIL, SALES_PASS)


@pytest.fixture(scope="module")
def designer_token(seeded_users):
    return login(DESIGNER_EMAIL, DESIGNER_PASS)


def auth(token):
    return {"Authorization": f"Bearer {token}"}


# ============ CRM SETTINGS ============
def test_crm_default_seeds(admin_token):
    statuses = httpx.get(f"{API}/crm/statuses", headers=auth(admin_token), timeout=10).json()
    names = [s["name"] for s in statuses]
    assert "New" in names
    assert "Send to Design" in names
    sources = httpx.get(f"{API}/crm/sources", headers=auth(admin_token), timeout=10).json()
    src_names = [s["name"] for s in sources]
    assert "Website" in src_names
    assert "Reference" in src_names


def test_crm_status_crud(admin_token):
    # Create
    r = httpx.post(f"{API}/crm/statuses", headers=auth(admin_token),
                   json={"name": "TestStatus", "assign_to_role": "sales"}, timeout=10)
    assert r.status_code == 200
    # Update sort_order
    r = httpx.put(f"{API}/crm/statuses/TestStatus", headers=auth(admin_token),
                  json={"sort_order": 99}, timeout=10)
    assert r.status_code == 200
    # Delete (not in use)
    r = httpx.delete(f"{API}/crm/statuses/TestStatus", headers=auth(admin_token), timeout=10)
    assert r.status_code == 200


def test_crm_source_admin_only(sales_token):
    r = httpx.post(f"{API}/crm/sources", headers=auth(sales_token),
                   json={"name": "ShouldFail"}, timeout=10)
    assert r.status_code in (401, 403)


# ============ LEAD CRUD + ROLE GATES ============
def test_lead_create_admin(admin_token):
    r = httpx.post(f"{API}/leads", headers=auth(admin_token), json={
        "name": "Pytest Admin Lead", "phone": f"9{uuid.uuid4().int % 1000000000:09d}",
        "source": "Website", "status": "New",
    }, timeout=10)
    assert r.status_code == 200
    lead_id = r.json()["lead_id"]
    # cleanup
    httpx.delete(f"{API}/leads/{lead_id}", headers=auth(admin_token), timeout=10)


def test_lead_create_sales_auto_assigns_self(sales_token):
    r = httpx.post(f"{API}/leads", headers=auth(sales_token), json={
        "name": "Pytest Sales Lead",
        "phone": f"9{uuid.uuid4().int % 1000000000:09d}",
    }, timeout=10)
    assert r.status_code == 200
    assert r.json()["assigned_to"] == SALES_EMAIL


def test_lead_create_requires_name_phone(admin_token):
    r = httpx.post(f"{API}/leads", headers=auth(admin_token), json={"name": "x"}, timeout=10)
    assert r.status_code == 400


def test_lead_create_rejects_unknown_status(admin_token):
    r = httpx.post(f"{API}/leads", headers=auth(admin_token), json={
        "name": "x", "phone": "9999900000", "status": "NotARealStatus"
    }, timeout=10)
    assert r.status_code == 400


def test_lead_list_sales_scoped_to_self(sales_token):
    r = httpx.get(f"{API}/leads", headers=auth(sales_token), timeout=10)
    assert r.status_code == 200
    items = r.json()["items"]
    assert all((i.get("assigned_to") or "") == SALES_EMAIL for i in items), \
        "Sales should only see their own leads"


def test_sales_cannot_delete(sales_token, admin_token):
    # Sales creates a lead, then tries to delete it.
    r = httpx.post(f"{API}/leads", headers=auth(sales_token), json={
        "name": "Pytest Del Try", "phone": f"9{uuid.uuid4().int % 1000000000:09d}",
    }, timeout=10).json()
    lid = r["lead_id"]
    r = httpx.delete(f"{API}/leads/{lid}", headers=auth(sales_token), timeout=10)
    assert r.status_code in (401, 403)
    # admin cleanup
    httpx.delete(f"{API}/leads/{lid}", headers=auth(admin_token), timeout=10)


def test_sales_cannot_use_admin_put_endpoint(sales_token):
    """The /leads/{id} PUT is admin-only; sales must use the focused workflow endpoints."""
    # create a lead first
    r = httpx.post(f"{API}/leads", headers=auth(sales_token), json={
        "name": "Pytest CoreEdit Try", "phone": f"9{uuid.uuid4().int % 1000000000:09d}",
    }, timeout=10).json()
    lid = r["lead_id"]
    r = httpx.put(f"{API}/leads/{lid}", headers=auth(sales_token), json={"name": "hacked"}, timeout=10)
    assert r.status_code in (401, 403)


def test_status_change_auto_reassigns_role(sales_token, designer_token, admin_token):
    """Lead created by sales → status flipped to 'Send to Design' → should reassign to designer."""
    r = httpx.post(f"{API}/leads", headers=auth(sales_token), json={
        "name": "Pytest Reassign", "phone": f"9{uuid.uuid4().int % 1000000000:09d}",
    }, timeout=10).json()
    lid = r["lead_id"]
    r = httpx.put(f"{API}/leads/{lid}/status", headers=auth(sales_token),
                  json={"status": "Send to Design"}, timeout=10).json()
    assert r["assigned_to"] == DESIGNER_EMAIL
    # Designer should now see it in their list
    items = httpx.get(f"{API}/leads", headers=auth(designer_token), timeout=10).json()["items"]
    assert any(i["lead_id"] == lid for i in items)
    # Cleanup
    httpx.delete(f"{API}/leads/{lid}", headers=auth(admin_token), timeout=10)


def test_comment_only_assignee_or_admin(sales_token, designer_token, admin_token):
    r = httpx.post(f"{API}/leads", headers=auth(sales_token), json={
        "name": "Pytest Comment", "phone": f"9{uuid.uuid4().int % 1000000000:09d}",
    }, timeout=10).json()
    lid = r["lead_id"]
    # Sales (assignee) can comment ✓
    r = httpx.post(f"{API}/leads/{lid}/comments", headers=auth(sales_token),
                   json={"text": "ringing"}, timeout=10)
    assert r.status_code == 200
    # Designer (not assignee) cannot ✗
    r = httpx.post(f"{API}/leads/{lid}/comments", headers=auth(designer_token),
                   json={"text": "nope"}, timeout=10)
    assert r.status_code in (401, 403)
    # Admin always can ✓
    r = httpx.post(f"{API}/leads/{lid}/comments", headers=auth(admin_token),
                   json={"text": "admin note"}, timeout=10)
    assert r.status_code == 200
    httpx.delete(f"{API}/leads/{lid}", headers=auth(admin_token), timeout=10)


def test_followup_and_filter(sales_token, admin_token):
    future = "2030-12-31T10:00:00"
    r = httpx.post(f"{API}/leads", headers=auth(sales_token), json={
        "name": "Pytest Followup", "phone": f"9{uuid.uuid4().int % 1000000000:09d}",
    }, timeout=10).json()
    lid = r["lead_id"]
    httpx.put(f"{API}/leads/{lid}/followup", headers=auth(sales_token),
              json={"next_followup_at": future}, timeout=10)
    # Upcoming filter should include it
    items = httpx.get(f"{API}/leads?followup=upcoming", headers=auth(admin_token), timeout=10).json()["items"]
    assert any(i["lead_id"] == lid for i in items)
    # Overdue filter should NOT
    items = httpx.get(f"{API}/leads?followup=overdue", headers=auth(admin_token), timeout=10).json()["items"]
    assert all(i["lead_id"] != lid for i in items)
    httpx.delete(f"{API}/leads/{lid}", headers=auth(admin_token), timeout=10)


# ============ PUBLIC + SHIM ENDPOINTS ============
def test_public_lead_capture():
    r = httpx.post(f"{API}/leads/public", json={
        "name": "Public Pytest", "phone": "9100000001", "email": "p@x.com",
    }, timeout=10)
    assert r.status_code == 200
    assert r.json()["ok"] is True


def test_public_lead_requires_name_phone():
    r = httpx.post(f"{API}/leads/public", json={"name": "x"}, timeout=10)
    assert r.status_code == 400


def test_interior_leads_shim_writes_unified():
    r = httpx.post(f"{API}/interior-leads", json={
        "name": "Shim Pytest", "phone": "9100000002",
        "property_type": "Apartment", "flat_size": "3BHK", "budget": "₹5L – ₹8L",
    }, timeout=10)
    assert r.status_code == 200
    assert "lead_id" in r.json()


def test_discovery_calls_shim_writes_unified():
    r = httpx.post(f"{API}/discovery-calls", json={
        "name": "Discovery Pytest", "phone": "9100000003",
    }, timeout=10)
    assert r.status_code == 200


# ============ CSV EXPORT ============
def test_csv_export_admin_only(admin_token, sales_token):
    r = httpx.get(f"{API}/leads/export.csv", headers=auth(admin_token), timeout=15)
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/csv")
    assert b"lead_id,name,phone,email" in r.content
    # Sales cannot export
    r = httpx.get(f"{API}/leads/export.csv", headers=auth(sales_token), timeout=15)
    assert r.status_code in (401, 403)


# ============ BUDGET OPTIONS ============
def test_budget_options_public():
    r = httpx.get(f"{API}/crm/budget-options", timeout=10)
    assert r.status_code == 200
    opts = r.json()
    assert "Under ₹3L" in opts
    assert "Not Sure" in opts
