# Homesqre — Product Requirements (PRD)

## Original Problem Statement
Build **Homesqre Interiors** — a paywalled multi-phase interior design service for the Indian market. Customers go through a guided journey (unpaid → briefing → verification → scheduling → confirmed → designing → quotation) and pay a design retainer up-front. Admins manage a Master Lead Pipeline (CRM), discovery calls, floor-plan verifications, design iterations, and an internal employees roster. The product is "design first" — accurate quotation only happens after design approval.

> **Pivot history (2026-05-25):** Product pivoted from a real-estate marketplace → to an Interiors-only service. Marketplace backend + frontend orphan files kept in repo as dead code per user request.

## Tech Stack
- **Backend:** FastAPI + MongoDB (Motor). `google-auth` for Google OIDC. Emergent Object Storage.
- **Frontend:** React (CRA + craco) + Tailwind + Shadcn UI + sonner toasts + `@react-oauth/google`.
- **Infra (user-managed):** Hostinger VPS + Docker Compose + Nginx in frontend container reverse-proxies `/api/*` to backend.

## User Roles
- **Customer** — books discovery call → pays retainer → fills brief → uploads floor plan → reviews 3D designs → approves → receives quotation.
- **Sales** — sees only own leads (My Leads); adds leads + status changes + comments + follow-ups. Cannot edit basic info or delete.
- **Designer** — sees assigned leads + floor-plan verification queue.
- **Admin / Founder** — sees Master Lead Pipeline, all verifications, designs, Team Management, CRM Settings.

## Core Features (Active)
- `/` → redirects to `/interiors`.
- `/interiors` — public landing page (hero, gallery, cost estimator, FAQ, booking form). Hits `/api/content/interiors` + `/api/leads/public`.
- `/login`, `/register`, `/forgot-password`, `/profile/complete` — email/password + Google OAuth (one-tap).
- `/dashboard/customer` — multi-phase journey UI + dynamic pricing calculator + persisted `project_phase` + floor-plan upload (PDF/PNG/JPG/JPEG/WEBP, 15 MB max).
- `/dashboard/sales` — **My Leads** (filtered to assigned; add + workflow only).
- `/dashboard/designer` — Verification & Site Visits queue (will get design iteration UI in Phase C).
- `/dashboard/admin` — 5 tabs: Overview, **Master Lead Pipeline**, Verification & Site Visits, Team Management, **CRM Settings**.
- `/admin/login` — separate admin auth.
- `/emi-calculator` — preserved standalone.

## Backend Endpoints (live)
**Auth:** `POST /api/auth/{register,verify-otp,login,logout,google,forgot-password,reset-password}`, `GET /api/auth/me`, `PUT /api/me/phase`
**Files:** `POST /api/upload` (PDF/PNG/JPG/JPEG/WEBP, 15 MB cap), `GET /api/files/{path}`
**CRM (Phase A):**
- Leads: `GET/POST /api/leads`, `GET/PUT/DELETE /api/leads/{id}`, `PUT /api/leads/{id}/status`, `POST /api/leads/{id}/comments`, `PUT /api/leads/{id}/followup`, `POST /api/leads/public`, `GET /api/leads/export.csv`
- Settings: `GET/POST /api/crm/statuses`, `PUT/DELETE /api/crm/statuses/{name}`, `GET/POST /api/crm/sources`, `PUT/DELETE /api/crm/sources/{name}`, `GET /api/crm/budget-options`
- Shims: `POST /api/interior-leads`, `POST /api/discovery-calls` (write to unified `leads` collection)
**Verifications:** `POST /api/verifications`, `GET/PUT /api/admin/verifications[/{id}]`
**Team:** `GET/POST /api/admin/employees`, `PUT/DELETE /api/admin/employees/{email}`

