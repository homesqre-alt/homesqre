"""Iteration 2 tests for Homesqre — new features:
- PUT /api/me/profile (auth, role validation, profile_completed)
- POST /api/auth/register now returns profile_completed=true
- PUT /api/content/homepage & /interiors (admin only)
- PUT /api/inquiries/{id} with message / note / next_followup, wrong-owner 403
- Bearer header precedence over cookie (regression)
- admin status patch preserves is_featured when omitted (regression)
"""
import os
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"


class NoCookieSession(requests.Session):
    def request(self, *args, **kwargs):
        self.cookies.clear()
        return super().request(*args, **kwargs)


@pytest.fixture(scope="module")
def s():
    sess = NoCookieSession()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


def _login(s, email, password):
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["token"], r.json()["user"]


@pytest.fixture(scope="module")
def admin_auth(s):
    tok, u = _login(s, "admin@homesqre.com", "Homesqre@2026")
    return {"Authorization": f"Bearer {tok}"}, u


@pytest.fixture(scope="module")
def agent_auth(s):
    tok, u = _login(s, "agent@homesqre.com", "Agent@2026")
    return {"Authorization": f"Bearer {tok}"}, u


@pytest.fixture(scope="module")
def builder_auth(s):
    tok, u = _login(s, "builder@homesqre.com", "Builder@2026")
    return {"Authorization": f"Bearer {tok}"}, u


@pytest.fixture(scope="module")
def customer_auth(s):
    tok, u = _login(s, "customer@homesqre.com", "Customer@2026")
    return {"Authorization": f"Bearer {tok}"}, u


# --- /api/me/profile ---------------------------------------------------------
class TestMeProfile:
    def test_register_returns_profile_completed_true(self, s):
        email = f"TEST_pc_{uuid.uuid4().hex[:6]}@h.com"
        r = s.post(f"{API}/auth/register", json={
            "name": "PC User", "email": email, "mobile": "+9190000",
            "password": "Pass@1234", "role": "customer",
        })
        assert r.status_code == 200, r.text
        assert r.json()["user"]["profile_completed"] is True

    def test_update_profile_authed(self, s):
        email = f"TEST_upd_{uuid.uuid4().hex[:6]}@h.com"
        reg = s.post(f"{API}/auth/register", json={
            "name": "Orig", "email": email, "mobile": "+919",
            "password": "Pass@1234", "role": "customer",
        }).json()
        tok = reg["token"]
        h = {"Authorization": f"Bearer {tok}"}
        r = s.put(f"{API}/me/profile", json={
            "name": "Updated Name", "mobile": "+919999999999", "role": "agent",
        }, headers=h)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["name"] == "Updated Name"
        assert body["mobile"] == "+919999999999"
        assert body["role"] == "agent"
        assert body["profile_completed"] is True
        assert "_id" not in body
        assert "password_hash" not in body

    def test_update_profile_rejects_invalid_role(self, s):
        email = f"TEST_role_{uuid.uuid4().hex[:6]}@h.com"
        reg = s.post(f"{API}/auth/register", json={
            "name": "X", "email": email, "mobile": "+919", "password": "P@ss1", "role": "customer",
        }).json()
        h = {"Authorization": f"Bearer {reg['token']}"}
        r = s.put(f"{API}/me/profile", json={"name": "Y", "role": "admin"}, headers=h)
        assert r.status_code == 200
        # invalid role 'admin' should NOT be applied; remains customer
        assert r.json()["role"] == "customer"
        # garbage role likewise dropped
        r2 = s.put(f"{API}/me/profile", json={"role": "hacker"}, headers=h)
        assert r2.status_code == 200
        assert r2.json()["role"] == "customer"

    def test_update_profile_unauthenticated_401(self):
        r = requests.put(f"{API}/me/profile", json={"name": "Nope"})
        assert r.status_code == 401


# --- Content CMS -------------------------------------------------------------
class TestContentCMS:
    def test_admin_update_homepage(self, s, admin_auth):
        payload = {
            "hero": {"headline": "TEST_HEADLINE", "subline": "sub"},
            "categories": [{"name": "Buy", "slug": "buy"}],
            "trust": {"counts": {"listings": 999}},
        }
        r = s.put(f"{API}/content/homepage", json=payload, headers=admin_auth[0])
        assert r.status_code == 200
        g = s.get(f"{API}/content/homepage")
        assert g.status_code == 200
        assert g.json()["hero"]["headline"] == "TEST_HEADLINE"
        assert g.json()["categories"][0]["slug"] == "buy"

    def test_homepage_non_admin_forbidden(self, s, customer_auth, agent_auth, builder_auth):
        for h in (customer_auth[0], agent_auth[0], builder_auth[0]):
            r = s.put(f"{API}/content/homepage", json={"x": 1}, headers=h)
            assert r.status_code == 403, f"expected 403 got {r.status_code}"

    def test_admin_update_interiors_with_nested_matrix(self, s, admin_auth):
        payload = {
            "how_it_works": [{"step": 1, "title": "Visit"}],
            "packages": [{"name": "Essential", "price_per_sqft": 1200}],
            "cost_matrix": {
                "1BHK": {"Essential": 350000, "Premium": 550000},
                "2BHK": {"Essential": 500000, "Premium": 800000},
                "3BHK": {"Essential": 750000, "Premium": 1200000},
            },
            "faqs": [{"q": "?", "a": "yes"}],
        }
        r = s.put(f"{API}/content/interiors", json=payload, headers=admin_auth[0])
        assert r.status_code == 200, r.text
        g = s.get(f"{API}/content/interiors").json()
        assert g["cost_matrix"]["2BHK"]["Premium"] == 800000
        assert g["packages"][0]["name"] == "Essential"

    def test_interiors_non_admin_forbidden(self, s, customer_auth):
        r = s.put(f"{API}/content/interiors", json={"x": 1}, headers=customer_auth[0])
        assert r.status_code == 403


