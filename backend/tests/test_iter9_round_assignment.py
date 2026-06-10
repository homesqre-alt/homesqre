"""
Iteration 9 — Round Assignment and Project Promotion Tests.

Covers:
- Sequential uploads in same session share the same round number
- project_all_approved() only checks the LATEST round's images
- Project promotes to ready_for_quotation when latest round is fully approved
  even when earlier rounds have needs_improvement images
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
CUSTOMER2 = ("round-test-cust@homesqre.com", "Pass@123")
DESIGNER2 = ("round-test-des@homesqre.com", "Pass@123")


def hp(p): return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()
def now(): return datetime.now(timezone.utc).isoformat()

# Minimal 1x1 PNG
PNG_BYTES = bytes.fromhex(
    "89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C489"
    "0000000A49444154789C6300010000000500010D0A2DB40000000049454E44AE426082"
)


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
        for email, role in [(CUSTOMER2[0], "customer"), (DESIGNER2[0], "designer")]:
            await db.users.delete_one({"email": email})
            await db.users.insert_one({
                "user_id": f"user_{uuid.uuid4().hex[:12]}",
                "email": email, "name": email.split("@")[0],
                "mobile": "+919000000000", "role": role,
                "is_verified": True, "profile_completed": True,
                "password_hash": hp(CUSTOMER2[1]),
                "created_at": now(), "project_phase": "unpaid",
            })
        cu = await db.users.find_one({"email": CUSTOMER2[0]})
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


def upload_image(token, project_id, comment="test render"):
    files = {"file": ("render.png", PNG_BYTES, "image/png")}
    data = {"comment": comment}
    return httpx.post(
        f"{API}/admin/design/projects/{project_id}/images",
        headers=auth(token), files=files, data=data, timeout=60,
    )


@pytest.fixture(scope="module")
def admin_token(): return login(*ADMIN)


@pytest.fixture(scope="module")
def customer_token(): return login(*CUSTOMER2)


@pytest.fixture(scope="module")
def designer_token(): return login(*DESIGNER2)


@pytest.fixture(scope="module")
def customer_uid(customer_token):
    return httpx.get(f"{API}/auth/me", headers=auth(customer_token), timeout=10).json()["user_id"]


@pytest.fixture(scope="module")
def project_id(admin_token, customer_uid):
    r = httpx.post(f"{API}/admin/design/projects/start/{customer_uid}",
                   headers=auth(admin_token), timeout=10)
    assert r.status_code == 200
    return r.json()["project_id"]


# ──────────────────────────────────────────────────────────────────────────────
# Test 1: Sequential uploads share the same round number
# ──────────────────────────────────────────────────────────────────────────────
def test_first_upload_creates_round_1(designer_token, project_id):
    """First upload creates round 1."""
    r = upload_image(designer_token, project_id, "Round 1 - Image A")
    assert r.status_code == 200
    data = r.json()
    assert data["round"] == 1, f"Expected round=1, got {data['round']}"
    assert data["customer_status"] == "pending"
    print(f"  Image A → round={data['round']}")


def test_sequential_upload_shares_round_1(designer_token, project_id):
    """Second upload while first is still pending → same round 1."""
    r = upload_image(designer_token, project_id, "Round 1 - Image B (sequential)")
    assert r.status_code == 200
    data = r.json()
    assert data["round"] == 1, f"Expected round=1 (pending images exist), got {data['round']}"
    print(f"  Image B (sequential) → round={data['round']}")


def test_project_has_two_round1_images(customer_token):
    """Project should now have 2 images, both round 1."""
    p = httpx.get(f"{API}/design/my-project", headers=auth(customer_token), timeout=30).json()
    imgs = p["images"]
    assert len(imgs) == 2, f"Expected 2 images, got {len(imgs)}"
    round1_imgs = [i for i in imgs if i["round"] == 1]
    assert len(round1_imgs) == 2, f"Expected 2 round-1 images, got {len(round1_imgs)}"
    pending = [i for i in imgs if i["customer_status"] == "pending"]
    assert len(pending) == 2
    print(f"  ✓ 2 images in round 1, both pending")


# ──────────────────────────────────────────────────────────────────────────────
# Test 2: project_all_approved checks LATEST round only
# ──────────────────────────────────────────────────────────────────────────────
def test_customer_flags_one_needs_improvement(customer_token):
    """Customer marks Image A as needs_improvement → project stays in_progress."""
    p = httpx.get(f"{API}/design/my-project", headers=auth(customer_token), timeout=30).json()
    img_a = p["images"][0]["image_id"]
    r = httpx.put(
        f"{API}/design/my-project/images/{img_a}/review",
        headers=auth(customer_token),
        json={"decision": "needs_improvement", "comment": "Colour too dark"},
        timeout=10,
    )
    assert r.status_code == 200
    assert r.json()["ready_for_quotation"] is False
    print("  ✓ needs_improvement → project still in_progress")


def test_customer_approves_second_round1_image(customer_token):
    """Customer approves Image B — but there's still a pending? No, both reviewed now.
    Image A=needs_improvement, Image B=approved → not all approved → no promotion."""
    p = httpx.get(f"{API}/design/my-project", headers=auth(customer_token), timeout=30).json()
    pending = [i for i in p["images"] if i["customer_status"] == "pending"]
    assert len(pending) == 1  # Image B still pending
    img_b = pending[0]["image_id"]
    r = httpx.put(
        f"{API}/design/my-project/images/{img_b}/review",
        headers=auth(customer_token),
        json={"decision": "approved"},
        timeout=10,
    )
    assert r.status_code == 200
    # Not all of round 1 approved (Image A is needs_improvement) — no promotion
    assert r.json()["ready_for_quotation"] is False
    print("  ✓ Round 1 mixed (1 needs_improvement + 1 approved) → no promotion")


def test_designer_uploads_round2_starts_new_round(designer_token, project_id):
    """After all round-1 images reviewed (no pending), new upload creates round 2."""
    r = upload_image(designer_token, project_id, "Round 2 - Revised colours")
    assert r.status_code == 200
    data = r.json()
    assert data["round"] == 2, f"Expected round=2 (no pending images), got {data['round']}"
    print(f"  ✓ New upload after all reviewed → round={data['round']}")

def test_project_promotes_when_latest_round_approved(customer_token):
    """Approving the single round-2 image should promote project.
    Old round-1 needs_improvement image does NOT block promotion."""
    p = httpx.get(f"{API}/design/my-project", headers=auth(customer_token), timeout=30).json()
    # Find the round-2 pending image
    round2_pending = [i for i in p["images"] if i["round"] == 2 and i["customer_status"] == "pending"]
    assert len(round2_pending) == 1
    img_id = round2_pending[0]["image_id"]
    r = httpx.put(
        f"{API}/design/my-project/images/{img_id}/review",
        headers=auth(customer_token),
        json={"decision": "approved"},
        timeout=10,
    )
    assert r.status_code == 200
    result = r.json()
    # The latest round (2) is fully approved → project MUST promote
    assert result["ready_for_quotation"] is True, (
        f"Expected ready_for_quotation=True but got {result}. "
        "Old round-1 needs_improvement images should NOT block promotion."
    )
    print("  ✓ Latest round (2) fully approved → project promoted to ready_for_quotation")


def test_customer_phase_advanced_to_ready_for_quotation(customer_token):
    """Customer phase should now be ready_for_quotation (shows in Completed tab)."""
    me = httpx.get(f"{API}/auth/me", headers=auth(customer_token), timeout=30).json()
    assert me["project_phase"] == "ready_for_quotation", (
        f"Expected ready_for_quotation, got {me['project_phase']}. "
        "Bug: project keeps returning to Active Projects instead of Completed."
    )
    print(f"  ✓ Customer phase = {me['project_phase']} (project is in Completed tab)")


def test_project_status_in_db_is_ready_for_quotation(admin_token, project_id):
    """Admin should see this project in ready_for_quotation filter."""
    r = httpx.get(
        f"{API}/admin/design/projects?status_filter=ready_for_quotation",
        headers=auth(admin_token), timeout=30
    )
    assert r.status_code == 200
    items = r.json()
    assert any(p["project_id"] == project_id for p in items), (
        "Project not found in ready_for_quotation filter — it may still be in in_progress."
    )
    print(f"  ✓ Project visible in admin ready_for_quotation filter")
