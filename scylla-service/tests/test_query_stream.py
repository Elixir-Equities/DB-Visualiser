from __future__ import annotations

import asyncio
import json
import unittest
from unittest.mock import AsyncMock, patch

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from starlette.requests import Request

from app.api.v1.endpoints import query
from app.api.v1.router import router
from app.core.responses import ok
from app.masking.query_analyzer import (
    ProtectedQueryError,
    analyze_aggregate_execution,
)
from app.schemas.query import QueryRequest, QueryResponse


def request(accept="text/event-stream"):
    return Request({"type": "http", "headers": [(b"accept", accept.encode())]})


def result():
    return ok(QueryResponse(columns=["count"], rows=[{"count": 42}], row_count=1))


class QueryStreamTests(unittest.IsolatedAsyncioTestCase):
    async def test_stream_starts_and_heartbeats_while_count_is_pending(self):
        released = asyncio.Event()

        async def slow_query(payload):
            await released.wait()
            return result()

        with patch.object(query, "execute_query", side_effect=slow_query):
            with patch.object(query, "HEARTBEAT_SECONDS", 0.001):
                response = await query.execute_query_http(QueryRequest(query="SELECT count(*) FROM ks.t"), request())
                self.assertEqual(response.headers["x-accel-buffering"], "no")
                stream = response.body_iterator
                self.assertEqual(await anext(stream), ": query started\n\n")
                self.assertEqual(await anext(stream), ": keepalive\n\n")
                released.set()
                final = await anext(stream)
                self.assertTrue(final.startswith("event: result\ndata: "))
                envelope = json.loads(final.split("data: ", 1)[1])
                self.assertEqual(envelope["data"]["rows"], [{"count": 42}])
                await stream.aclose()

    async def test_disconnect_cancels_query_task(self):
        cancelled = asyncio.Event()

        async def pending(payload):
            try:
                await asyncio.Event().wait()
            finally:
                cancelled.set()

        with patch.object(query, "execute_query", side_effect=pending):
            with patch.object(query, "HEARTBEAT_SECONDS", 0.001):
                response = await query.execute_query_http(QueryRequest(query="SELECT count(*) FROM ks.t"), request())
                stream = response.body_iterator
                await anext(stream)
                await anext(stream)
                await stream.aclose()
        self.assertTrue(cancelled.is_set())

    async def test_stream_reports_validation_errors_in_terminal_envelope(self):
        with patch.object(query, "execute_query", side_effect=HTTPException(400, "Unsafe projection")):
            response = await query.execute_query_http(QueryRequest(query="SELECT count(*) FROM ks.t"), request())
            frames = [frame async for frame in response.body_iterator]
        envelope = json.loads(frames[-1].split("data: ", 1)[1])
        self.assertFalse(envelope["success"])
        self.assertEqual(envelope["error"], {"message": "Unsafe projection", "code": "HTTP_400"})

    async def test_unexpected_errors_do_not_leak_details_in_stream(self):
        with patch.object(query, "execute_query", side_effect=ValueError("private customer data")):
            response = await query.execute_query_http(QueryRequest(query="SELECT count(*) FROM ks.t"), request())
            frames = [frame async for frame in response.body_iterator]
        self.assertNotIn("private customer data", "".join(frames))
        self.assertIn("INTERNAL_ERROR", frames[-1])

    async def test_json_clients_keep_existing_response_shape(self):
        envelope = result()
        with patch.object(query, "execute_query", new_callable=AsyncMock, return_value=envelope):
            response = await query.execute_query_http(QueryRequest(query="SELECT count(*) FROM ks.t"), request("application/json"))
        self.assertIs(response, envelope)

    def test_http_stream_requires_api_key_and_serializes_terminal_result(self):
        app = FastAPI()
        app.include_router(router)
        from types import SimpleNamespace
        settings = SimpleNamespace(INTERNAL_API_TOKEN="test-key")
        with patch("app.core.security.get_settings", return_value=settings):
            with patch.object(query, "execute_query", new_callable=AsyncMock, return_value=result()) as execute:
                with TestClient(app) as client:
                    denied = client.post("/api/v1/query", json={"query": "SELECT count(*) FROM ks.t"}, headers={"Accept": "text/event-stream"})
                    self.assertEqual(denied.status_code, 401)
                    execute.assert_not_called()
                    allowed = client.post("/api/v1/query", json={"query": "SELECT count(*) FROM ks.t"}, headers={"Accept": "text/event-stream", "X-API-Key": "test-key"})
                    self.assertEqual(allowed.status_code, 200)
                    self.assertIn("text/event-stream", allowed.headers["content-type"])
                    envelope = json.loads(allowed.text.split("data: ", 1)[1])
                    self.assertEqual(envelope["data"]["rows"], [{"count": 42}])


class AggregateTimeoutQueryTests(unittest.TestCase):
    def test_timeout_insertion_preserves_literals_quoted_identifiers_and_comments(self):
        examples = [
            (
                "SELECT COUNT(*) FROM ks.t; -- trailing comment",
                "SELECT COUNT(*) FROM ks.t USING TIMEOUT 120s; -- trailing comment",
            ),
            (
                'SELECT system.count(*) AS "Total; rows" FROM "ks"."t" WHERE id = \'https://a;b\' /* comment */;',
                'SELECT system.count(*) AS "Total; rows" FROM "ks"."t" WHERE id = \'https://a;b\' USING TIMEOUT 120s /* comment */;',
            ),
            (
                "SELECT count(*) FROM ks.t WHERE id = 'it''s ok' -- comment",
                "SELECT count(*) FROM ks.t WHERE id = 'it''s ok' USING TIMEOUT 120s -- comment",
            ),
        ]
        for original, expected in examples:
            with self.subTest(query=original):
                self.assertEqual(analyze_aggregate_execution(original).with_timeout(120), expected)

    def test_existing_request_timeout_is_replaced_for_retries(self):
        context = analyze_aggregate_execution("SELECT count(*) FROM ks.t USING TIMEOUT 5 ms;")
        rewritten = context.with_timeout(120)
        self.assertEqual(rewritten.count("USING TIMEOUT"), 1)
        self.assertIn("USING TIMEOUT 120s;", rewritten)

    def test_only_select_aggregate_expressions_get_unlimited_execution(self):
        for query_text in (
            "SELECT * FROM ks.t WHERE text = 'count(*)';",
            "SELECT $$count(*)$$ FROM ks.t;",
            'SELECT "count(*)" FROM ks.t;',
            "SELECT * FROM ks.t; -- count(*)",
            "SELECT custom.count(*) FROM ks.t;",
            "UPDATE ks.t SET count = 1;",
        ):
            with self.subTest(query=query_text):
                self.assertIsNone(analyze_aggregate_execution(query_text))

    def test_multiple_statements_and_malformed_timeout_are_rejected(self):
        for query_text in (
            "SELECT count(*) FROM ks.t; UPDATE ks.t SET value = 1;",
            "SELECT count(*) FROM ks.t USING TIMEOUT 1 s AND something;",
        ):
            with self.subTest(query=query_text):
                with self.assertRaises(ProtectedQueryError):
                    analyze_aggregate_execution(query_text)
