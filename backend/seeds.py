"""Startup-time seeders: indices, admin user, content blobs, legacy status
migrations. Called once from `server.py` startup event."""
import os
import uuid

from core import db, log, iso, now_utc, hash_password
from defaults import DEFAULT_HOMEPAGE_CONTENT, DEFAULT_INTERIORS_CONTENT, DEFAULT_PACKAGES


async def seed_data():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.password_reset_tokens.create_index("expires_at", expireAfterSeconds=0)
    await db.user_sessions.create_index("session_token", unique=True)

    admin_pwd = os.environ.get("ADMIN_PASSWORD")
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@homesqre.com")
    if admin_pwd:
        existing = await db.users.find_one({"email": admin_email})
        if not existing:
            await db.users.insert_one({
                "user_id": f"user_{uuid.uuid4().hex[:12]}",
                "email": admin_email,
                "name": "Homesqre Admin",
                "mobile": os.environ.get("ADMIN_MOBILE", "+919999999999"),
                "role": "admin",
                "is_verified": True,
                "profile_completed": True,
                "password_hash": hash_password(admin_pwd),
                "created_at": iso(now_utc()),
                "project_phase": "unpaid"
            })
            log.info(f"Admin user seeded: {admin_email}")

    if os.environ.get("SEED_DEMO_USERS", "false").lower() == "true":
        for email, pwd, role, name, mobile in [
            ("agent@homesqre.com", "Agent@2026", "agent", "Demo Agent", "+919999999991"),
            ("builder@homesqre.com", "Builder@2026", "builder", "Demo Builder", "+919999999992"),
            ("customer@homesqre.com", "Customer@2026", "customer", "Demo Customer", "+919999999993"),
        ]:
            existing = await db.users.find_one({"email": email})
            if existing:
                continue
            await db.users.insert_one({
                "user_id": f"user_{uuid.uuid4().hex[:12]}",
                "email": email,
                "name": name,
                "mobile": mobile,
                "role": role,
                "is_verified": True,
                "profile_completed": True,
                "password_hash": hash_password(pwd),
                "created_at": iso(now_utc()),
                "project_phase": "unpaid"
            })
        log.info("Demo users seeded (SEED_DEMO_USERS=true)")

    # CMS content blobs (idempotent)
    for key, payload in [
        ("interiors", DEFAULT_INTERIORS_CONTENT),
        ("homepage", DEFAULT_HOMEPAGE_CONTENT),
    ]:
        existing = await db.content.find_one({"key": key})
        if not existing:
            await db.content.insert_one({
                "key": key,
                "data": payload,
                "updated_at": iso(now_utc()),
            })
            log.info(f"Content seeded: {key}")

    # Packages seed
    existing_packages = await db.cms_packages.find_one({"_id": "current"})
    if not existing_packages:
        await db.cms_packages.insert_one({
            "_id": "current",
            "packages": DEFAULT_PACKAGES,
            "updated_at": iso(now_utc())
        })
        log.info("Packages catalogue seeded")
