"""Admin override tests for create/update of listings & projects.

Validates:
  - Admin can assign agent_id / builder_id on create
  - Admin create defaults status to "approved" (no migration queue trip)
  - Admin can submit any of pending/approved/rejected explicitly
  - Admin can reassign owner via PUT
  - Non-admins cannot reassign ownership (agent_id silently stripped)
"""
import os
import uuid
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = ("admin@homesqre.com", "Homesqre@2026")
AGENT = ("agent@homesqre.com", "Agent@2026")
BUILDER = ("builder@homesqre.com", "Builder@2026")


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    return {"Authorization": f"Bearer {r.json()['token']}"}, r.json()["user"]


def _user_id(headers, role):
    users = requests.get(f"{API}/admin/users", headers=headers, timeout=15).json()
    return next(u["user_id"] for u in users if u["role"] == role)


def test_admin_create_listing_assigns_agent_and_approves():
    h_admin, admin = _login(*ADMIN)
    agent_id = _user_id(h_admin, "agent")
    payload = {
        "title": f"AdminOwn {uuid.uuid4().hex[:6]}",
        "kind": "sale", "city": "Bangalore", "locality": "Whitefield",
        "price": 5000000, "bedrooms": 2, "bathrooms": 2, "area_sqft": 1000,
        "property_type": "Apartment", "agent_id": agent_id,
    }
    r = requests.post(f"{API}/listings", headers=h_admin, json=payload, timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert body["agent_id"] == agent_id
    assert body["status"] == "approved"
    requests.delete(f"{API}/listings/{body['listing_id']}", headers=h_admin, timeout=15)


def test_admin_create_listing_without_owner_defaults_to_admin():
    h_admin, admin = _login(*ADMIN)
    payload = {
        "title": f"AdminSelf {uuid.uuid4().hex[:6]}",
        "kind": "sale", "city": "Bangalore", "locality": "HSR Layout",
        "price": 4000000, "bedrooms": 2, "bathrooms": 2, "area_sqft": 900,
        "property_type": "Apartment",
    }
    body = requests.post(f"{API}/listings", headers=h_admin, json=payload, timeout=15).json()
    assert body["agent_id"] == admin["user_id"]
    assert body["status"] == "approved"
    requests.delete(f"{API}/listings/{body['listing_id']}", headers=h_admin, timeout=15)


def test_admin_create_listing_with_explicit_pending():
    h_admin, _ = _login(*ADMIN)
    body = requests.post(f"{API}/listings", headers=h_admin, json={
        "title": f"AdminPending {uuid.uuid4().hex[:6]}",
        "kind": "sale", "city": "Bangalore", "locality": "Hebbal",
        "price": 5500000, "bedrooms": 2, "bathrooms": 2, "area_sqft": 1100,
        "property_type": "Apartment", "status": "pending",
    }, timeout=15).json()
    assert body["status"] == "pending"
    requests.delete(f"{API}/listings/{body['listing_id']}", headers=h_admin, timeout=15)


def test_admin_can_reassign_owner_via_put():
    h_admin, admin = _login(*ADMIN)
    agent_id = _user_id(h_admin, "agent")
    builder_id = _user_id(h_admin, "builder")
    # create with agent
    created = requests.post(f"{API}/listings", headers=h_admin, json={
        "title": f"Reassign {uuid.uuid4().hex[:6]}",
        "kind": "sale", "city": "Bangalore", "locality": "Whitefield",
        "price": 7000000, "bedrooms": 3, "bathrooms": 2, "area_sqft": 1300,
        "property_type": "Apartment", "agent_id": agent_id,
    }, timeout=15).json()
    lid = created["listing_id"]
    # reassign to builder
    r = requests.put(f"{API}/listings/{lid}", headers=h_admin, json={"agent_id": builder_id}, timeout=15)
    assert r.status_code == 200
    assert r.json()["agent_id"] == builder_id
    requests.delete(f"{API}/listings/{lid}", headers=h_admin, timeout=15)


def test_non_admin_cannot_reassign_owner():
    h_agent, agent = _login(*AGENT)
    h_admin, _ = _login(*ADMIN)
    builder_id = _user_id(h_admin, "builder")
    # agent creates own listing
    created = requests.post(f"{API}/listings", headers=h_agent, json={
        "title": f"AgentOwned {uuid.uuid4().hex[:6]}",
        "kind": "sale", "city": "Bangalore", "locality": "Whitefield",
        "price": 5500000, "bedrooms": 2, "bathrooms": 2, "area_sqft": 1000,
        "property_type": "Apartment",
    }, timeout=15).json()
    lid = created["listing_id"]
    # try to reassign to builder — should be silently stripped
    requests.put(f"{API}/listings/{lid}", headers=h_agent, json={"agent_id": builder_id, "price": 6000000}, timeout=15)
    after = requests.get(f"{API}/listings/{lid}", headers=h_agent, timeout=15).json()
    assert after["agent_id"] == agent["user_id"]
    assert after["price"] == 6000000  # other fields still updated
    requests.delete(f"{API}/listings/{lid}", headers=h_agent, timeout=15)


def test_admin_create_project_with_builder_and_status_approved_default():
    h_admin, _ = _login(*ADMIN)
    builder_id = _user_id(h_admin, "builder")
    body = requests.post(f"{API}/projects", headers=h_admin, json={
        "name": f"AdminProj {uuid.uuid4().hex[:6]}",
        "city": "Bangalore", "locality": "Whitefield",
        "price_min": 7000000, "price_max": 12000000,
        "builder_id": builder_id,
    }, timeout=15).json()
    assert body["builder_id"] == builder_id
    assert body["status"] == "approved"
    requests.delete(f"{API}/projects/{body['project_id']}", headers=h_admin, timeout=15)
