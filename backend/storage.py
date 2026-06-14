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
import mimetypes
from pathlib import Path
from typing import Protocol, Tuple

import requests
try:
    import boto3
    from botocore.exceptions import ClientError
except ImportError:
    boto3 = None

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
        full = (self.root / path).resolve()
        # Security: prevent path traversal outside the upload root
        if not full.is_relative_to(self.root.resolve()):
            raise PermissionError("Path traversal attempt blocked")
        if not full.exists():
            raise FileNotFoundError(path)
        content_type, _ = mimetypes.guess_type(str(full))
        return full.read_bytes(), content_type or "application/octet-stream"


# ----------------------------------------------------------------------------
# Cloudflare R2 / S3-compatible Storage
# ----------------------------------------------------------------------------
class CloudflareR2Storage:
    """Writes objects to a Cloudflare R2 bucket."""

    def __init__(self) -> None:
        if boto3 is None:
            raise RuntimeError("boto3 is not installed. Please install boto3 and botocore to use R2 storage.")
        
        self.endpoint_url = os.environ.get("R2_ENDPOINT_URL")
        self.access_key = os.environ.get("R2_ACCESS_KEY_ID")
        self.secret_key = os.environ.get("R2_SECRET_ACCESS_KEY")
        self.bucket_name = os.environ.get("R2_BUCKET_NAME")

        if not all([self.endpoint_url, self.access_key, self.secret_key, self.bucket_name]):
            raise RuntimeError("Missing one or more required environment variables for R2: R2_ENDPOINT_URL, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME")

        self.s3_client = boto3.client(
            "s3",
            endpoint_url=self.endpoint_url,
            aws_access_key_id=self.access_key,
            aws_secret_access_key=self.secret_key,
            region_name="auto",
        )

    def put(self, path: str, data: bytes, content_type: str) -> dict:
        try:
            self.s3_client.put_object(
                Bucket=self.bucket_name,
                Key=path,
                Body=data,
                ContentType=content_type,
            )
            return {"path": path, "size": len(data)}
        except ClientError as e:
            raise RuntimeError(f"Failed to upload to R2: {e}")

    def get(self, path: str) -> Tuple[bytes, str]:
        try:
            response = self.s3_client.get_object(Bucket=self.bucket_name, Key=path)
            content_type = response.get("ContentType", "application/octet-stream")
            data = response["Body"].read()
            return data, content_type
        except ClientError as e:
            if e.response['Error']['Code'] == 'NoSuchKey':
                raise FileNotFoundError(path)
            raise RuntimeError(f"Failed to fetch from R2: {e}")


# ----------------------------------------------------------------------------
# Selector
# ----------------------------------------------------------------------------
_BACKENDS = {"emergent": EmergentStorage, "local": LocalStorage, "r2": CloudflareR2Storage}
_storage: StorageAdapter | None = None


def get_storage() -> StorageAdapter:
    global _storage
    if _storage is None:
        name = os.environ.get("STORAGE_BACKEND", "emergent").lower()
        cls = _BACKENDS.get(name, EmergentStorage)
        _storage = cls()
    return _storage
