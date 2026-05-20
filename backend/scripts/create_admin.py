"""Master Admin bootstrap CLI.

Creates a brand-new admin user OR promotes an existing user to admin.
Idempotent — safe to re-run; will reset password if --reset-password is passed.

USAGE (inside the running backend container):

    docker compose exec backend python scripts/create_admin.py \
        --email you@homesqre.com \
        --password 'YourStrongPass!' \
        --name 'Site Owner'

Or non-interactively via env vars:

    docker compose exec \
        -e ADMIN_BOOTSTRAP_EMAIL=you@homesqre.com \
        -e ADMIN_BOOTSTRAP_PASSWORD='YourStrongPass!' \
        -e ADMIN_BOOTSTRAP_NAME='Site Owner' \
        backend python scripts/create_admin.py

To reset the password of an existing admin:

    docker compose exec backend python scripts/create_admin.py \
        --email you@homesqre.com --password 'NewPass!' --reset-password
"""

import argparse
import asyncio
import getpass
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

# Make the backend package importable when run from /app/backend
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

import bcrypt  # noqa: E402
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402


def _hash(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def _iso(dt: datetime) -> str:
    return dt.isoformat()


async def create_or_promote(email: str, password: str, name: str, reset_password: bool) -> dict:
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    if not mongo_url or not db_name:
        raise RuntimeError("MONGO_URL and DB_NAME must be set in the environment.")

    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    email = email.lower().strip()
    existing = await db.users.find_one({"email": email})

    if existing:
        update: dict = {"role": "admin", "is_verified": True, "profile_completed": True}
        if reset_password:
            update["password_hash"] = _hash(password)
        await db.users.update_one({"email": email}, {"$set": update})
        client.close()
        return {
            "action": "promoted" + ("_with_password_reset" if reset_password else ""),
            "email": email,
            "user_id": existing["user_id"],
        }

    user = {
        "user_id": f"user_{uuid.uuid4().hex[:12]}",
        "email": email,
        "name": name or "Master Admin",
        "mobile": "",
        "role": "admin",
        "is_verified": True,
        "profile_completed": True,
        "password_hash": _hash(password),
        "created_at": _iso(datetime.now(timezone.utc)),
    }
    await db.users.insert_one(user)
    client.close()
    return {"action": "created", "email": email, "user_id": user["user_id"]}


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Create or promote a Homesqre Master Admin.")
    p.add_argument("--email", default=os.environ.get("ADMIN_BOOTSTRAP_EMAIL"))
    p.add_argument("--password", default=os.environ.get("ADMIN_BOOTSTRAP_PASSWORD"))
    p.add_argument("--name", default=os.environ.get("ADMIN_BOOTSTRAP_NAME", "Master Admin"))
    p.add_argument(
        "--reset-password",
        action="store_true",
        help="If the user exists, overwrite their password hash with the supplied one.",
    )
    return p.parse_args()


def main() -> None:
    args = _parse_args()

    email = args.email or input("Admin email: ").strip()
    if not email or "@" not in email:
        print("ERROR: a valid email is required.", file=sys.stderr)
        sys.exit(2)

    password = args.password
    if not password:
        password = getpass.getpass("Admin password: ")
        confirm = getpass.getpass("Confirm password: ")
        if password != confirm:
            print("ERROR: passwords do not match.", file=sys.stderr)
            sys.exit(2)
    if len(password) < 8:
        print("ERROR: password must be at least 8 characters.", file=sys.stderr)
        sys.exit(2)

    result = asyncio.run(create_or_promote(email, password, args.name, args.reset_password))
    print("OK:", result)


if __name__ == "__main__":
    main()
