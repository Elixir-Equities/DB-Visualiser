"""
Thin async wrapper around the synchronous cassandra-driver.

cassandra-driver does not support asyncio natively, so we offload every
blocking call to FastAPI's default thread-pool executor via
`asyncio.get_event_loop().run_in_executor(None, ...)`.

This keeps route handlers non-blocking without spawning extra threads
ourselves — FastAPI/Starlette already manages the pool size.
"""
from __future__ import annotations

import asyncio
from typing import Any, Callable, List

from cassandra.cluster import ResultSet

from app.db.session import get_session


def _run_sync(fn: Callable[[], Any]) -> Any:
    loop = asyncio.get_event_loop()
    return loop.run_in_executor(None, fn)


async def execute(query: str, parameters: tuple = ()) -> ResultSet:
    session = get_session()
    return await _run_sync(lambda: session.execute(query, parameters))


async def execute_dict(query: str, parameters: tuple = ()) -> List[dict]:
    """Execute and return rows as plain dicts (column_name → value)."""
    result: ResultSet = await execute(query, parameters)
    return [dict(row._asdict()) for row in result]
