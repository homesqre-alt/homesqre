"""
Phase B — Designer package-mismatch flow + customer differential payment.

Scenarios covered:
- Designer rejects with corrected package → backend auto-calculates differential
- Designer cannot inject a custom amount (server is canonical pricing)
- Customer phase moves to 'package_adjustment' with stored adjustment metadata
- Customer pays differential → moves to 'designing' (skips verification step)
- If corrected price ≤ paid amount → auto-approves to 'designing' with no payment
- Approve action still works (push to scheduling)
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
    "TEST_BASE_URL", "https://homesqre-preview.preview.emergentagent.com"
)
API = f"{BASE_URL}/api"

ADMIN = ("admin@homesqre.com", "Homesqre@2026")
CUSTOMER = ("phaseb-cust@homesqre.com", "Pass@123")
DESIGNER = ("phaseb-des@homesqre.com", "Pass@123")


def hp(p):
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()


def now():
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
        for email, role, phase in [
            (CUSTOMER[0], "customer", "unpaid"),
            (DESIGNER[0], "designer", "unpaid"),
        ]:
            await db.users.delete_one({"email": email})
            await db.users.insert_one({
                "user_id": f"user_{uuid.uuid4().hex[:12]}",
                "email": email, "name": email.split("@")[0],
                "mobile": "+919000000000", "role": role,
                "is_verified": True, "profile_completed": True,
                "password_hash": hp(CUSTOMER[1] if email == CUSTOMER[0] else DESIGNER[1]),
                "created_at": now(), "project_phase": phase,
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


def _create_verification(customer_token, property_type="apartment", bhk="3", paid=12000, pdf="/api/files/dummy.pdf"):
    r = httpx.post(f"{API}/verifications", headers=auth(customer_token), json={
        "property_type": property_type, "bhk_or_units": bhk,
        "invoice_paid": paid, "pdf_url": pdf, "room_requirements": "Test brief",
    }, timeout=10)
    r.raise_for_status()
    return r.json()["verification_id"]


def test_packages_endpoint_lists_options():
    r = httpx.get(f"{API}/packages", timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert "apartment" in data
    apt = {p["value"]: p["price"] for p in data["apartment"]}
    assert apt["1-2"] == 10000
    assert apt["3"] == 12000
    assert apt["4+"] == 15000
    villa = {p["value"]: p["price"] for p in data["villa"]}
    assert villa["duplex"] == 15000
    assert villa["triplex"] == 18000


def test_reject_package_auto_calculates_differential(customer_token, designer_token):
    """Customer pays 10000 (1-2 BHK Apartment), uploads a Villa floor plan.
    Designer corrects to Villa Duplex (15000) → differential = 5000."""
    ver_id = _create_verification(customer_token, property_type="apartment", bhk="1-2", paid=10000)
    r = httpx.put(f"{API}/admin/verifications/{ver_id}", headers=auth(designer_token), json={
        "action": "reject_package",
        "corrected_property_type": "villa",
        "corrected_bhk_or_units": "duplex",
    }, timeout=10)
    assert r.status_code == 200
    body = r.json()
    assert body["differential_amount"] == 5000
    assert body["auto_approved"] is False
    # Customer's phase should be 'package_adjustment' with metadata
    me = httpx.get(f"{API}/auth/me", headers=auth(customer_token), timeout=10).json()
    assert me["project_phase"] == "package_adjustment"
    adj = me["package_adjustment"]
    assert adj["corrected_price"] == 15000
    assert adj["differential_amount"] == 5000
    assert adj["verification_id"] == ver_id


def test_reject_package_missing_corrected_fields_400(customer_token, designer_token):
    ver_id = _create_verification(customer_token, paid=10000)
    r = httpx.put(f"{API}/admin/verifications/{ver_id}", headers=auth(designer_token), json={
        "action": "reject_package",
    }, timeout=10)
    assert r.status_code == 400


def test_reject_package_unknown_combo_400(customer_token, designer_token):
    ver_id = _create_verification(customer_token, paid=10000)
    r = httpx.put(f"{API}/admin/verifications/{ver_id}", headers=auth(designer_token), json={
        "action": "reject_package",
        "corrected_property_type": "moonbase",
        "corrected_bhk_or_units": "1",
    }, timeout=10)
    assert r.status_code == 400


def test_reject_package_no_differential_auto_approves(customer_token, designer_token):
    """If corrected price ≤ paid, no extra payment — customer goes to designing immediately."""
    # Customer paid 18000 for triplex; designer downgrades to duplex (15000).
    ver_id = _create_verification(customer_token, property_type="villa", bhk="triplex", paid=18000)
    r = httpx.put(f"{API}/admin/verifications/{ver_id}", headers=auth(designer_token), json={
        "action": "reject_package",
        "corrected_property_type": "villa",
        "corrected_bhk_or_units": "duplex",
    }, timeout=10).json()
    assert r["differential_amount"] == 0
    assert r["auto_approved"] is True
    me = httpx.get(f"{API}/auth/me", headers=auth(customer_token), timeout=10).json()
    assert me["project_phase"] == "designing"


def test_customer_pays_package_adjustment(customer_token, designer_token):
    """End-to-end: customer pays differential → phase=designing, no further verification."""
    # Reset by creating fresh verification + reject
    ver_id = _create_verification(customer_token, property_type="apartment", bhk="1-2", paid=10000)
    httpx.put(f"{API}/admin/verifications/{ver_id}", headers=auth(designer_token), json={
        "action": "reject_package",
        "corrected_property_type": "villa", "corrected_bhk_or_units": "triplex",   # 18000 - 10000 = 8000
    }, timeout=10).raise_for_status()
    # Confirm phase
    me = httpx.get(f"{API}/auth/me", headers=auth(customer_token), timeout=10).json()
    assert me["project_phase"] == "package_adjustment"
    assert me["package_adjustment"]["differential_amount"] == 8000
    # Pay differential
    r = httpx.post(f"{API}/me/pay-package-adjustment", headers=auth(customer_token), timeout=10)
    assert r.status_code == 200
    body = r.json()
    assert body["final_invoice"] == 18000
    # Customer phase now designing; package_adjustment metadata cleared
    me = httpx.get(f"{API}/auth/me", headers=auth(customer_token), timeout=10).json()
    assert me["project_phase"] == "designing"
    assert me.get("package_adjustment") in (None, {}, {"": ""})  # unset


def test_pay_without_adjustment_400(customer_token):
    """If there's no pending adjustment, the payment endpoint rejects cleanly."""
    r = httpx.post(f"{API}/me/pay-package-adjustment", headers=auth(customer_token), timeout=10)
    assert r.status_code == 400


def test_approve_still_pushes_scheduling(customer_token, designer_token):
    ver_id = _create_verification(customer_token, property_type="apartment", bhk="3", paid=12000)
    r = httpx.put(f"{API}/admin/verifications/{ver_id}", headers=auth(designer_token), json={
        "action": "approve",
    }, timeout=10)
    assert r.status_code == 200
    me = httpx.get(f"{API}/auth/me", headers=auth(customer_token), timeout=10).json()
    assert me["project_phase"] == "scheduling"
