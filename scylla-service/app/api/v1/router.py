from fastapi import APIRouter

from app.api.v1.endpoints import health, keyspaces, query, tables

router = APIRouter(prefix="/api/v1")

router.include_router(health.router, tags=["Health"])
router.include_router(keyspaces.router, tags=["Keyspaces"])
router.include_router(tables.router, tags=["Tables"])
router.include_router(query.router, tags=["Query"])
