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
- **2026-02-26 (seventh update) — Customer Dashboard package picker + Lead Drawer batch submit.**
  - **CustomerDashboard.jsx — inline package picker restored.** Removed the old "Generate Design Invoice" modal in favor of an inline catalogue (`unpaid` phase). Customer sees all 8 packages from `packages.py` rendered as selectable cards across 3 property groups (Apartment 1–2 BHK / 3 BHK / 4+ BHK, Villa Duplex / Triplex, Independent 1–5 units) with prices ₹10k – ₹30k. Selected package surfaces in a sticky summary tile with a "Proceed to Payment" CTA. Mocked payment hits `PUT /me/phase {phase:"briefing"}` (Razorpay/Stripe integrates later). Selected `property_type` + `bhk_or_units` are pre-filled into the briefing-phase verification form to avoid double entry.
  - **MasterLeadPipeline.jsx LeadDetailDrawer — batched submit workflow.** All field changes (status, next follow-up, assigned-to override, source, basic info, plus the new-comment textarea) buffer into local `edits` + `comment` state — nothing hits the API on `onChange`. A sticky footer shows live "N pending change(s) — nothing is saved yet" with `Discard` + `Submit Changes` buttons. On submit the handler fires the right endpoint per dirty field (`PUT /leads/{id}/status`, `PUT /leads/{id}/followup`, `PUT /leads/{id}` for admin core fields, `POST /leads/{id}/comments`) then refreshes the drawer and clears buffers.
  - **Test IDs added** — `unpaid-package-picker`, `pkg-{type}-{value}`, `selected-package-label`, `selected-package-price`, `confirm-payment-btn`, `lead-submit-bar`, `lead-submit-btn`, `lead-discard-btn`, `detail-followup-input`.
  - **Smoke-tested live** — fresh customer sees the package picker, can pick a 3 BHK ₹12,000 package and proceed to payment. Admin can batch-edit a lead's status + queue a comment, submit once, both persist with a single toast "Changes saved · reassigned to …".
  - **Regression** — 55/55 pytest pass (no backend changes; all delta is frontend state buffering).

- **2026-02-26 (sixth update) — Designer Dashboard restructure + total PII privacy.**
  - **5 strict tabs:** My Leads → Verify Floor Plan → Active Projects → Awaiting Approvals → Completed. `Approved Floor Plans` tab removed; `LeadInlinePanel` removed (designer takes no manual lead actions).
  - **My Leads** (`DesignerLeadsList.jsx`) — static read-only table (Name / Status / Source / Next Follow-up / Updated). Click does nothing. No phone/email displayed.
  - **Verify Floor Plan** — renamed (was 'Verification & Site Visits'). Same TabSiteVisits component; pending verifications + recently resolved.
  - **Active / Awaiting / Completed** — single mode-driven `DesignerProjectsPanel.jsx`:
    - Active: `status=in_progress AND no pending images`. Detail view shows floor-plan download links + multi-file render uploader (batch upload N files with ONE shared comment, loops POST /admin/design/projects/{id}/images per file). After upload the project migrates to Awaiting Approvals.
    - Awaiting: `status=in_progress AND ≥1 pending image`. Detail view locked — render uploader is omitted, locked banner shown.
    - Completed: `status=ready_for_quotation`. View-only render history.
  - **Backend PII strip** — `/api/leads` and `/api/leads/{id}` strip `phone` + `email` when caller is `role=designer`. `LeadOut` schema dropped declared phone/email so Pydantic doesn't re-inject them as nulls; `extra='allow'` keeps them flowing for admin/sales.
  - **Verification on design detail** — `GET /api/admin/design/projects/{id}` now attaches the linked `verification` blob (`pdf_urls`, `room_requirements`, `property_type`, `bhk_or_units`) so the designer can download floor plans directly from the project detail view.
  - **Cleanup** — orphan `ApprovedFloorPlans.jsx` deleted.
  - **Tests** — `test_designer_restructure.py` (NEW, 2 tests). 55/55 pytest pass. testing_agent_v3_fork verified all 12 review items.

