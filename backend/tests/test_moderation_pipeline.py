"""Moderation pipeline regression tests.

Covers:
  - New submissions default to status='pending'
  - Public endpoints hide non-approved items
  - Owner can fetch their own pending detail; public cannot
  - /admin/moderation/queue returns counts and items
  - approve / reject endpoints flip status and persist rejection_reason
  - Migration backfill keeps no 'live' status anywhere
"""

import os
import uuid
import requests


BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = ("admin@homesqre.com", "Homesqre@2026")
AGENT = ("agent@homesqre.com", "Agent@2026")
BUILDER = ("builder@homesqre.com", "Builder@2026")


def _login(email: str, password: str) -> tuple[dict, dict]:
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    return {"Authorization": f"Bearer {body['token']}"}, body["user"]


def test_no_live_status_remains():
    h, _ = _login(*ADMIN)
    for path in ("listings", "projects"):
        items = requests.get(f"{API}/{path}?status=all&limit=500", headers=h, timeout=15).json()
        live = [i for i in items if i.get("status") == "live"]
        assert live == [], f"{path} still has legacy live status: {live}"


def test_agent_listing_defaults_to_pending_even_if_approved_requested():
    h, _ = _login(*AGENT)
    payload = {
        "title": f"Mod test {uuid.uuid4().hex[:6]}",
        "kind": "sale", "city": "Bangalore", "locality": "Whitefield",
        "price": 5000000, "bedrooms": 2, "bathrooms": 2, "area_sqft": 1100,
        "property_type": "Apartment", "status": "approved",  # MUST be ignored
    }
    r = requests.post(f"{API}/listings", headers=h, json=payload, timeout=15)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "pending"
    # cleanup
    requests.delete(f"{API}/listings/{r.json()['listing_id']}", headers=h, timeout=15)


def test_builder_project_defaults_to_pending():
    h, _ = _login(*BUILDER)
    payload = {
        "name": f"Mod Test Project {uuid.uuid4().hex[:6]}",
        "city": "Bangalore", "locality": "Whitefield",
        "price_min": 5000000, "price_max": 8000000,
        "status": "approved",  # MUST be ignored for non-admin
    }
    r = requests.post(f"{API}/projects", headers=h, json=payload, timeout=15)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "pending"
    requests.delete(f"{API}/projects/{r.json()['project_id']}", headers=h, timeout=15)


