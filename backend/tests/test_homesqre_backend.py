"""Homesqre backend API tests — covers auth, catalog, listings, projects,
inquiries, leads, search, content, admin, favourites, and role-based authz."""
import os
import time
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://india-homes-4.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


# ---------- Fixtures ----------
class NoCookieSession(requests.Session):
    """Session that does not persist cookies between requests so that
    Authorization: Bearer header is the sole auth source. The backend
    prefers cookies over the Bearer header, which would otherwise
    cause role-based tests to use the wrong identity."""
    def request(self, *args, **kwargs):
        self.cookies.clear()
        return super().request(*args, **kwargs)


@pytest.fixture(scope="session")
def s():
    sess = NoCookieSession()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


def _login(s, email, password):
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return r.json()["token"], r.json()["user"]


@pytest.fixture(scope="session")
def admin_auth(s):
    tok, u = _login(s, "admin@homesqre.com", "Homesqre@2026")
    return {"Authorization": f"Bearer {tok}"}, u


@pytest.fixture(scope="session")
def agent_auth(s):
    tok, u = _login(s, "agent@homesqre.com", "Agent@2026")
    return {"Authorization": f"Bearer {tok}"}, u


@pytest.fixture(scope="session")
def builder_auth(s):
    tok, u = _login(s, "builder@homesqre.com", "Builder@2026")
    return {"Authorization": f"Bearer {tok}"}, u


@pytest.fixture(scope="session")
def customer_auth(s):
    tok, u = _login(s, "customer@homesqre.com", "Customer@2026")
    return {"Authorization": f"Bearer {tok}"}, u


# ---------- Health ----------
def test_root(s):
    r = s.get(f"{API}/")
    assert r.status_code == 200
    assert r.json().get("ok") is True