## Changelog
- **2026-05-26 — Phase A: Master CRM shipped.** Unified `leads` collection replaces `interior_leads` + `discovery_calls` (one-time idempotent migration). 15 endpoints (CRUD + role-scoped list + CSV export + admin-customizable statuses/sources + auto-assign rules). Round-robin auto-assignment on lead create AND status change. New components: `MasterLeadPipeline` (shared admin/sales), `CrmSettings` (admin only). 19/19 pytest pass. Old 15-min discovery-call rotation worker removed.
- **2026-05-26 — CustomerDashboard:** persisted `project_phase` via `PUT /me/phase` (whitelisted transitions); floor-plan upload restricted to PDF/PNG/JPG/JPEG/WEBP with 15 MB cap; client-side + server-side validation.
- **2026-05-25 — Discovery call assignment fixed.** Hard-coded names replaced with dynamic round-robin from `users` collection (`role=sales`). Legacy doc auto-migration on startup. (Superseded by Phase A.)
- **2026-05-25 — Role-based staff dashboards.** `/dashboard/sales`, `/dashboard/designer` created. AdminDashboard locked to `admin` only.
- **2026-05-25 — Production deployment fixes.** Nginx reverse-proxy via `frontend/default.conf` + `frontend/Dockerfile` COPY; `docker-compose.yml` build-args fixed (HTTPS URL + Google client ID); backend port hardened to 127.0.0.1.
- **2026-05-25 — `/interiors` restored.** Re-added `/api/content/{key}` and `/api/interior-leads` (now `POST /api/leads/public`); seeded from `defaults.py`.
- **2026-05-25 — Major Pivot Adoption.** Full GitHub-zip adoption: marketplace stripped → Interiors product (discovery-calls, verifications, employees). `@react-oauth/google` swapped in.

## Known Issues / Tech Debt
| # | Issue | Status |
|---|---|---|
| 1 | "Proceed to Secure Payment" is a placeholder (calls `PUT /me/phase` directly, no real payment). | Open — needs Razorpay |
| 2 | SMS OTP + email notifications mocked. | Open — Twilio + Resend |
| 3 | Designer can't reject floor plan with package adjustment yet. | **Phase B (next session)** |
| 4 | 3D-design iteration loop (designer upload-per-image + customer approve/need-improvement) not built. | **Phase C (next session)** |
| 5 | Orphan marketplace `.jsx` files kept in repo as dead code per user request. | Deferred |
| 6 | Old `interior_leads` + `discovery_calls` collections kept post-migration as safety net. | Cleanup after one prod release |
| 7 | Old archived pytest suites (`backend/tests/_archive/`) reference removed marketplace endpoints. | Won't fix; in archive |

## Roadmap (P-ordered)
- **P0 (next):** Phase B — Designer rejects with package re-selection + differential payment.
- **P1:** Phase C — 3D design iteration loop.
- **P1:** Razorpay integration (replace placeholder payment).
- **P2:** Real SMS OTP (Twilio) + email notifications (Resend).
- **P2:** Notify assigned staff via email/WhatsApp on lead assignment.
- **P3:** Customer-facing project status timeline, push notifications.

## Files of Reference
- `backend/server.py` — auth, CRM, verifications, files, team mgmt.
- `backend/defaults.py` — homepage/interiors CMS seeds + bank/amenity seeds.
- `backend/storage.py` — Emergent object storage adapter.
- `backend/tests/test_crm_phase_a.py` — 19 regression tests.
- `frontend/src/App.js` — active routes.
- `frontend/src/components/admin/MasterLeadPipeline.jsx` — shared CRM grid.
- `frontend/src/components/admin/CrmSettings.jsx` — admin CRM customization.
- `frontend/src/pages/dashboards/{Admin,Sales,Designer,Customer}Dashboard.jsx` — role views.
- `frontend/default.conf` — Nginx config baked into frontend container.
- `docker-compose.yml` — service definitions + frontend build args.
- `/app/memory/test_credentials.md` — admin + staff + Google OAuth credentials.
