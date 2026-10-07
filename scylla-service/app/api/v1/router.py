from fastapi import APIRouter, Depends

from app.api.v1.endpoints import health, keyspaces, query, tables
from app.core.security import require_api_key

# The API-key check is attached to the router itself, so every endpoint
# mounted below inherits it — including any added later.
router = APIRouter(prefix="/api/v1", dependencies=[Depends(require_api_key)])

router.include_router(health.router, tags=["Health"])
router.include_router(keyspaces.router, tags=["Keyspaces"])
router.include_router(tables.router, tags=["Tables"])
router.include_router(query.router, tags=["Query"])