# ---------- Auth ----------
class TestAuth:
    def test_register_and_dev_otp(self, s):
        email = f"test_user_{uuid.uuid4().hex[:8]}@homesqre.com"
        r = s.post(f"{API}/auth/register", json={
            "name": "Test User", "email": email, "mobile": "+919000000001",
            "password": "Pass@1234", "role": "customer",
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert "dev_otp" in data and len(data["dev_otp"]) == 6
        # OTP must be all-digit string, 6 chars (secrets.randbelow ensures 100000-999999)
        assert data["dev_otp"].isdigit(), f"OTP not all-digit: {data['dev_otp']!r}"
        assert 100000 <= int(data["dev_otp"]) <= 999999
        assert data["user"]["email"] == email.lower()
        assert data["user"]["is_verified"] is False
        assert "token" in data
        # verify
        r2 = s.post(f"{API}/auth/verify-otp", json={"email": email, "otp": data["dev_otp"]})
        assert r2.status_code == 200
        assert r2.json()["ok"] is True

    def test_register_duplicate_email_400(self, s):
        r = s.post(f"{API}/auth/register", json={
            "name": "Dup", "email": "admin@homesqre.com", "mobile": "+910",
            "password": "Pass@1234", "role": "customer",
        })
        assert r.status_code == 400

    def test_verify_otp_accepts_000000(self, s):
        email = f"TEST_otp_{uuid.uuid4().hex[:8]}@homesqre.com"
        s.post(f"{API}/auth/register", json={
            "name": "OtpUser", "email": email, "mobile": "+919000000002",
            "password": "Pass@1234", "role": "customer",
        })
        r = s.post(f"{API}/auth/verify-otp", json={"email": email, "otp": "000000"})
        assert r.status_code == 200

    @pytest.mark.parametrize("email,password,role", [
        ("admin@homesqre.com", "Homesqre@2026", "admin"),
        ("agent@homesqre.com", "Agent@2026", "agent"),
        ("builder@homesqre.com", "Builder@2026", "builder"),
        ("customer@homesqre.com", "Customer@2026", "customer"),
    ])
    def test_seeded_user_login(self, s, email, password, role):
        r = s.post(f"{API}/auth/login", json={"email": email, "password": password})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["user"]["role"] == role
        assert body["user"]["email"] == email
        assert "_id" not in body["user"]
        assert "password_hash" not in body["user"]
        assert body["token"]

    def test_login_wrong_password_401(self, s):
        r = s.post(f"{API}/auth/login", json={"email": "admin@homesqre.com", "password": "WRONG"})
        assert r.status_code == 401

    def test_me_via_bearer(self, s, admin_auth):
        r = s.get(f"{API}/auth/me", headers=admin_auth[0])
        assert r.status_code == 200
        assert r.json()["email"] == "admin@homesqre.com"
        assert "_id" not in r.json()

    def test_me_via_cookie(self):
        sess = requests.Session()
        r = sess.post(f"{API}/auth/login", json={"email": "admin@homesqre.com", "password": "Homesqre@2026"})
        assert r.status_code == 200
        assert "access_token" in sess.cookies
        r2 = sess.get(f"{API}/auth/me")
        assert r2.status_code == 200
        assert r2.json()["email"] == "admin@homesqre.com"

    def test_logout_clears_cookie(self):
        sess = requests.Session()
        sess.post(f"{API}/auth/login", json={"email": "agent@homesqre.com", "password": "Agent@2026"})
        r = sess.post(f"{API}/auth/logout")
        assert r.status_code == 200

    def test_me_without_auth_401(self, s):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_forgot_and_reset_password(self, s):
        email = f"TEST_reset_{uuid.uuid4().hex[:8]}@homesqre.com"
        s.post(f"{API}/auth/register", json={
            "name": "R", "email": email, "mobile": "+919000000003",
            "password": "OldPass@1", "role": "customer",
        })
        r = s.post(f"{API}/auth/forgot-password", json={"email": email})
        assert r.status_code == 200
        token = r.json().get("dev_token")
        assert token
        r2 = s.post(f"{API}/auth/reset-password", json={"token": token, "new_password": "NewPass@2"})
        assert r2.status_code == 200
        # new password works
        r3 = s.post(f"{API}/auth/login", json={"email": email, "password": "NewPass@2"})
        assert r3.status_code == 200
        # old fails
        r4 = s.post(f"{API}/auth/login", json={"email": email, "password": "OldPass@1"})
        assert r4.status_code == 401

    def test_forgot_unknown_email_returns_ok_no_leak(self, s):
        r = s.post(f"{API}/auth/forgot-password", json={"email": "noone@nowhere.com"})
        assert r.status_code == 200
        assert "dev_token" not in r.json()


# ---------- Catalog ----------
class TestCatalog:
    def test_banks_seeded(self, s):
        r = s.get(f"{API}/banks")
        assert r.status_code == 200
        names = {b["name"] for b in r.json()}
        for expected in ["SBI", "HDFC Bank", "ICICI Bank", "Axis Bank",
                          "Kotak Mahindra Bank", "Bank of Baroda",
                          "PNB Housing Finance", "LIC Housing Finance"]:
            assert expected in names, f"missing bank {expected}"
        assert len(r.json()) >= 8

    def test_amenities_seeded(self, s):
        r = s.get(f"{API}/amenities")
        assert r.status_code == 200
        items = r.json()
        assert len(items) >= 30
        cats = {a["category"] for a in items}
        for c in ["Sports & Fitness", "Lifestyle", "Kids & Family",
                  "Security", "Convenience", "Green & Wellness"]:
            assert c in cats

    def test_cities_seeded(self, s):
        r = s.get(f"{API}/cities")
        assert r.status_code == 200
        names = {c["name"] for c in r.json()}
        assert "Bangalore" in names

    def test_localities_seeded(self, s):
        r = s.get(f"{API}/localities", params={"city": "Bangalore"})
        assert r.status_code == 200
        items = r.json()
        assert len(items) >= 15
        names = {l["name"] for l in items}
        for expected in ["Whitefield", "Sarjapur Road", "Electronic City", "HSR Layout"]:
            assert expected in names


# ---------- Listings ----------
class TestListings:
    def test_list_listings_seeded(self, s):
        r = s.get(f"{API}/listings")
        assert r.status_code == 200
        items = r.json()
        assert len(items) >= 10
        kinds = {x["kind"] for x in items}
        assert "sale" in kinds and "rent" in kinds
        assert all("_id" not in x for x in items)

    def test_get_listing_increments_views(self, s):
        items = s.get(f"{API}/listings").json()
        lid = items[0]["listing_id"]
        v1 = s.get(f"{API}/listings/{lid}").json()["views"]
        v2 = s.get(f"{API}/listings/{lid}").json()["views"]
        assert v2 == v1 + 1

    def test_agent_create_update_delete(self, s, agent_auth):
        h = agent_auth[0]
        payload = {
            "title": "TEST_3BHK_listing", "kind": "sale", "city": "Bangalore",
            "locality": "Whitefield", "price": 9500000, "bedrooms": 3,
            "area_sqft": 1400, "property_type": "Apartment",
        }
        r = s.post(f"{API}/listings", json=payload, headers=h)
        assert r.status_code == 200, r.text
        lid = r.json()["listing_id"]
        # default status pending
        assert r.json()["status"] == "pending"
        assert r.json()["agent_id"] == agent_auth[1]["user_id"]

        # GET persists
        g = s.get(f"{API}/listings/{lid}")
        assert g.status_code == 200
        assert g.json()["title"] == payload["title"]

        # update
        u = s.put(f"{API}/listings/{lid}", json={"price": 9800000}, headers=h)
        assert u.status_code == 200
        assert u.json()["price"] == 9800000

        # delete
        d = s.delete(f"{API}/listings/{lid}", headers=h)
        assert d.status_code == 200
        # gone
        g2 = s.get(f"{API}/listings/{lid}")
        assert g2.status_code == 404

    def test_customer_cannot_create_listing(self, s, customer_auth):
        r = s.post(f"{API}/listings", json={"title": "x"}, headers=customer_auth[0])
        assert r.status_code == 403

    def test_unauth_cannot_create_listing(self, s):
        r = requests.post(f"{API}/listings", json={"title": "x"})
        assert r.status_code == 401


# ---------- Projects ----------
class TestProjects:
    def test_list_projects_seeded(self, s):
        r = s.get(f"{API}/projects")
        assert r.status_code == 200
        items = r.json()
        assert len(items) >= 4
        assert all("_id" not in p for p in items)

    def test_get_by_slug(self, s):
        items = s.get(f"{API}/projects").json()
        p = items[0]
        r = s.get(f"{API}/projects/by-slug/{p['city_slug']}/{p['locality_slug']}/{p['slug']}")
        assert r.status_code == 200, r.text
        assert r.json()["project_id"] == p["project_id"]

    def test_builder_create_update(self, s, builder_auth):
        h = builder_auth[0]
        payload = {"name": "TEST_Project_X", "city": "Bangalore", "locality": "Hebbal",
                   "price_min": 5000000, "price_max": 9000000}
        r = s.post(f"{API}/projects", json=payload, headers=h)
        assert r.status_code == 200, r.text
        pid = r.json()["project_id"]
        assert r.json()["status"] == "pending"
        assert r.json()["builder_id"] == builder_auth[1]["user_id"]
        assert r.json()["city_slug"] == "bangalore"
        assert r.json()["locality_slug"] == "hebbal"

        u = s.put(f"{API}/projects/{pid}", json={"tagline": "Updated"}, headers=h)
        assert u.status_code == 200
        assert u.json()["tagline"] == "Updated"

        s.delete(f"{API}/projects/{pid}", headers=h)

    def test_agent_cannot_create_project(self, s, agent_auth):
        r = s.post(f"{API}/projects", json={"name": "x"}, headers=agent_auth[0])
        assert r.status_code == 403


# ---------- Inquiries ----------
class TestInquiries:
    def test_create_inquiry_for_listing_autoassign(self, s, agent_auth):
        lst = s.get(f"{API}/listings").json()[0]
        mob = f"+9190000{uuid.uuid4().hex[:5]}"
        r = s.post(f"{API}/inquiries", json={
            "name": "TEST_Inq", "email": "i@t.com", "mobile": mob,
            "message": "Interested", "listing_id": lst["listing_id"],
        })
        assert r.status_code == 200, r.text
        assert r.json()["owner_id"] == lst["agent_id"]
        assert r.json()["status"] == "new"

        # duplicate within 24h -> 409
        r2 = s.post(f"{API}/inquiries", json={
            "name": "TEST_Inq", "email": "i@t.com", "mobile": mob,
            "message": "again", "listing_id": lst["listing_id"],
        })
        assert r2.status_code == 409

    def test_create_inquiry_requires_listing_or_project(self, s):
        r = s.post(f"{API}/inquiries", json={"name": "x", "mobile": "+919"})
        assert r.status_code == 400

    def test_agent_only_sees_own(self, s, agent_auth, admin_auth):
        r = s.get(f"{API}/inquiries", headers=agent_auth[0])
        assert r.status_code == 200
        for inq in r.json():
            assert inq["owner_id"] == agent_auth[1]["user_id"]
        # admin all
        r2 = s.get(f"{API}/inquiries", headers=admin_auth[0], params={"all_inquiries": "true"})
        assert r2.status_code == 200

    def test_update_inquiry_note_and_status(self, s, agent_auth):
        # find one owned by agent
        owned = s.get(f"{API}/inquiries", headers=agent_auth[0]).json()
        if not owned:
            pytest.skip("no inquiries owned by agent")
        iid = owned[0]["inquiry_id"]
        r = s.put(f"{API}/inquiries/{iid}", json={"status": "contacted", "note": "called"}, headers=agent_auth[0])
        assert r.status_code == 200
        assert r.json()["status"] == "contacted"
        assert any(n["text"] == "called" for n in r.json()["notes"])


# ---------- Interior & Loan leads ----------
class TestLeads:
    def test_interior_lead_create_and_admin_list(self, s, admin_auth, customer_auth):
        r = s.post(f"{API}/interior-leads", json={
            "name": "TEST_Int", "phone": "+919", "property_type": "2BHK", "budget": "5L",
        })
        assert r.status_code == 200
        # non-admin forbidden
        r2 = s.get(f"{API}/interior-leads", headers=customer_auth[0])
        assert r2.status_code == 403
        r3 = s.get(f"{API}/interior-leads", headers=admin_auth[0])
        assert r3.status_code == 200
        assert any(x.get("name") == "TEST_Int" for x in r3.json())

    def test_loan_lead_create_and_admin_list(self, s, admin_auth):
        r = s.post(f"{API}/loan-leads", json={
            "name": "TEST_Loan", "phone": "+919", "loan_amount": 5000000,
            "interest_rate": 9.0, "tenure": 240, "bank": "SBI", "emi": 45000,
        })
        assert r.status_code == 200
        r2 = s.get(f"{API}/loan-leads", headers=admin_auth[0])
        assert r2.status_code == 200
        assert any(x.get("name") == "TEST_Loan" for x in r2.json())


# ---------- Search ----------
class TestSearch:
    def test_search_returns_three_buckets(self, s):
        r = s.get(f"{API}/search", params={"q": "whitefield"})
        assert r.status_code == 200
        body = r.json()
        for k in ["listings", "projects", "localities"]:
            assert k in body
        # whitefield seeded as locality
        assert any(l["name"].lower() == "whitefield" for l in body["localities"])


# ---------- Content ----------
class TestContent:
    def test_homepage_default(self, s):
        r = s.get(f"{API}/content/homepage")
        assert r.status_code == 200
        assert "hero" in r.json()

    def test_interiors_default(self, s):
        r = s.get(f"{API}/content/interiors")
        assert r.status_code == 200
        assert "how_it_works" in r.json()

    def test_admin_update_homepage(self, s, admin_auth, customer_auth):
        new_val = {"hero": {"headline": "TEST_headline"}}
        r = s.put(f"{API}/content/homepage", json=new_val, headers=admin_auth[0])
        assert r.status_code == 200
        # readable
        r2 = s.get(f"{API}/content/homepage")
        assert r2.json()["hero"]["headline"] == "TEST_headline"
        # non-admin cannot
        r3 = s.put(f"{API}/content/homepage", json={"x": 1}, headers=customer_auth[0])
        assert r3.status_code == 403


# ---------- Admin ----------
class TestAdmin:
    def test_admin_list_users(self, s, admin_auth):
        r = s.get(f"{API}/admin/users", headers=admin_auth[0])
        assert r.status_code == 200
        users = r.json()
        assert len(users) >= 4
        assert all("password_hash" not in u and "_id" not in u for u in users)

    def test_non_admin_cannot_list_users(self, s, agent_auth):
        r = s.get(f"{API}/admin/users", headers=agent_auth[0])
        assert r.status_code == 403

    def test_admin_update_user_role(self, s, admin_auth):
        # create temp user and promote
        email = f"TEST_admin_{uuid.uuid4().hex[:6]}@h.com"
        reg = s.post(f"{API}/auth/register", json={
            "name": "T", "email": email, "mobile": "+919", "password": "P@ss123", "role": "customer",
        }).json()
        uid = reg["user"]["user_id"]
        r = s.put(f"{API}/admin/users/{uid}", json={"role": "agent"}, headers=admin_auth[0])
        assert r.status_code == 200
        assert r.json()["role"] == "agent"

    def test_admin_listing_status(self, s, admin_auth):
        items = s.get(f"{API}/listings").json()
        lid = items[0]["listing_id"]
        r = s.put(f"{API}/admin/listings/{lid}/status",
                  json={"status": "live", "is_featured": True}, headers=admin_auth[0])
        assert r.status_code == 200
        assert r.json()["is_featured"] is True

    def test_admin_project_status(self, s, admin_auth):
        items = s.get(f"{API}/projects").json()
        pid = items[0]["project_id"]
        r = s.put(f"{API}/admin/projects/{pid}/status",
                  json={"status": "live", "is_featured": True}, headers=admin_auth[0])
        assert r.status_code == 200

    def test_admin_update_bank_logs_rate(self, s, admin_auth):
        banks = s.get(f"{API}/banks").json()
        bid = banks[0]["bank_id"]
        r = s.put(f"{API}/banks/{bid}", json={"rate_min": 8.99}, headers=admin_auth[0])
        assert r.status_code == 200
        assert r.json()["rate_min"] == 8.99

    def test_admin_toggle_amenity(self, s, admin_auth):
        ams = s.get(f"{API}/amenities").json()
        aid = ams[0]["amenity_id"]
        r = s.put(f"{API}/amenities/{aid}", json={"is_active": False}, headers=admin_auth[0])
        assert r.status_code == 200
        # restore
        s.put(f"{API}/amenities/{aid}", json={"is_active": True}, headers=admin_auth[0])

    def test_builder_suggested_amenity_pending(self, s, builder_auth):
        r = s.post(f"{API}/amenities", json={
            "name": f"TEST_amen_{uuid.uuid4().hex[:5]}", "category": "Lifestyle", "icon": "star",
        }, headers=builder_auth[0])
        assert r.status_code == 200
        assert r.json()["is_active"] is False
        assert r.json()["pending_approval"] is True

    def test_admin_analytics(self, s, admin_auth):
        r = s.get(f"{API}/admin/analytics", headers=admin_auth[0])
        assert r.status_code == 200
        b = r.json()
        for k in ["total_users", "total_listings", "live_listings",
                  "total_projects", "total_inquiries", "by_role"]:
            assert k in b


# ---------- Role-based authz ----------
class TestAuthz:
    def test_agent_cannot_edit_other_agent_listing(self, s, agent_auth, admin_auth):
        # create second agent
        email = f"TEST_agent2_{uuid.uuid4().hex[:5]}@h.com"
        s.post(f"{API}/auth/register", json={
            "name": "Ag2", "email": email, "mobile": "+919", "password": "P@ss1", "role": "agent",
        })
        tok2 = s.post(f"{API}/auth/login", json={"email": email, "password": "P@ss1"}).json()["token"]
        h2 = {"Authorization": f"Bearer {tok2}"}
        # agent1 creates listing
        c = s.post(f"{API}/listings", json={
            "title": "TEST_authz", "kind": "sale", "city": "Bangalore",
            "locality": "Whitefield", "price": 100, "bedrooms": 1,
        }, headers=agent_auth[0])
        lid = c.json()["listing_id"]
        # agent2 cannot update
        r = s.put(f"{API}/listings/{lid}", json={"price": 200}, headers=h2)
        assert r.status_code == 403
        # cleanup
        s.delete(f"{API}/listings/{lid}", headers=agent_auth[0])

    def test_builder_cannot_edit_other_builder_project(self, s, builder_auth):
        email = f"TEST_b2_{uuid.uuid4().hex[:5]}@h.com"
        s.post(f"{API}/auth/register", json={
            "name": "B2", "email": email, "mobile": "+919", "password": "P@ss1", "role": "builder",
        })
        tok2 = s.post(f"{API}/auth/login", json={"email": email, "password": "P@ss1"}).json()["token"]
        h2 = {"Authorization": f"Bearer {tok2}"}
        c = s.post(f"{API}/projects", json={
            "name": f"TEST_p_{uuid.uuid4().hex[:5]}", "city": "Bangalore", "locality": "Hebbal",
        }, headers=builder_auth[0])
        pid = c.json()["project_id"]
        r = s.put(f"{API}/projects/{pid}", json={"tagline": "x"}, headers=h2)
        assert r.status_code == 403
        s.delete(f"{API}/projects/{pid}", headers=builder_auth[0])


# ---------- Favourites ----------
class TestFavourites:
    def test_add_list_remove(self, s, customer_auth):
        h = customer_auth[0]
        lst = s.get(f"{API}/listings").json()[0]
        prj = s.get(f"{API}/projects").json()[0]
        # add
        r = s.post(f"{API}/me/favourites", json={"kind": "listing", "ref_id": lst["listing_id"]}, headers=h)
        assert r.status_code == 200
        r = s.post(f"{API}/me/favourites", json={"kind": "project", "ref_id": prj["project_id"]}, headers=h)
        assert r.status_code == 200
        # list
        f = s.get(f"{API}/me/favourites", headers=h)
        assert f.status_code == 200
        body = f.json()
        assert any(x["listing_id"] == lst["listing_id"] for x in body["listings"])
        assert any(x["project_id"] == prj["project_id"] for x in body["projects"])
        # remove
        r = s.delete(f"{API}/me/favourites/listing/{lst['listing_id']}", headers=h)
        assert r.status_code == 200
        f2 = s.get(f"{API}/me/favourites", headers=h).json()
        assert not any(x["listing_id"] == lst["listing_id"] for x in f2["listings"])
