from fastapi import APIRouter, Depends

from app.api.v1.endpoints import health, keyspaces, query, tables
from app.core.security import require_api_key

router = APIRouter(prefix="/api/v1")

# Health is unauthenticated: the Kubernetes probes in kube-dep.yaml call it
# and the kubelet cannot send X-API-Key.
router.include_router(health.router, tags=["Health"])

# The API-key check is attached to this router itself, so every endpoint
# mounted below inherits it — including any added later.
protected = APIRouter(dependencies=[Depends(require_api_key)])
protected.include_router(keyspaces.router, tags=["Keyspaces"])
protected.include_router(tables.router, tags=["Tables"])
protected.include_router(query.router, tags=["Query"])

router.include_router(protected)