def test_builder_locality_defaults_to_pending():
    h, _ = _login(*BUILDER)
    name = f"ModTest {uuid.uuid4().hex[:6]}"
    r = requests.post(f"{API}/localities", headers=h, json={"name": name, "city": "Bangalore"}, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "pending"
    # Public list should NOT include it
    public = requests.get(f"{API}/localities").json()
    assert not any(loc["name"] == name for loc in public)


def test_admin_locality_creation_is_approved():
    h, _ = _login(*ADMIN)
    name = f"AdminTest {uuid.uuid4().hex[:6]}"
    r = requests.post(f"{API}/localities", headers=h, json={"name": name, "city": "Bangalore"}, timeout=15)
    assert r.status_code == 200
    assert r.json()["status"] == "approved"


def test_pending_listing_hidden_from_public_detail():
    h_agent, _ = _login(*AGENT)
    payload = {
        "title": f"Hidden test {uuid.uuid4().hex[:6]}",
        "kind": "rent", "city": "Bangalore", "locality": "HSR Layout",
        "price": 45000, "bedrooms": 2, "bathrooms": 2, "area_sqft": 1000,
        "property_type": "Apartment",
    }
    r = requests.post(f"{API}/listings", headers=h_agent, json=payload, timeout=15)
    lid = r.json()["listing_id"]
    try:
        # Public: 404
        pub = requests.get(f"{API}/listings/{lid}", timeout=15)
        assert pub.status_code == 404
        # Owner agent: 200
        own = requests.get(f"{API}/listings/{lid}", headers=h_agent, timeout=15)
        assert own.status_code == 200
        # Admin: 200
        h_admin, _ = _login(*ADMIN)
        adm = requests.get(f"{API}/listings/{lid}", headers=h_admin, timeout=15)
        assert adm.status_code == 200
    finally:
        requests.delete(f"{API}/listings/{lid}", headers=h_agent, timeout=15)


def test_moderation_queue_returns_pending():
    # Create one pending listing, then check it's in the queue
    h_agent, _ = _login(*AGENT)
    payload = {
        "title": f"Queue test {uuid.uuid4().hex[:6]}",
        "kind": "sale", "city": "Bangalore", "locality": "Hebbal",
        "price": 8500000, "bedrooms": 3, "bathrooms": 2, "area_sqft": 1400,
        "property_type": "Apartment",
    }
    lid = requests.post(f"{API}/listings", headers=h_agent, json=payload, timeout=15).json()["listing_id"]
    try:
        h_admin, _ = _login(*ADMIN)
        queue = requests.get(f"{API}/admin/moderation/queue", headers=h_admin, timeout=15).json()
        assert "counts" in queue
        assert queue["counts"]["total"] >= 1
        ids = [item["listing_id"] for item in queue["listings"]]
        assert lid in ids
    finally:
        requests.delete(f"{API}/listings/{lid}", headers=h_agent, timeout=15)


def test_moderation_queue_requires_admin():
    h_agent, _ = _login(*AGENT)
    r = requests.get(f"{API}/admin/moderation/queue", headers=h_agent, timeout=15)
    assert r.status_code == 403


def test_approve_listing_makes_it_public():
    h_agent, _ = _login(*AGENT)
    payload = {
        "title": f"Approve test {uuid.uuid4().hex[:6]}",
        "kind": "sale", "city": "Bangalore", "locality": "Indiranagar",
        "price": 12000000, "bedrooms": 3, "bathrooms": 3, "area_sqft": 1700,
        "property_type": "Apartment",
    }
    lid = requests.post(f"{API}/listings", headers=h_agent, json=payload, timeout=15).json()["listing_id"]
    h_admin, _ = _login(*ADMIN)
    try:
        # Approve
        r = requests.put(f"{API}/admin/listings/{lid}/moderation",
                         headers=h_admin, json={"action": "approve"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["status"] == "approved"
        # Now public can read
        pub = requests.get(f"{API}/listings/{lid}", timeout=15)
        assert pub.status_code == 200
    finally:
        requests.delete(f"{API}/listings/{lid}", headers=h_agent, timeout=15)


def test_reject_listing_stores_reason():
    h_agent, _ = _login(*AGENT)
    payload = {
        "title": f"Reject test {uuid.uuid4().hex[:6]}",
        "kind": "sale", "city": "Bangalore", "locality": "Hebbal",
        "price": 9000000, "bedrooms": 2, "bathrooms": 2, "area_sqft": 1100,
        "property_type": "Apartment",
    }
    lid = requests.post(f"{API}/listings", headers=h_agent, json=payload, timeout=15).json()["listing_id"]
    h_admin, _ = _login(*ADMIN)
    try:
        r = requests.put(f"{API}/admin/listings/{lid}/moderation",
                         headers=h_admin,
                         json={"action": "reject", "reason": "Photos missing"}, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "rejected"
        assert body["rejection_reason"] == "Photos missing"
        # Public still 404
        assert requests.get(f"{API}/listings/{lid}", timeout=15).status_code == 404
    finally:
        requests.delete(f"{API}/listings/{lid}", headers=h_agent, timeout=15)


def test_moderation_invalid_action_400():
    h_admin, _ = _login(*ADMIN)
    # pick any existing listing
    item = requests.get(f"{API}/listings?status=all&limit=1").json()[0]
    r = requests.put(f"{API}/admin/listings/{item['listing_id']}/moderation",
                     headers=h_admin, json={"action": "explode"}, timeout=15)
    assert r.status_code == 400


def test_moderate_unknown_id_returns_404():
    h_admin, _ = _login(*ADMIN)
    r = requests.put(f"{API}/admin/listings/lst_does_not_exist/moderation",
                     headers=h_admin, json={"action": "approve"}, timeout=15)
    assert r.status_code == 404


def test_analytics_includes_pending_counts():
    h, _ = _login(*ADMIN)
    a = requests.get(f"{API}/admin/analytics", headers=h, timeout=15).json()
    for key in ("pending_listings", "pending_projects", "pending_localities"):
        assert key in a
        assert isinstance(a[key], int)