## Changelog (prior)
- **2026-02-26 (fifth update) — Pydantic typing pass for OpenAPI.**
  - New `schemas/` package — Pydantic v2 models for every request/response shape (53 distinct schemas surfaced in OpenAPI). Files: `common.py`, `auth.py`, `crm.py`, `leads.py`, `verifications.py`, `design.py`, `admin.py`, `me.py`.
  - Every route now declares `response_model=…` so `/docs` Swagger shows accurate shapes (43 typed paths). Routes that previously took `payload: dict` now take a typed request model — `LeadCreateRequest`, `LeadStatusUpdateRequest`, `LeadCommentCreateRequest`, `LeadFollowupRequest`, `LeadUpdateRequest`, `VerificationModerateRequest`, `ImageReviewRequest`, `QuotationStatusRequest`, `EmployeeCreateRequest`, `EmployeeUpdateRequest`, `StatusCreateRequest`, `StatusUpdateRequest`, `SourceCreateRequest`, `SourceUpdateRequest`, `PhaseUpdateRequest`, `SiteVisitRequest`, `GoogleAuthRequest`.
  - `OkResponse` and other enriched response models use `model_config = ConfigDict(extra="allow")` so admin-enrichment fields (`customer`, `lead`, `site_visit_at`, `design_project_id`, `lead_id`, …) flow through untouched.
  - Required-field validation kept inside handlers (custom 400) instead of Pydantic 422, preserving existing test contracts.
  - Behavior unchanged — all 53 pytest pass, all 43 routes still respond, `/docs` returns 200 with full schemas.

## Changelog (prior)
- **2026-02-26 (fourth update) — Server refactor + Customer Dashboard cleanup.**
  - **`server.py` reduced from 1857 → 38 lines.** Split into focused modules:
    - `core.py` (204) — env config, app/api router, MongoDB client, all shared helpers + auth deps (`current_user`, `require_role`, `_set_auth_cookie`).
    - `crm_helpers.py` (230) — CRM seeds + status/source defaults + `_build_lead`, `_auto_assign_for_status`, `find_or_create_lead_for_user`, `migrate_to_unified_leads`.
    - `design_helpers.py` (102) — `ensure_design_project`, `maybe_promote_to_quotation`, `project_all_approved`.
    - `storage_helpers.py` (46) — file upload validation + put/get object wrappers.
    - `packages.py` (48) — `PACKAGE_OPTIONS` + `calculate_package_price`.
    - `seeds.py` (80) — startup admin user + content seeding + status migrations.
    - `routes/` — `auth`, `me`, `files`, `crm`, `leads`, `verifications`, `design`, `admin`, `content`. None exceed 280 lines.
  - **Behavior identical** — all routes keep the `/api` prefix, all 53 pytest tests pass, all 9 smoke-tested endpoints return 200.
  - **CustomerDashboard.jsx cleanup** — removed orphan `scheduling` and `confirmed` phase UI blocks (replaced by inline site-visit picker inside the `designing` block in the previous update). Journey-map progress bar now reflects the new 4-step flow (Briefing → Site Visit & Design → 3D Design → Approvals & Quote). Dev-tool toggle gated behind `process.env.NODE_ENV !== "production"`.

## Changelog (prior)
- **2026-02-26 (third update) — Designer ↔ Lead linkage (Phase D).**
  - **Designer Dashboard** gains a top-level **"My Leads"** tab (new default landing) reusing `MasterLeadPipeline` in `mode=sales` — designer can change status, post comments, set follow-ups exactly like sales. Tab order: My Leads → Verification & Site Visits → Approved Floor Plans → Active Projects (3D).
  - **Inline LeadInlinePanel** on each Active Project (3D) — status dropdown + follow-up datetime + comment input bound to `design_project.lead_id`. Renders "no linked lead yet" fallback for legacy projects.
  - **Auto-link on approval** — `_find_or_create_lead_for_user()` matches the customer's email/phone to the most-recent lead; if none, creates one with status="Designing"; persists `users.lead_id` and `design_projects.lead_id`.
  - **Auto-promote to Quotation** — when the customer approves the final render, `_maybe_promote_to_quotation()` now flips the linked lead's status → `"Ready for Quotation"` AND reassigns to the admin pool (via `assign_to_role=admin`). Audit trail records `by='system:design-approved'`.
  - **New CRM statuses** seeded: `Designing` (assign→designer), `Ready for Quotation` (assign→admin). `_seed_crm_defaults()` is now idempotent (only inserts missing statuses, not all-or-nothing).
  - **API permissions** — `/api/leads/{id}/status` and `/api/leads/{id}/followup` now accept the `designer` role (assignee-or-admin check unchanged).
  - **Tests** — `test_lead_design_linkage.py` (NEW: 3 tests). Marketplace-era suites moved to `_archive/` + new `pytest.ini` excludes them. 53/53 active pytest pass.

