from __future__ import annotations

import asyncio
from typing import Any, Dict, List, Optional

from cassandra import OperationTimedOut, ReadTimeout
from cassandra.query import SimpleStatement
from fastapi import HTTPException

from app.core.logging import get_logger
from app.db.session import get_session
from app.schemas.query import QueryResponse
from app.services.paging import decode_paging_state, encode_paging_state
from app.services.query_validator import validate_and_prepare

logger = get_logger(__name__)

QUERY_TIMEOUT = 10.0


async def run_query(
    raw_query: str,
    page_size: int,
    paging_state_token: Optional[str],
) -> QueryResponse:
    # Validate + normalise the CQL (blocks unsafe statements, enforces LIMIT)
    query = validate_and_prepare(raw_query)

    # Validate token and detect query mismatch before hitting the DB
    decoded_state = decode_paging_state(paging_state_token, query)

    logger.info(
        "query_execute | page_size=%d paging=%s query=%r",
        page_size,
        "continued" if decoded_state else "first_page",
        query,
    )

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
        logger.warning("query_timeout | after=%.1fs query=%r", QUERY_TIMEOUT, query)
        raise HTTPException(
            status_code=504,
            detail=f"Query timed out after {QUERY_TIMEOUT}s",
        )
    except (OperationTimedOut, ReadTimeout) as exc:
        logger.warning("scylladb_timeout | error=%s query=%r", exc, query)
        raise HTTPException(status_code=504, detail="ScyllaDB operation timed out")
    except Exception as exc:
        logger.error("query_error | error=%s query=%r", exc, query)
        raise HTTPException(status_code=500, detail=f"Query execution error: {exc}")

    # current_rows = this page only; iterating ResultSet would auto-fetch more pages
    columns: List[str] = list(result.column_names or [])
    rows: List[Dict[str, Any]] = [dict(row._asdict()) for row in result.current_rows]
    next_paging_state = encode_paging_state(result.paging_state, query)

    logger.info(
        "query_done | rows=%d has_next_page=%s",
        len(rows),
        next_paging_state is not None,
    )

    return QueryResponse(
        columns=columns,
        rows=rows,
        row_count=len(rows),
        paging_state=next_paging_state,
    )
