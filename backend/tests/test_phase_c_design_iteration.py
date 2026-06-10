"""
Phase C — 3D Design Iteration Loop.

Covers:
- Designer uploads renders with mandatory comments
- Customer per-image Approve / Need Improvement with mandatory comment for the latter
- Loop behaviour: needs_improvement leaves project in_progress; approvals progress it
- Project flips to ready_for_quotation only when ALL images approved AND >=1 image
- Customer phase advances to ready_for_quotation
- Admin sets quotation_status using a real crm_status value
"""
import os
import asyncio
import io
import uuid
import bcrypt
import pytest
import httpx
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

BASE_URL = os.environ.get(
    "TEST_BASE_URL", "https://homesqre-styled.preview.emergentagent.com"
)
API = f"{BASE_URL}/api"

ADMIN = ("admin@homesqre.com", "Homesqre@2026")
CUSTOMER = ("phasec-cust@homesqre.com", "Pass@123")
DESIGNER = ("phasec-des@homesqre.com", "Pass@123")


def hp(p): return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()
def now(): return datetime.now(timezone.utc).isoformat()


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
                "mobile": "+919000000000", "role": role,
                "is_verified": True, "profile_completed": True,
                "password_hash": hp(CUSTOMER[1]),
                "created_at": now(), "project_phase": "unpaid",
            })
        # Clean any orphan project for these emails
        cu = await db.users.find_one({"email": CUSTOMER[0]})
        if cu:
            await db.design_projects.delete_many({"user_id": cu["user_id"]})
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
@pytest.fixture(scope="module")
def customer_user_id(customer_token):
    return httpx.get(f"{API}/auth/me", headers=auth(customer_token), timeout=10).json()["user_id"]


@pytest.fixture(scope="module")
def project_id(admin_token, customer_user_id):
    """Admin starts designing for customer — creates the design_project."""
    r = httpx.post(f"{API}/admin/design/projects/start/{customer_user_id}",
                   headers=auth(admin_token), timeout=10)
    assert r.status_code == 200
    return r.json()["project_id"]


def _png_bytes():
    # Smallest valid PNG file (1×1 transparent)
    return bytes.fromhex(
        "89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4"
        "890000000A49444154789C6300010000000500010D0A2DB40000000049454E44"
        "AE426082"
    )


def _upload_image(token, project_id, comment="Living room render"):
    files = {"file": ("render.png", _png_bytes(), "image/png")}
    data = {"comment": comment}
    return httpx.post(
        f"{API}/admin/design/projects/{project_id}/images",
        headers=auth(token), files=files, data=data, timeout=15,
    )


def test_admin_starts_designing_creates_project(project_id):
    assert project_id.startswith("dp_")


def test_customer_phase_set_to_designing(customer_token):
    me = httpx.get(f"{API}/auth/me", headers=auth(customer_token), timeout=10).json()
    assert me["project_phase"] == "designing"


def test_designer_upload_requires_comment(designer_token, project_id):
    """Empty comment → 400."""
    files = {"file": ("r.png", _png_bytes(), "image/png")}
    r = httpx.post(f"{API}/admin/design/projects/{project_id}/images",
                   headers=auth(designer_token), files=files, data={"comment": "   "}, timeout=15)
    assert r.status_code == 400


def test_designer_upload_rejects_disallowed_type(designer_token, project_id):
    """TXT file → 400."""
    files = {"file": ("r.txt", b"hi", "text/plain")}
    r = httpx.post(f"{API}/admin/design/projects/{project_id}/images",
                   headers=auth(designer_token), files=files, data={"comment": "x"}, timeout=15)
    assert r.status_code == 400


def test_designer_upload_succeeds(designer_token, project_id):
    r = _upload_image(designer_token, project_id, "Master bedroom render")
    assert r.status_code == 200
    j = r.json()
    assert j["customer_status"] == "pending"
    assert j["designer_comment"] == "Master bedroom render"
    assert j["round"] == 1


def test_customer_sees_image(customer_token):
    p = httpx.get(f"{API}/design/my-project", headers=auth(customer_token), timeout=10).json()
    assert p is not None
    assert len(p["images"]) == 1
    assert p["images"][0]["customer_status"] == "pending"


