# Homesqre — Product Requirements (PRD)

## Original Problem Statement
Build **Homesqre Interiors** — a paywalled multi-phase interior design service for the Indian market. Customers go through a guided journey (unpaid → briefing → verification → scheduling → confirmed → designing) and pay a design retainer up-front. Admins manage discovery calls, verifications, and an internal employees roster. The product is "design first" — accurate quotation only happens after design approval.

> **Note (2026-05-25):** The product pivoted **from a real-estate marketplace** (listings/projects/agents/builders/EMI/microsites) → to an **Interiors-only service**. The marketplace backend & most frontend files are now orphaned dead code (kept in repo per user request for future reuse).

## Tech Stack
- **Backend:** FastAPI + MongoDB (PyMongo). Standard `google-auth` for Google OIDC. Emergent Object Storage for uploads.
- **Frontend:** React (CRA + craco) + Tailwind + Shadcn UI + sonner toasts + `@react-oauth/google`.
- **Infra (locked, user-managed):** Hostinger VPS / docker-compose / Dockerfiles — **read-only for the agent.**

## User Roles
- **Customer** — books a discovery call, pays design retainer, fills brief, gets site visit + 3D designs.
- **Admin / Founder / Lead Engineer** — reviews discovery calls, verifies floor plans, manages employees.

## Core Features (Active)
- `/` → redirects to `/interiors` (public landing — **currently broken**, see Issues).
- `/login`, `/register`, `/forgot-password`, `/profile/complete` — email/password + Google OAuth.
- `/dashboard/customer` — **multi-phase journey UI** (unpaid → briefing → verification → scheduling → confirmed → designing) with **dynamic pricing calculator**:
  - Apartment: 1-2 BHK ₹10,000 · 3 BHK ₹12,000 · 4+ BHK ₹15,000
  - Villa: Duplex ₹15,000 · Triplex ₹18,000
  - Independent / Rental: 1 unit ₹12,000 · else `max(₹20,000, 6,000 × units)`
- `/dashboard/admin/*` — Discovery Calls, Verifications, Employees CRUD tabs.
- `/admin/login` — separate admin auth.
- `/emi-calculator` — preserved, standalone.

## Backend Endpoints (live)
- Auth: `POST /api/auth/register`, `/auth/verify-otp`, `/auth/login`, `/auth/logout`, `/auth/me`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/google`
- Files: `POST /api/upload`, `GET /api/files/{path}`
- Discovery calls: `POST /api/discovery-calls`, `GET /api/admin/discovery-calls`, `PUT /api/admin/discovery-calls/{id}/status`
- Verifications: `POST /api/verifications`, `GET /api/admin/verifications`, `PUT /api/admin/verifications/{id}`
- Employees: `GET / POST / PUT / DELETE /api/admin/employees[/{email}]`

## Changelog
- **2026-05-25** — **Major Pivot Adoption.** User uploaded GitHub zip of new "Homesqre Interiors" product. Adopted in full:
  - Replaced backend `server.py` (1447 → 732 lines). All marketplace endpoints removed; discovery-calls / verifications / employees endpoints added.
  - `requirements.txt`: switched Google auth from `emergentintegrations` to `google-auth>=2.29.0`.
  - Replaced `CustomerDashboard.jsx` (64 → 460 lines) — full multi-phase journey + dynamic pricing calculator.
  - Replaced `AdminDashboard.jsx` (406 → 445 lines) — discovery calls / verifications / employees tabs.
  - Replaced `App.js`, `Header.jsx`, `Footer.jsx`, `DashShell.jsx`, `AuthContext.jsx`, `Login.jsx`, `package.json`, `public/index.html`.
  - Installed `@react-oauth/google@^0.12.1` (new frontend dep).
  - Configured `GOOGLE_CLIENT_ID` in backend & `REACT_APP_GOOGLE_CLIENT_ID` in frontend `.env` files (user provided ID).
  - Removed unused imports from `App.js` (Home, Properties, PropertyDetail, ProjectsList, ProjectMicrosite, Compare, Favourites, AgentDashboard, BuilderDashboard).
  - Deleted `/admin` route from `App.js` and removed `frontend/src/pages/Admin.jsx` (per user direction).
  - Preserved `.env` files, `docker-compose.yml`, Dockerfiles (locked infra).
  - Smoke-tested: `/api/` 200, `/api/discovery-calls` POST 200, `/login` renders, `/admin` correctly empty.

## Known Issues / Tech Debt
| # | Issue | Status |
|---|---|---|
| 1 | `/interiors` page crashes — calls deleted `/content/interiors` & `/interior-leads` endpoints. Public domain `/` redirects here. | **OPEN — user still deciding on homepage** |
| 2 | Old pytest suites (`test_admin_overrides.py`, `test_moderation_pipeline.py`, `test_refactor_full_regression.py`, `test_refactor_regression.py`) reference removed endpoints — will fail if run. | Open |
| 3 | "Proceed to Secure Payment" button in CustomerDashboard checkout modal is a placeholder (just toast). Razorpay/Stripe not wired. | Open |
| 4 | Floor plan upload field in Briefing phase is a plain `<input type="file">` — not yet wired to `/api/upload`. | Open |
| 5 | CustomerDashboard `currentPhase` is in-memory state — not persisted to backend user record. Refreshing resets to `unpaid`. | Open |
| 6 | Orphan marketplace files (~25 .jsx files) kept in repo as dead code per user request — slated for future reuse. | Deferred |
| 7 | SMS OTP & email notifications mocked. | Open |

## Roadmap (P-ordered)
- **P0 (next):** User to share next feature priority. Likely candidates: Razorpay integration, persist `currentPhase` to DB, wire floor plan upload to `/api/upload`, decide homepage strategy for `/interiors`.
- **P1:** Real SMS OTP (Twilio) + email (Resend).
- **P2:** Document Vault build-out, Admin Verifications screen polish, CSV export of leads.
- **P3:** Blog / About / Contact CMS pages, analytics dashboard.

## Files of Reference
- `backend/server.py` — all 17 active API routes.
- `backend/defaults.py` — seeds.
- `backend/storage.py` — Emergent object storage adapter.
- `backend/scripts/create_admin.py` — master admin CLI.
- `frontend/src/App.js` — active routes.
- `frontend/src/pages/dashboards/CustomerDashboard.jsx` — multi-phase journey + pricing calculator (do NOT modify — finalized business logic).
- `frontend/src/pages/dashboards/AdminDashboard.jsx` — admin tabs.
- `/app/memory/test_credentials.md` — admin & OAuth credentials.

## Infrastructure Lockdown (STRICT)
The following are **read-only forever**:
- `/app/docker-compose.yml`
- `/app/backend/Dockerfile`
- `/app/frontend/Dockerfile`
