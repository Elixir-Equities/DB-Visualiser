"""
Server-side CSV export.

The first page is fetched up front so that validation, syntax and timeout
errors still come back as a normal JSON error response. After that the rows
are streamed to the client page by page — the driver fetches the next page as
the ResultSet is iterated, so memory use stays at roughly one page no matter
how large the table is.
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
    logger.info("export_start | fetch_size=%d query=%r", EXPORT_FETCH_SIZE, query)

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
        logger.warning("export_timeout | after=%.1fs query=%r", QUERY_TIMEOUT, query)
        raise HTTPException(
            status_code=504,
            detail=f"Query timed out after {QUERY_TIMEOUT}s",
        )
    except (OperationTimedOut, ReadTimeout) as exc:
        logger.warning("scylladb_timeout | error=%s query=%r", exc, query)
        raise HTTPException(status_code=504, detail="ScyllaDB operation timed out")
    except Exception as exc:
        logger.error("export_error | error=%s query=%r", exc, query)
        raise HTTPException(status_code=500, detail=f"Query execution error: {exc}")

    columns: List[str] = list(result.column_names or [])

    def generate() -> Iterator[bytes]:
        buf = io.StringIO()
        writer = csv.writer(buf, lineterminator="\n")
        writer.writerow(columns)
        row_count = 0
        try:
            # Iterating the ResultSet transparently fetches the following pages
            for row in result:
                writer.writerow([_to_cell(v) for v in row])
                row_count += 1
                if row_count % FLUSH_EVERY_ROWS == 0:
                    yield buf.getvalue().encode("utf-8")
                    buf.seek(0)
                    buf.truncate(0)
            yield buf.getvalue().encode("utf-8")
        except Exception as exc:
            # Headers are already sent, so the only signal left is to abort the
            # connection — the browser then marks the download as failed.
            logger.error("export_aborted | rows=%d error=%s query=%r", row_count, exc, query)
            raise
        logger.info("export_done | rows=%d query=%r", row_count, query)

    return generate()
