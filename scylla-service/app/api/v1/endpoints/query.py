from datetime import datetime
from urllib.parse import parse_qs

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from app.core.responses import ok
from app.schemas.query import QueryRequest, QueryResponse
from app.schemas.response import ApiResponse
from app.services import export_service, query_service

router = APIRouter()


@router.post("/query", response_model=ApiResponse[QueryResponse])
async def execute_query(payload: QueryRequest) -> ApiResponse:
    result = await query_service.run_query(
        raw_query=payload.query,
        page_size=payload.page_size,
        paging_state_token=payload.paging_state,
    )
    return ok(result)


@router.post("/query/export")
async def export_query_csv(request: Request) -> StreamingResponse:
    # Submitted as a plain HTML form so the browser streams the download
    # straight to disk. Parsed by hand to avoid the python-multipart dependency.
    form = parse_qs((await request.body()).decode("utf-8"))
    query = (form.get("query") or [""])[0].strip()
    if not query:
        raise HTTPException(status_code=422, detail="query must not be empty")

    stream = await export_service.start_csv_export(query)
    filename = f"query-export-{datetime.now().strftime('%Y%m%d-%H%M%S')}.csv"
    return StreamingResponse(
        stream,
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            # Tell nginx not to buffer, so rows reach the browser as they are produced
            "X-Accel-Buffering": "no",
        },
    )
