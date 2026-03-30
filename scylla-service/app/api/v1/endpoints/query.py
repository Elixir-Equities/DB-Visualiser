from fastapi import APIRouter

from app.core.responses import ok
from app.schemas.query import QueryRequest, QueryResponse
from app.schemas.response import ApiResponse
from app.services import query_service

router = APIRouter()


@router.post("/query", response_model=ApiResponse[QueryResponse])
async def execute_query(payload: QueryRequest) -> ApiResponse:
    result = await query_service.run_query(
        raw_query=payload.query,
        page_size=payload.page_size,
        paging_state_token=payload.paging_state,
    )
    return ok(result)
