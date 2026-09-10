from __future__ import annotations

import asyncio
from typing import Any, Dict, List, Optional

from cassandra import OperationTimedOut, ReadTimeout
from cassandra.query import SimpleStatement
from fastapi import HTTPException

from app.core.logging import get_logger
from app.db.session import get_session
from app.masking.audit import (
    log_masking_error,
    log_query_done,
    log_query_error,
    log_query_execute,
    log_query_timeout,
    log_scylla_timeout,
)
from app.masking import (
    ProtectedQueryError,
    analyze_protected_query,
    mask_rows,
)
from app.schemas.query import QueryResponse
from app.services.paging import decode_paging_state, encode_paging_state
from app.services.query_validator import validate_and_prepare
from app.services.result_serialization import serialize_rows

logger = get_logger(__name__)

QUERY_TIMEOUT = 10.0


async def run_query(
    raw_query: str,
    page_size: int,
    paging_state_token: Optional[str],
) -> QueryResponse:
    # Validate + normalise the CQL (blocks unsafe statements, enforces LIMIT)
    query = validate_and_prepare(raw_query)

    try:
        protected_query = analyze_protected_query(query)
    except ProtectedQueryError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    # Validate token and detect query mismatch before hitting the DB
    decoded_state = decode_paging_state(paging_state_token, query)

    log_query_execute(logger, protected_query, query, page_size, bool(decoded_state))

    session = get_session()
    stmt = SimpleStatement(query, fetch_size=page_size)
    loop = asyncio.get_event_loop()

    try:
        result = await asyncio.wait_for(
            loop.run_in_executor(
                None,
                lambda: session.execute(stmt, paging_state=decoded_state),
            ),
            timeout=QUERY_TIMEOUT,
        )
    except asyncio.TimeoutError:
        log_query_timeout(logger, protected_query, query, QUERY_TIMEOUT)
        raise HTTPException(
            status_code=504,
            detail=f"Query timed out after {QUERY_TIMEOUT}s",
        )
    except (OperationTimedOut, ReadTimeout) as exc:
        log_scylla_timeout(logger, protected_query, query, exc)
        raise HTTPException(status_code=504, detail="ScyllaDB operation timed out")
    except Exception as exc:
        log_query_error(logger, protected_query, query, exc)
        detail = "Query execution error" if protected_query else f"Query execution error: {exc}"
        raise HTTPException(status_code=500, detail=detail)

    # current_rows = this page only; iterating ResultSet would auto-fetch more pages
    columns: List[str] = list(result.column_names or [])
    if protected_query:
        try:
            raw_rows: List[Dict[str, Any]] = [
                dict(row._asdict()) for row in result.current_rows
            ]
            rows = serialize_rows(mask_rows(raw_rows, protected_query.policy))
            del raw_rows
        except Exception as exc:
            log_masking_error(logger, protected_query, exc)
            raise HTTPException(
                status_code=500,
                detail="Unable to safely mask query results",
            ) from exc
    else:
        rows = serialize_rows(
            dict(row._asdict()) for row in result.current_rows
        )

    next_paging_state = encode_paging_state(result.paging_state, query)

    log_query_done(logger, protected_query, len(rows), next_paging_state is not None)

    return QueryResponse(
        columns=columns,
        rows=rows,
        row_count=len(rows),
        paging_state=next_paging_state,
    )
