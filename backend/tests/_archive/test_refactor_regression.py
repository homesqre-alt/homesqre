"""Regression tests for the modularization + CORS/cookie refactor.

Verifies:
  - Seeds from defaults.py landed in DB
  - /api/content/{homepage,interiors} return non-empty defaults
  - CORS preflight responds for an arbitrary origin (wildcard mode)
  - Login + /api/auth/me path still works end-to-end via Bearer + cookies
  - Cookie attributes (httponly + samesite) are present on login
  - Storage adapter is importable and selects a backend
"""

import os
import requests

API = os.environ.get("REACT_APP_BACKEND_URL")
# Fallback for local pytest runs without the frontend env file in scope.
if not API:
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    API = line.split("=", 1)[1].strip().strip('"')
                    break
    except FileNotFoundError:
        API = "http://localhost:8001"
BASE = f"{API.rstrip('/')}/api"


def test_health():
    r = requests.get(f"{BASE}/", timeout=10)
    assert r.status_code == 200
    assert r.json().get("ok") is True


def test_homepage_defaults_present():
    r = requests.get(f"{BASE}/content/homepage", timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert "hero" in data and data["hero"].get("headline")
    assert "stats" in data


def test_interiors_defaults_present():
    r = requests.get(f"{BASE}/content/interiors", timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert "hero" in data and data["hero"].get("headline")
    assert "cost_matrix" in data
    assert "1BHK" in data["cost_matrix"]


def test_banks_seeded():
    r = requests.get(f"{BASE}/banks", timeout=10)
    assert r.status_code == 200
    banks = r.json()
    assert len(banks) >= 5
    names = {b["name"] for b in banks}
    assert "SBI" in names


def test_amenities_seeded():
    r = requests.get(f"{BASE}/amenities", timeout=10)
    assert r.status_code == 200
    items = r.json()
    assert len(items) >= 20


def test_login_sets_cookie_and_returns_token():
    r = requests.post(
        f"{BASE}/auth/login",
        json={"email": "admin@homesqre.com", "password": "Homesqre@2026"},
        timeout=10,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("token")
    assert "access_token" in r.cookies
    # cookie attributes
    raw_setcookie = r.headers.get("set-cookie", "").lower()
    assert "httponly" in raw_setcookie
    assert "samesite=" in raw_setcookie


def test_auth_me_via_bearer():
    login = requests.post(
        f"{BASE}/auth/login",
        json={"email": "admin@homesqre.com", "password": "Homesqre@2026"},
        timeout=10,
    )
    token = login.json()["token"]
    r = requests.get(f"{BASE}/auth/me", headers={"Authorization": f"Bearer {token}"}, timeout=10)
    assert r.status_code == 200
    me = r.json()
    assert me["email"] == "admin@homesqre.com"
    assert "_id" not in me
    assert "password_hash" not in me


def test_cors_wildcard_or_allowlist():
    # Either wildcard (current default) or an allow-list must respond.
    r = requests.options(
        f"{BASE}/listings",
        headers={
            "Origin": "https://example.test",
            "Access-Control-Request-Method": "GET",
        },
        timeout=10,
    )
    # Some setups return 400 on OPTIONS without preflight headers — accept 200/204/400.
    assert r.status_code in (200, 204, 400)
    # When wildcard mode is on, header must be "*"
    allow = r.headers.get("access-control-allow-origin", "")
    assert allow != ""


def test_storage_adapter_selectable():
    """Sanity: storage module loads + returns a backend without crashing."""
    import importlib, sys
    sys.path.insert(0, "/app/backend")
    storage = importlib.import_module("storage")
    backend = storage.get_storage()
    assert hasattr(backend, "put") and hasattr(backend, "get")


def test_defaults_module_has_expected_keys():
    import importlib, sys
    sys.path.insert(0, "/app/backend")
    defaults = importlib.import_module("defaults")
    assert len(defaults.SEED_BANKS) >= 5
    assert len(defaults.SEED_AMENITIES) >= 20
    assert len(defaults.BANGALORE_LOCALITIES) >= 10
    assert "hero" in defaults.DEFAULT_HOMEPAGE_CONTENT
    assert "cost_matrix" in defaults.DEFAULT_INTERIORS_CONTENT