# --- Inquiries: message, note, next_followup --------------------------------
class TestInquiryChat:
    @pytest.fixture
    def agent_owned_inquiry(self, s, agent_auth):
        """Create an inquiry owned by the seeded agent by posting on
        one of the agent's own listings (find one with agent_id == agent)."""
        # find a listing owned by the seeded agent, else create one
        listings = s.get(f"{API}/listings").json()
        own = [l for l in listings if l.get("agent_id") == agent_auth[1]["user_id"]]
        if own:
            lid = own[0]["listing_id"]
        else:
            c = s.post(f"{API}/listings", json={
                "title": "TEST_chat_lst", "kind": "sale", "city": "Bangalore",
                "locality": "Whitefield", "price": 5000000, "bedrooms": 2,
            }, headers=agent_auth[0])
            lid = c.json()["listing_id"]
        mob = f"+9190{uuid.uuid4().hex[:7]}"
        r = s.post(f"{API}/inquiries", json={
            "name": "TEST_chat", "email": "c@t.com", "mobile": mob,
            "message": "Initial msg", "listing_id": lid,
        })
        assert r.status_code == 200, r.text
        return r.json()["inquiry_id"]

    def test_append_message(self, s, agent_auth, agent_owned_inquiry):
        iid = agent_owned_inquiry
        r = s.put(f"{API}/inquiries/{iid}",
                  json={"message": "Hello from agent"}, headers=agent_auth[0])
        assert r.status_code == 200
        g = s.get(f"{API}/inquiries", headers=agent_auth[0]).json()
        found = next(i for i in g if i["inquiry_id"] == iid)
        msgs = found.get("messages", [])
        assert any(m.get("text") == "Hello from agent" for m in msgs)

    def test_append_note(self, s, agent_auth, agent_owned_inquiry):
        iid = agent_owned_inquiry
        r = s.put(f"{API}/inquiries/{iid}",
                  json={"note": "called customer"}, headers=agent_auth[0])
        assert r.status_code == 200
        assert any(n.get("text") == "called customer" for n in r.json().get("notes", []))

    def test_set_next_followup(self, s, agent_auth, agent_owned_inquiry):
        iid = agent_owned_inquiry
        when = "2026-03-15T10:30"
        r = s.put(f"{API}/inquiries/{iid}",
                  json={"next_followup": when}, headers=agent_auth[0])
        assert r.status_code == 200
        assert r.json().get("next_followup") == when

    def test_wrong_owner_403(self, s, agent_owned_inquiry):
        # create a second agent and attempt to update
        email = f"TEST_agX_{uuid.uuid4().hex[:6]}@h.com"
        s.post(f"{API}/auth/register", json={
            "name": "AgX", "email": email, "mobile": "+919",
            "password": "P@ss1", "role": "agent",
        })
        tok = s.post(f"{API}/auth/login", json={"email": email, "password": "P@ss1"}).json()["token"]
        h = {"Authorization": f"Bearer {tok}"}
        r = s.put(f"{API}/inquiries/{agent_owned_inquiry}",
                  json={"message": "hijack"}, headers=h)
        assert r.status_code == 403


# --- Regressions for current_user + admin status patch ----------------------
class TestRegressions:
    def test_bearer_wins_over_stale_cookie(self):
        """Login as customer to set cookie, then in same session call /auth/me
        with admin Bearer header — should return admin, not customer."""
        sess = requests.Session()
        sess.headers.update({"Content-Type": "application/json"})
        # set customer cookie
        rc = sess.post(f"{API}/auth/login",
                       json={"email": "customer@homesqre.com", "password": "Customer@2026"})
        assert rc.status_code == 200
        assert "access_token" in sess.cookies
        # now bearer admin
        ra = requests.post(f"{API}/auth/login",
                           json={"email": "admin@homesqre.com", "password": "Homesqre@2026"})
        admin_tok = ra.json()["token"]
        r = sess.get(f"{API}/auth/me",
                     headers={"Authorization": f"Bearer {admin_tok}"})
        assert r.status_code == 200
        assert r.json()["email"] == "admin@homesqre.com", \
            f"Bearer must beat cookie. Got: {r.json().get('email')}"

    def test_admin_listing_status_preserves_is_featured(self, s, admin_auth):
        items = s.get(f"{API}/listings").json()
        lid = items[0]["listing_id"]
        # set is_featured=true
        s.put(f"{API}/admin/listings/{lid}/status",
              json={"status": "live", "is_featured": True}, headers=admin_auth[0])
        g1 = s.get(f"{API}/listings/{lid}").json()
        assert g1["is_featured"] is True
        # patch only status; is_featured must remain True
        s.put(f"{API}/admin/listings/{lid}/status",
              json={"status": "live"}, headers=admin_auth[0])
        g2 = s.get(f"{API}/listings/{lid}").json()
        assert g2["is_featured"] is True, "is_featured was wiped by patch"

    def test_admin_project_status_preserves_is_featured(self, s, admin_auth):
        items = s.get(f"{API}/projects").json()
        pid = items[0]["project_id"]
        s.put(f"{API}/admin/projects/{pid}/status",
              json={"status": "live", "is_featured": True}, headers=admin_auth[0])
        g1 = next(p for p in s.get(f"{API}/projects").json() if p["project_id"] == pid)
        assert g1["is_featured"] is True
        s.put(f"{API}/admin/projects/{pid}/status",
              json={"status": "live"}, headers=admin_auth[0])
        g2 = next(p for p in s.get(f"{API}/projects").json() if p["project_id"] == pid)
        assert g2["is_featured"] is True
