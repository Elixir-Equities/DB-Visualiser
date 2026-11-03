"""Run aggregate queries to completion, retrying request timeouts indefinitely."""
from __future__ import annotations

import asyncio
from typing import Callable

from cassandra import OperationTimedOut, ReadTimeout
from cassandra.cluster import ResponseFuture, ResultSet, Session
from cassandra.query import SimpleStatement

from app.masking.query_analyzer import AggregateExecution

# Scylla's per-request timeout is a CQL duration backed by signed nanoseconds.
# Each timed-out attempt gets a larger allowance; the overall operation has
# no deadline or retry count limit. This cap is only the wire type's range.
INITIAL_REQUEST_SECONDS = 60
MAX_REQUEST_SECONDS = (2**63 - 1) // 1_000_000_000


async def _await_response(response: ResponseFuture) -> ResultSet:
    # Each attempt owns its future so late driver callbacks from an earlier
    # attempt cannot resolve a later attempt's result.
    loop = asyncio.get_running_loop()
    result = loop.create_future()

    def deliver(value, error=False):
        if result.done():
            return

        def settle():
            if not result.done():
                if error:
                    result.set_exception(value)
                else:
                    result.set_result(None)
        try:
            loop.call_soon_threadsafe(settle)
        except RuntimeError:
            if not loop.is_closed():
                raise

    response.add_callbacks(deliver, lambda error: deliver(error, True))
    try:
        await result
        # The callback receives raw rows; result() wraps them in the driver's
        # ResultSet with column metadata and paging state. It cannot block here
        # because the callback has already fired.
        return response.result()
    finally:
        # Cassandra protocol v4 cannot cancel an in-flight server read.
        # Detach on disconnect and stop all subsequent application retries.
        response.clear_callbacks()


async def execute_aggregate(
    session: Session,
    aggregate: AggregateExecution,
    page_size: int,
    paging_state: bytes | None,
    on_timeout: Callable[[Exception], None],
) -> ResultSet:
    seconds = INITIAL_REQUEST_SECONDS
    while True:
        statement = SimpleStatement(aggregate.with_timeout(seconds), fetch_size=page_size)
        try:
            # None disables the driver's independent 10-second deadline for
            # this request only. Async callbacks avoid tying up a worker thread.
            response = session.execute_async(statement, paging_state=paging_state, timeout=None)
            return await _await_response(response)
        except (OperationTimedOut, ReadTimeout) as exc:
            on_timeout(exc)
            # No partial count is ever returned or added to a later attempt.
            seconds = min(seconds * 2, MAX_REQUEST_SECONDS)
            await asyncio.sleep(1)
