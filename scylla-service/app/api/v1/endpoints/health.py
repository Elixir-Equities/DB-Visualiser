from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.core.responses import err, ok
from app.db.session import get_session
from app.schemas.health import HealthResponse
from app.schemas.response import ApiResponse

router = APIRouter()


@router.get("/health", response_model=ApiResponse[HealthResponse])
async def health_check() -> ApiResponse | JSONResponse:
    try:
        session = get_session()
        _ = session.cluster.metadata.cluster_name
        return ok(HealthResponse(status="ok", scylladb="connected"))
    except Exception as exc:
        # Health is a probe — return 200 degraded rather than raising
        return JSONResponse(
            status_code=200,
            content=err(message=str(exc), code="SCYLLADB_UNAVAILABLE").model_dump(),
        )
