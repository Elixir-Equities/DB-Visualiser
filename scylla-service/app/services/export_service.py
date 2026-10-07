"""
Server-side CSV export.

The first page is fetched up front so that validation, syntax and timeout
errors still come back as a normal JSON error response. After that the rows
are streamed to the client page by page. Protected queries use the same
analysis, masking and safe diagnostics as the normal query endpoint.
"""
from __future__ import annotations

import asyncio
import csv
import io
import json
from datetime import date, datetime, time
from typing import Any, Iterator, List

from cassandra import OperationTimedOut, ReadTimeout
from cassandra.query import SimpleStatement
from fastapi import HTTPException

from app.core.logging import get_logger
from app.db.session import get_session
from app.masking import ProtectedQueryError, analyze_protected_query, mask_rows
from app.masking.audit import (
    log_masking_error,
    log_query_done,
    log_query_error,
    log_query_execute,
    log_query_timeout,
    log_scylla_timeout,
)
from app.services.query_service import QUERY_TIMEOUT
from app.services.query_validator import validate_and_prepare

logger = get_logger(__name__)

EXPORT_FETCH_SIZE = 5000
# Flush to the client after this many rows so the download makes steady progress
FLUSH_EVERY_ROWS = 1000


def _to_cell(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (bytes, bytearray)):
        return "0x" + bytes(value).hex()
    if isinstance(value, (datetime, date, time)):
        return value.isoformat()
    if isinstance(value, (list, tuple, set, frozenset, dict)) or hasattr(value, "items"):
        return json.dumps(_jsonable(value), default=str, ensure_ascii=False)
    return str(value)


def _jsonable(value: Any) -> Any:
    # Scylla collections (set, map, udt) are not directly JSON serialisable
    if isinstance(value, (set, frozenset, list, tuple)):
        return [_jsonable(v) for v in value]
    if isinstance(value, dict) or hasattr(value, "items"):
        return {str(k): _jsonable(v) for k, v in value.items()}
    if isinstance(value, (bytes, bytearray)):
        return "0x" + bytes(value).hex()
    if isinstance(value, (datetime, date, time)):
        return value.isoformat()
    return value


async def start_csv_export(raw_query: str) -> Iterator[bytes]:
    """Run the first page and return a generator that streams the CSV."""
    query = validate_and_prepare(raw_query)
    try:
        protected_query = analyze_protected_query(query)
    except ProtectedQueryError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    log_query_execute(logger, protected_query, query, EXPORT_FETCH_SIZE, False)

    session = get_session()
    stmt = SimpleStatement(query, fetch_size=EXPORT_FETCH_SIZE)
    loop = asyncio.get_event_loop()

    try:
        result = await asyncio.wait_for(
            loop.run_in_executor(
                None,
                lambda: session.execute(stmt, timeout=QUERY_TIMEOUT),
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
        raise HTTPException(status_code=500, detail=detail) from exc

    columns: List[str] = list(result.column_names or [])

    def prepare_page(rows: Any) -> List[List[str]]:
        if not protected_query:
            return [[_to_cell(value) for value in row] for row in rows]
        try:
            masked = mask_rows(
                (dict(row._asdict()) for row in rows), protected_query.policy,
            )
            return [[_to_cell(row[column]) for column in columns] for row in masked]
        except Exception as exc:
            log_masking_error(logger, protected_query, exc)
            raise HTTPException(
                status_code=500, detail="Unable to safely mask query results",
            ) from exc

    # Mask the entire first page before returning response headers. This also
    # keeps row-conversion failures on the standard JSON error path.
    first_page = await loop.run_in_executor(None, prepare_page, result.current_rows)

    def generate() -> Iterator[bytes]:
        nonlocal first_page
        buf = io.StringIO()
        writer = csv.writer(buf, lineterminator="\n")
        writer.writerow(columns)
        row_count = 0
        try:
            page = first_page
            first_page = []
            while True:
                for cells in page:
                    writer.writerow(cells)
                    row_count += 1
                    if row_count % FLUSH_EVERY_ROWS == 0:
                        yield buf.getvalue().encode("utf-8")
                        buf.seek(0)
                        buf.truncate(0)
                if not result.has_more_pages:
                    break
                # The sync response iterator runs in Starlette's thread pool.
                # Discard the previous page before fetching/masking the next.
                del page
                result.fetch_next_page()
                page = prepare_page(result.current_rows)
            yield buf.getvalue().encode("utf-8")
        except Exception as exc:
            # Headers are already sent, so the only signal left is to abort the
            # connection — the browser then marks the download as failed.
            log_query_error(logger, protected_query, query, exc)
            raise
        log_query_done(logger, protected_query, row_count, False)

    return generate()
