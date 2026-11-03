import asyncio
from contextlib import suppress

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from app.core.logging import get_logger
from app.core.responses import err, ok
from app.schemas.query import QueryRequest, QueryResponse
from app.schemas.response import ApiResponse
from app.services import query_service

router = APIRouter()
logger = get_logger(__name__)
HEARTBEAT_SECONDS = 5


async def execute_query(payload: QueryRequest) -> ApiResponse:
    result = await query_service.run_query(
        raw_query=payload.query,
        page_size=payload.page_size,
        paging_state_token=payload.paging_state,
    )
    return ok(result)


@router.post("/query", response_model=ApiResponse[QueryResponse])
async def execute_query_http(payload: QueryRequest, request: Request):
    if "text/event-stream" not in request.headers.get("accept", "").lower():
        return await execute_query(payload)

    async def events():
        task = asyncio.create_task(execute_query(payload))
        try:
            # Send headers immediately; heartbeat comments keep idle proxy
            # connections alive while Scylla is still computing the aggregate.
            yield ": query started\n\n"
            while not task.done():
                done, _ = await asyncio.wait({task}, timeout=HEARTBEAT_SECONDS)
                if not done:
                    yield ": keepalive\n\n"
            try:
                response = task.result()
            except HTTPException as exc:
                response = err(str(exc.detail), f"HTTP_{exc.status_code}")
            except Exception as exc:
                logger.error("query_stream_error | error_type=%s", type(exc).__name__)
                response = err("Internal server error", "INTERNAL_ERROR")
            yield f"event: result\ndata: {response.model_dump_json()}\n\n"
        finally:
            task.cancel()
            with suppress(asyncio.CancelledError, Exception):
                await task

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"},
    )
