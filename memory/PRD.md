# Homesqre — Product Requirements (Living Doc)

## Original Problem
Build Homesqre — an Indian real estate marketplace (launching in Bangalore) with 4 roles: Admin, Agent, Builder, Customer. Universal search, project microsites with builder branding, RERA badge, approved banks + EMI calculator, interior design service (Homesqre Interiors), admin CMS, role-based dashboards, lead pipeline, mobile-first, INR formatting (Lakhs/Cr).

## User Choices (from ask_human)
- Auth: JWT email/password + Emergent-managed Google OAuth (Login via Google one-click)
- Scope: MVP core flows first
- Map: Leaflet + OpenStreetMap
- File uploads: Emergent Object Storage
- Email: Mock/in-app only

## User Personas
1. **Customer** — searches, saves favourites, compares, sends inquiries (no login required for inquiries).
2. **Agent** — manages listings, sees own leads kanban, follow-ups & notes.
3. **Builder** — manages projects + microsite settings (banks, amenities), sees inquiries.
4. **Admin** — full platform control: users, listings/projects approval, banks/amenities/cities, CMS.

## Architecture
- Backend: FastAPI single-file `/app/backend/server.py` with JWT + Google OAuth + Object Storage. MongoDB collections: users, user_sessions, listings, projects, inquiries, interior_leads, loan_leads, banks, amenities, cities, localities, files, favourites, content, bank_rates_log, password_reset_tokens.
- Frontend: React 19 + react-router-dom 7 + Tailwind + shadcn/ui + lucide-react + sonner + react-leaflet. Theme: emerald (#06402B), warm gold (#B68D40), cream (#FAF9F6). Fonts: Cormorant Garamond (display) + Outfit (body).
- All `/api` prefix routes. REACT_APP_BACKEND_URL drives frontend API calls.

## ✅ Implemented (2026-02-16)
### Auth
- JWT email/password (cookies + Bearer)
- Mock mobile OTP on register (6-digit returned in response for dev)
- Forgot/reset password
- Google OAuth (Emergent) one-click — `/auth/google/session` exchanges session_id
- Role-based dashboard redirects

### Marketplace
- Homepage: hero + universal search + featured projects + Bangalore locality grid + featured listings + interiors CTA
- Properties listing page: filters (kind/locality/bedrooms/price/sort), grid + map view, 12+ seeded listings
- Property detail: gallery, stats grid, description, map, embedded EMI calc, inquiry form, similar properties
- Projects list + Project Microsite at `/projects/{city}/{locality}/{slug}` with hero, RERA verified badge, amenities by category, approved banks list, embedded EMI calculator, floor plans, interior budget suggestion, location map
- Compare page (side-by-side, up to 4 listings)
- Favourites page (saved listings + projects)
- Universal search bar with live preview (projects/listings/localities)

### EMI Calculator
- Standalone `/emi-calculator` + embedded on property/project pages
- Bank selector, down-payment %, tenure slider, INR formatting
- Saves to loan_leads on submit

### Homesqre Interiors `/interiors`
- Premium standalone-feel landing
- Hero with sticky inquiry form + offer banner
- How it works (4 steps), Services (6 cards), Why Choose Us (5 stats)
- Tabbed Design Gallery by room
- Cost Estimator (BHK × Basic/Standard/Premium price matrix)
- Reviews, FAQ, Final CTA banner

### Dashboards
- **Agent**: listings CRUD (create/edit/delete with status pending), leads kanban (7 statuses), subscription contact-RM
- **Builder**: projects CRUD, project settings (toggle amenities + banks), inquiries kanban, subscription
- **Admin**: overview analytics (10 metrics), users mgmt (role/suspend), listings/projects approval + feature toggle, all inquiries, interior leads, loan leads, banks rate editor (logs to bank_rates_log), amenities mgmt (active toggle, pending approvals)
- **Customer**: saved counts, latest listings, saved projects

### Seeds (on startup)
- 4 test users (admin/agent/builder/customer)
- 8 banks with current ROI ranges
- 35 amenities across 6 categories
- Bangalore + 15 localities
- 12 listings + 4 projects with full data

### Integrations
- Emergent Object Storage initialized at startup (uploads endpoint live at POST /api/upload)
- Emergent Google OAuth (`auth.emergentagent.com`)

## ✅ Testing
- Backend: 65/65 tests pass (100%) — 50 baseline + 15 new-feature tests in `/app/backend/tests/`
- All seeds verified, role-based auth verified, _id never exposed.

## ✅ Iteration 2 additions (2026-02-16)
- **Profile completion flow** — `PUT /api/me/profile` + `/profile/complete` page; Google OAuth + JWT login redirect when `profile_completed=false`.
- **Homepage CMS editor** at `/dashboard/admin/cms/homepage` — edit hero, promo banner, stats; persists via `PUT /api/content/homepage`.
- **Interiors CMS editor** at `/dashboard/admin/cms/interiors` — edit hero, how-it-works, services, why-choose-us, cost matrix (BHK × tier), gallery, reviews, FAQ, final CTA.
- **Threaded chat in inquiries** — clicking message icon on agent/builder kanban card opens dialog with status, follow-up datetime, notes, and live chat thread (PUT /api/inquiries/{id} with message/note/next_followup).

## ✅ Iteration 4 additions (2026-05-19) — "Light & Migratable" refactor
- **Modularized `server.py`**: extracted seeds + content defaults to `backend/defaults.py`; removed duplicate `DEFAULT_*_CONTENT` blocks. server.py down to ~1290 lines.
- **Pluggable storage**: `backend/storage.py` adapter with `emergent` (default) and `local` backends, selectable via `STORAGE_BACKEND` env. Future S3/GCS = one class.
- **Env-driven CORS + cookies**: `CORS_ORIGINS` (comma-separated → enables `allow_credentials=True`), `COOKIE_SAMESITE`, `COOKIE_SECURE`. Ready for cross-origin frontend on Hostinger / cPanel.
- **Deploy artefacts**: `/app/backend/Dockerfile`, `/app/docker-compose.yml`, `/app/.env.example` for one-command VPS deploy.
- **`/app/MIGRATION.md`**: step-by-step guide to move off Emergent (DB, storage, OAuth, cookies).
- **Regression**: 94/94 backend tests pass (existing 65 + 10 new refactor + 19 testing-agent additions).

## Backlog (P1 — next iteration)
- File uploads UI for property photos/floor plans (currently uses URLs)
- Email notifications via Resend/SendGrid (currently mocked)
- Real SMS OTP via Twilio (currently mock)
- Blog management
- About Us / Contact Us CMS pages
- Homepage CMS editor (hero, promo banner, featured selectors)
- Interiors CMS editor (drag-reorder steps, gallery upload)
- City/Locality CRUD UI in admin
- Profile completion prompt after first login
- Listing/project expiry notifications
- CSV export for leads
- Threaded chat within inquiry detail view (backend supports messages array; UI missing)
- Notification centre (admin push to localities)

## Backlog (P2)
- Image uploads via object storage frontend integration with progress bars
- Brute-force lockout on login (5 attempts → 15min)
- Password complexity rules
- ENV-gate dev_otp / dev_token responses
- Splitting server.py into routers (currently 1k lines, recommended)
- Pagination on list endpoints (currently limit-only)
- Real-time inquiry notifications (websocket or SSE)
- Mobile app banner CMS
- Analytics charts (recharts) — currently number tiles only

## Known Limitations
- Object storage uploads work in prod; in some dev envs init may fail (handled gracefully)
- CORS: `*` with `allow_credentials=False`. App relies on Bearer tokens primarily; httpOnly cookies set but won't work cross-origin without explicit origin allowlist (acceptable for current preview deployment since frontend and backend share origin via ingress)
- Notifications are in-app only (no email/SMS yet)

## Next Action Items
1. Profile-completion prompt on first login for Google-OAuth users (mobile + role)
2. Switch to file uploads UI on the listing/project create dialogs (object storage)
3. Real SMS OTP via Twilio when ready