## Changelog (prior)
- **2026-02-26 (later) — Approved-floor-plans wiring fix.**
  - **Approval is now transactional.** `PUT /api/admin/verifications/{id} {action:"approve"}` simultaneously: (a) sets verification.status="approved", (b) auto-creates the 3D design project via `_ensure_design_project()`, (c) advances customer.project_phase straight to "designing" (previously stopped at "scheduling"), (d) clears user.site_visit_at so the customer is prompted to book. Response now returns `design_project_id`.
  - **Designer Dashboard — new 3rd tab "Approved Floor Plans"** (`ApprovedFloorPlans.jsx`) between Verification and Active Projects. Each card shows customer name + project name (privacy-safe), all uploaded floor-plan files (view/download), site-visit status pill (confirmed slot OR "Awaiting customer to schedule"), and an "Open Design Project →" button that deep-links to `#projects?focus=<project_id>`. `DesignerProjects` now syncs to the `?focus=` query in the URL hash.
  - **Customer Dashboard "designing" phase** gets: (a) info banner "Design has started — renders will appear here as your designer uploads them", (b) Schedule-Site-Visit datetime picker that POSTs `PUT /api/me/site-visit {site_visit_at}` and locks into a confirmed card once submitted.
  - **Admin visibility** — `/admin/verifications` and `/admin/design/projects[/:id]` now attach `design_project_id` (verifications only) and `site_visit_at` (both). Admin Active Designs project header shows the confirmed slot; "Recently resolved" list shows the customer name + project name + booked site-visit.
  - **Tests** — `test_workflow_tweaks.py` +2 (approve wires design+site-visit, site-visit endpoint validation); `test_phase_b_package_adjustment.py` updated for new approve target. 50/50 pytest pass.

## Changelog (prior)
- **2026-02-26 — Workflow tweaks + Admin Analytics (this session).**
  - **Designer privacy:** `/api/admin/verifications`, `/api/admin/design/projects`, `/api/admin/design/projects/{id}` now scope the embedded `customer` payload by role. Designers see only `{name, project_name}`; admins still see full `{name, email, mobile, project_name}`.
  - **Customer briefing:** `POST /api/verifications` accepts new `project_name` (str) + `pdf_urls` (List[str]); legacy `pdf_url` still accepted (auto-promoted to a 1-element list). Empty list → 400. `users.project_name` is persisted on submit. UI: required Project Name input, multi-file floor-plan upload with per-file remove.
  - **DesignerDashboard:** added a visible top tab bar (`data-testid="designer-tabs"`) mirroring the admin command-center pattern. Tabs persist via URL hash.
  - **Master Lead Pipeline:** prominent "Follow-ups Today" toggle button (`data-testid="followups-today-btn"`) that flips `followup=today` filter on/off.
  - **Terminology:** "Team Management" tab → "Departments". "Add New Team Member" → "Add Department Member". "Sales Representative" / "Interior Designer" labels → "Sales Department" / "Design Department".
  - **Admin Analytics (Overview tab):** new endpoint `GET /api/admin/analytics/overview` returns `cards{6 fields}` + `leads_by_status[]` + `leads_by_source[]` + `leads_by_day[14]` + `customers_by_phase[]`. Frontend renders 6 metric cards + 4 Recharts (area, donut, bar, horizontal bar).
  - **Bug fix:** `/admin/login` now correctly redirects to `/dashboard/admin` (was dangling at `/admin`).
  - **Tests:** new `backend/tests/test_workflow_tweaks.py` (8 tests). Full regression: 48/48 pytest pass.

## Changelog (prior)
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
