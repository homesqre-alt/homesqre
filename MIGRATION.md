# Homesqre — Migration Guide

This document explains how to move Homesqre off Emergent onto any standard
VPS / cPanel / Docker host (Hostinger, MilesWeb, AWS EC2, Railway, etc.).

The code is structured so migration is a **config-only** change for most
pieces — no code rewrites required.

---

## 1. What is Emergent-specific?

Only three things are tied to Emergent. Everything else is vanilla
FastAPI + MongoDB + React.

| Concern        | Emergent piece                              | Where it lives                                 |
| -------------- | ------------------------------------------- | ---------------------------------------------- |
| Object storage | `EmergentStorage` adapter                   | `backend/storage.py`                           |
| Google OAuth   | `EMERGENT_AUTH_SESSION_URL` session bridge  | `backend/server.py` → `/auth/google/session`   |
| LLM key        | `EMERGENT_LLM_KEY` env var                  | `backend/.env`                                 |

---

## 2. Database — already portable

MongoDB is plain-vanilla. Just point `MONGO_URL` to your own cluster
(MongoDB Atlas, self-hosted, etc.). The `docker-compose.yml` ships a
MongoDB container for free.

```env
MONGO_URL="mongodb://mongo:27017"
DB_NAME="homesqre"
```

---

## 3. Object Storage — flip one env var

`backend/storage.py` is a tiny adapter with two backends out of the box:

* `emergent` (default) — Emergent's hosted object store.
* `local` — writes files to disk at `LOCAL_STORAGE_DIR`.

To migrate to local disk on your VPS:

```env
STORAGE_BACKEND=local
LOCAL_STORAGE_DIR=/app/backend/uploads
```

Add an S3 / GCS / R2 backend by writing one class in `storage.py`:

```python
class S3Storage:
    def put(self, path, data, content_type) -> dict: ...
    def get(self, path) -> tuple[bytes, str]: ...
```

Register it in `_BACKENDS = {"s3": S3Storage, ...}` and set
`STORAGE_BACKEND=s3` in `.env`. **No other code in the app changes.**

> ⚠️ Existing files on Emergent storage do **not** auto-copy. Either
> back them up first or write a one-off migration script that walks the
> `files` collection and re-uploads each `storage_path`.

---

## 4. Google OAuth — swap to standard Google

The Emergent session bridge is at `/api/auth/google/session`. To migrate
to vanilla Google OAuth:

1. Create OAuth credentials at https://console.cloud.google.com/apis/credentials
2. Install the standard library: `pip install google-auth google-auth-oauthlib`
3. Replace the body of `/api/auth/google/session` in `server.py`:

```python
from google.oauth2 import id_token
from google.auth.transport import requests as g_requests

idinfo = id_token.verify_oauth2_token(
    body.id_token, g_requests.Request(), GOOGLE_CLIENT_ID
)
email = idinfo["email"]
# ... rest stays the same
```

4. Update `frontend/src/lib/oauth.js` to use Google's authorize URL.
5. Drop `EMERGENT_LLM_KEY` if you don't use the AI features.

---

## 5. Cross-origin cookies (separate frontend + backend domains)

If you split the frontend onto a different domain (e.g., frontend on
cPanel/Hostinger, backend on a VPS), set in `backend/.env`:

```env
CORS_ORIGINS="https://homesqre.com,https://www.homesqre.com"
COOKIE_SAMESITE="none"
COOKIE_SECURE="true"
```

The app reads these at boot and:
* Sets explicit allow-list on CORS with `allow_credentials=True`
* Issues cookies as `SameSite=None; Secure`

Both are **required** by browsers for cross-domain login to work.

---

## 6. One-command deploy with Docker

```bash
# From repo root
docker compose up -d
```

This builds the backend image, starts MongoDB, and exposes the API on
`:8001`. Frontend can be built separately (`yarn build`) and served by
Nginx / cPanel / any static host.

See `docker-compose.yml` and `backend/Dockerfile` for details.

---

## 7. Pre-migration checklist

* [ ] Export MongoDB data: `mongodump --uri "$MONGO_URL" --out ./dump`
* [ ] Back up object storage (walk `db.files`, download each)
* [ ] Reserve your domain DNS records
* [ ] Provision new MongoDB (Atlas free tier works)
* [ ] Pick a storage backend (`local` / `s3` / write your own)
* [ ] Update `.env` with new URLs + `CORS_ORIGINS`, cookie flags
* [ ] Restore MongoDB: `mongorestore --uri "$NEW_MONGO_URL" ./dump`
* [ ] Replay storage uploads
* [ ] Smoke-test login, listings, inquiries, CMS, EMI calculator