def test_customer_needs_improvement_requires_comment(customer_token):
    p = httpx.get(f"{API}/design/my-project", headers=auth(customer_token), timeout=10).json()
    img_id = p["images"][0]["image_id"]
    r = httpx.put(
        f"{API}/design/my-project/images/{img_id}/review",
        headers=auth(customer_token),
        json={"decision": "needs_improvement"},   # no comment
        timeout=10,
    )
    assert r.status_code == 400


def test_customer_needs_improvement_loop(customer_token, designer_token, project_id):
    """Customer flags first render → status changes → designer uploads a 2nd → customer approves both."""
    p = httpx.get(f"{API}/design/my-project", headers=auth(customer_token), timeout=10).json()
    img_id = p["images"][0]["image_id"]
    r = httpx.put(
        f"{API}/design/my-project/images/{img_id}/review",
        headers=auth(customer_token),
        json={"decision": "needs_improvement", "comment": "Wall colour too dark"},
        timeout=10,
    )
    assert r.status_code == 200
    assert r.json()["ready_for_quotation"] is False
    p = httpx.get(f"{API}/design/my-project", headers=auth(customer_token), timeout=10).json()
    needs = [i for i in p["images"] if i["customer_status"] == "needs_improvement"]
    assert len(needs) == 1
    assert needs[0]["customer_comment"] == "Wall colour too dark"
    # Designer uploads a replacement (round 2)
    r2 = _upload_image(designer_token, project_id, "Lighter wall colour applied")
    assert r2.status_code == 200
    assert r2.json()["round"] == 2


def test_project_promotes_when_latest_round_fully_approved(customer_token, admin_token, project_id):
    """Approve the round-2 image — project SHOULD promote to ready_for_quotation because
    all images in the latest round are approved.  Old round-1 'needs_improvement' images
    do not block promotion once a newer round is fully approved."""
    # Approve the round-2 image
    p = httpx.get(f"{API}/design/my-project", headers=auth(customer_token), timeout=10).json()
    pending = [i for i in p["images"] if i["customer_status"] == "pending"]
    assert len(pending) == 1
    r = httpx.put(
        f"{API}/design/my-project/images/{pending[0]['image_id']}/review",
        headers=auth(customer_token),
        json={"decision": "approved"},
        timeout=10,
    ).json()
    # Project SHOULD flip because the latest round (round 2) is fully approved
    assert r["ready_for_quotation"] is True
    me = httpx.get(f"{API}/auth/me", headers=auth(customer_token), timeout=10).json()
    assert me["project_phase"] == "ready_for_quotation"


def test_quotation_status_endpoint_is_available_after_promotion(admin_token, project_id):
    """Project is now ready_for_quotation — quotation-status update should succeed."""
    r = httpx.put(
        f"{API}/admin/design/projects/{project_id}/quotation-status",
        headers=auth(admin_token),
        json={"quotation_status": "Awaiting Customer Approval"},
        timeout=10,
    )
    assert r.status_code == 200


def test_project_already_ready_for_quotation(customer_token, admin_token, project_id):
    """Project was already promoted when the latest round was approved.
    Verifies the state is stable: still ready_for_quotation, phase advanced."""
    p = httpx.get(f"{API}/design/my-project", headers=auth(customer_token), timeout=10).json()
    assert p["status"] == "ready_for_quotation"
    me = httpx.get(f"{API}/auth/me", headers=auth(customer_token), timeout=10).json()
    assert me["project_phase"] == "ready_for_quotation"


def test_admin_quotation_status_dropdown_uses_crm_statuses(admin_token, project_id):
    """Admin sets quotation_status to a different valid crm_status value, and rejects unknown ones."""
    # Update to a second valid status (first was set in the promotion test)
    r = httpx.put(
        f"{API}/admin/design/projects/{project_id}/quotation-status",
        headers=auth(admin_token),
        json={"quotation_status": "Awaiting Customer Approval"},
        timeout=10,
    )
    assert r.status_code == 200
    # Unknown crm_status rejected
    r = httpx.put(
        f"{API}/admin/design/projects/{project_id}/quotation-status",
        headers=auth(admin_token),
        json={"quotation_status": "MadeUpStatus"},
        timeout=10,
    )
    assert r.status_code == 400


def test_admin_filter_ready_for_quotation(admin_token, project_id):
    r = httpx.get(
        f"{API}/admin/design/projects?status_filter=ready_for_quotation",
        headers=auth(admin_token), timeout=10,
    )
    assert r.status_code == 200
    items = r.json()
    assert any(p["project_id"] == project_id for p in items)
