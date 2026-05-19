"""
Pluggable object storage.

This module hides Emergent-specific storage behind a tiny interface so the rest
of the app doesn't know — or care — where files actually live. Migration to a
different backend (local disk, S3, GCS, R2) is one env-var change.

Choose via env: STORAGE_BACKEND=emergent | local   (default: emergent)

----- HOW TO MIGRATE OFF EMERGENT -----
Set STORAGE_BACKEND=local in backend/.env and (optionally) LOCAL_STORAGE_DIR.
That's the entire migration. Existing files saved in Emergent storage will not
auto-copy — back them up first or write a one-off migration script.
For S3/GCS, add a new class below implementing `put` / `get` and register it
in `_BACKENDS` — no other code in the app should need touching.
"""

import os
from pathlib import Path
from typing import Protocol, Tuple

import requests

# ----------------------------------------------------------------------------
# Adapter interface
# ----------------------------------------------------------------------------
class StorageAdapter(Protocol):
    def put(self, path: str, data: bytes, content_type: str) -> dict: ...
    def get(self, path: str) -> Tuple[bytes, str]: ...


# ----------------------------------------------------------------------------
# Emergent-hosted (default)  --  EMERGENT-SPECIFIC
# ----------------------------------------------------------------------------
class EmergentStorage:
    """Calls Emergent's hosted object-storage service."""
    BASE = "https://integrations.emergentagent.com/objstore/api/v1/storage"

    def __init__(self) -> None:
        self._key: str | None = None
        self._emergent_key = os.environ.get("EMERGENT_LLM_KEY", "")

    def _ensure_key(self) -> str:
        if self._key:
            return self._key
        if not self._emergent_key:
            raise RuntimeError("EMERGENT_LLM_KEY not set — cannot init Emergent storage")
        r = requests.post(f"{self.BASE}/init", json={"emergent_key": self._emergent_key}, timeout=30)
        r.raise_for_status()
        self._key = r.json()["storage_key"]
        return self._key

    def put(self, path: str, data: bytes, content_type: str) -> dict:
        key = self._ensure_key()
        r = requests.put(
            f"{self.BASE}/objects/{path}",
            headers={"X-Storage-Key": key, "Content-Type": content_type},
            data=data,
            timeout=120,
        )
        r.raise_for_status()
        return r.json()

    def get(self, path: str) -> Tuple[bytes, str]:
        key = self._ensure_key()
        r = requests.get(
            f"{self.BASE}/objects/{path}",
            headers={"X-Storage-Key": key},
            timeout=60,
        )
        r.raise_for_status()
        return r.content, r.headers.get("Content-Type", "application/octet-stream")


# ----------------------------------------------------------------------------
# Local filesystem  --  portable fallback for any host
# ----------------------------------------------------------------------------
class LocalStorage:
    """Writes objects to a directory on disk. Perfect for VPS / cPanel hosts."""

    def __init__(self) -> None:
        self.root = Path(os.environ.get("LOCAL_STORAGE_DIR", "/app/backend/uploads"))
        self.root.mkdir(parents=True, exist_ok=True)

    def put(self, path: str, data: bytes, content_type: str) -> dict:
        full = self.root / path
        full.parent.mkdir(parents=True, exist_ok=True)
        full.write_bytes(data)
        return {"path": path, "size": len(data)}

    def get(self, path: str) -> Tuple[bytes, str]:
        full = self.root / path
        if not full.exists():
            raise FileNotFoundError(path)
        return full.read_bytes(), "application/octet-stream"


# ----------------------------------------------------------------------------
# Selector
# ----------------------------------------------------------------------------
_BACKENDS = {"emergent": EmergentStorage, "local": LocalStorage}
_storage: StorageAdapter | None = None


def get_storage() -> StorageAdapter:
    global _storage
    if _storage is None:
        name = os.environ.get("STORAGE_BACKEND", "emergent").lower()
        cls = _BACKENDS.get(name, EmergentStorage)
        _storage = cls()
    return _storage
