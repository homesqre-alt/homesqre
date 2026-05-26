"""Homesqre Backend — FastAPI entrypoint.

All routes live under `routes/*` and register themselves on the shared
`api` router defined in `core`. This file only wires startup/shutdown
events and mounts the router.
"""
from core import app, api, client, log
from storage_helpers import init_storage
from seeds import seed_data, migrate_status_fields
from crm_helpers import seed_crm_defaults, migrate_to_unified_leads

# Importing `routes` triggers each module to register its decorated handlers
# on the shared `api` router. Side-effect import — do not remove.
import routes  # noqa: F401

# Mount the fully-loaded router exactly once.
app.include_router(api)


@app.on_event("startup")
async def startup_event():
    try:
        init_storage()
    except Exception as e:
        log.warning(f"storage init: {e}")
    try:
        await seed_data()
        await migrate_status_fields()
        await seed_crm_defaults()
        await migrate_to_unified_leads()
        log.info("Seeds ensured")
    except Exception as e:
        log.error(f"seed failed: {e}")


@app.on_event("shutdown")
async def shutdown_event():
    client.close()
