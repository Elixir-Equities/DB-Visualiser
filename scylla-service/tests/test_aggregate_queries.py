"""Aggregate regressions using the real Cassandra row factory, without a DB."""
from __future__ import annotations

import asyncio
import time
import unittest
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

from cassandra import InvalidRequest, OperationTimedOut, ReadTimeout
from cassandra.cluster import ResultSet
from cassandra.query import named_tuple_factory
from cassandra.util import Date
from fastapi import HTTPException

from app.api.v1.endpoints.query import execute_query
from app.masking.masker import MASKED_JSON, MASKED_NUMBER, MASKED_TEXT
from app.masking.query_analyzer import ProtectedQueryError, analyze_protected_query
from app.schemas.query import QueryRequest
from app.services import query_service


class DriverResponse:
    """Match ResponseFuture's raw-row callbacks and real ResultSet metadata."""
    def __init__(self, columns, values, paging_state=None, error=None, delay=0):
        self._col_names = columns
        self._col_types = []
        self._paging_state = paging_state
        self.rows = named_tuple_factory(columns, values)
        self.error = error
        self.delay = delay
        self.clear_callbacks = Mock()

    def add_callbacks(self, callback, errback):
        handler, value = (errback, self.error) if self.error else (callback, self.rows)
        asyncio.get_running_loop().call_later(self.delay, handler, value)

    def result(self):
        return ResultSet(self, self.rows)


class AggregateQueryTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        settings = SimpleNamespace(
            pfr_masked_keyspaces=frozenset({"pfr_aa_integration"}),
            ch_masked_keyspace="paisasmart",
            ch_masked_table="chat_history_v3",
        )
        patcher = patch("app.masking.registry.get_settings", return_value=settings)
        patcher.start()
        self.addCleanup(patcher.stop)

    async def execute(self, query, columns, values, paging_state=None, token=None):
        result = SimpleNamespace(
            column_names=columns,
            current_rows=named_tuple_factory(columns, values),
            paging_state=paging_state,
        )
        session = Mock(execute=Mock(return_value=result))
        session.execute_async.return_value = DriverResponse(columns, values, paging_state)
        with patch.object(query_service, "get_session", return_value=session):
            envelope = await execute_query(
                QueryRequest(query=query, page_size=50, paging_state=token)
            )
        self.assertTrue(envelope.success)
        call = session.execute_async.call_args or session.execute.call_args
        if session.execute_async.called:
            self.assertEqual(call.args[0].query_string, query.rstrip(';') + ' USING TIMEOUT 60s;')
            self.assertIsNone(call.kwargs['timeout'])
        else:
            self.assertEqual(call.args[0].query_string, query)
        return envelope.data

    async def test_row_counts_work_on_all_sources_with_and_without_aliases(self):
        for table in (
            "pfr_aa_integration.account",
            "paisasmart.chat_history_v3",
            "other_keyspace.events",
        ):
            for expression, label in (
                ("COUNT(*)", "count"),
                ("count(*)", "system.count(*)"),
                ("COUNT(1)", "system.count(1)"),
                ("count(*) AS total", "total"),
                ('count(*) AS "Total rows"', "Total rows"),
                ("system.count(*) AS total", "total"),
            ):
                with self.subTest(table=table, expression=expression):
                    response = await self.execute(
                        f"SELECT {expression} FROM {table};", [label], [(42,)]
                    )
                    self.assertEqual(response.columns, [label])
                    self.assertEqual(response.rows, [{label: 42}])
                    self.assertEqual(response.row_count, 1)
                    self.assertIsNone(response.paging_state)

    async def test_all_column_aggregates_preserve_database_labels_and_values(self):
        for table, field in (
            ("pfr_aa_integration.account", "total_fetches_available"),
            ("paisasmart.chat_history_v3", "message_id"),
            ("other_keyspace.events", "amount"),
        ):
            for function in ("count", "sum", "avg", "min", "max"):
                with self.subTest(table=table, function=function):
                    label = f"system.{function}({field})"
                    response = await self.execute(
                        f"SELECT {function}({field}) FROM {table};",
                        [label], [(Decimal("12.5"),)],
                    )
                    self.assertEqual(response.rows, [{label: Decimal("12.5")}])
                    self.assertIn('12.5', response.model_dump_json())

    async def test_multiple_aggregates_aliases_and_mixed_masked_fields(self):
        columns = ["system.count(*)", "total", "current_value", "account_holders"]
        response = await self.execute(
            "SELECT count(*), sum(total_fetches_available) AS total, "
            "current_value, account_holders FROM pfr_aa_integration.account;",
            columns, [(42, 123, 999, '{"name":"secret"}')],
        )
        self.assertEqual(response.columns, columns)
        self.assertEqual(response.rows, [{
            "system.count(*)": 42,
            "total": 123,
            "current_value": MASKED_NUMBER,
            "account_holders": MASKED_JSON,
        }])
        self.assertNotIn("secret", response.model_dump_json())

    async def test_chat_history_aggregate_does_not_unmask_message_columns(self):
        response = await self.execute(
            'SELECT count(*) AS "Total count", message_text, translated_message_text '
            'FROM paisasmart.chat_history_v3;',
            ["Total count", "message_text", "translated_message_text"],
            [(42, "secret", "translated secret")],
        )
        self.assertEqual(response.rows, [{
            "Total count": 42,
            "message_text": MASKED_TEXT,
            "translated_message_text": MASKED_TEXT,
        }])

    async def test_aggregate_alias_visibility_follows_expression(self):
        response = await self.execute(
            "SELECT count(*) AS current_value FROM pfr_aa_integration.account;",
            ["current_value"], [(42,)],
        )
        self.assertEqual(response.rows, [{"current_value": 42}])

    async def test_grouped_aggregates_keep_paging_and_empty_results(self):
        query = (
            "SELECT investor_profile_id, count(*) AS total "
            "FROM pfr_aa_integration.account "
            "GROUP BY investor_profile_id LIMIT 50;"
        )
        columns = ["investor_profile_id", "total"]
        first = await self.execute(query, columns, [("id", 42)], b"next-page")
        self.assertIsNotNone(first.paging_state)
        second = await self.execute(query, columns, [], token=first.paging_state)
        self.assertEqual(second.columns, columns)
        self.assertEqual(second.rows, [])
        self.assertEqual(second.row_count, 0)

    async def test_zero_and_null_aggregate_results_are_preserved(self):
        response = await self.execute(
            "SELECT count(*) AS total, min(total_fetches_available) AS smallest "
            "FROM pfr_aa_integration.account;",
            ["total", "smallest"], [(0, None)],
        )
        self.assertEqual(response.rows, [{"total": 0, "smallest": None}])

    async def test_plain_queries_preserve_original_column_names_and_masking(self):
        response = await self.execute(
            'SELECT * FROM paisasmart.chat_history_v3;',
            ["message_text", "translated_message_text", "created_at", "column name"],
            [("secret", "secret", Date(0), "visible")],
        )
        self.assertEqual(response.rows, [{
            "message_text": MASKED_TEXT,
            "translated_message_text": MASKED_TEXT,
            "created_at": "1970-01-01",
            "column name": "visible",
        }])

    async def test_protected_aggregate_bypasses_are_rejected_before_database_access(self):
        queries = []
        for function in ("count", "sum", "avg", "min", "max"):
            for argument in ("current_value", '"current_value"', "new_private_column"):
                queries.append(
                    f"SELECT {function}({argument}) AS investor_profile_id "
                    "FROM pfr_aa_integration.account;"
                )
            queries.append(
                f"SELECT {function}(message_text) AS message_id "
                "FROM paisasmart.chat_history_v3;"
            )
        queries.extend([
            "SELECT current_value AS total, count(*) FROM pfr_aa_integration.account;",
            "SELECT count(cast(current_value AS text)) FROM pfr_aa_integration.account;",
            "SELECT count(*) + current_value FROM pfr_aa_integration.account;",
            "SELECT other.count(*) FROM pfr_aa_integration.account;",
            'SELECT "COUNT"(*) FROM pfr_aa_integration.account;',
            'SELECT count("*") FROM pfr_aa_integration.account;',
            "SELECT sum(*) FROM pfr_aa_integration.account;",
            "SELECT count(DISTINCT investor_profile_id) FROM pfr_aa_integration.account;",
            "SELECT count(*) FROM pfr_aa_integration.account WHERE current_value > 0;",
            "SELECT count(*) FROM pfr_aa_integration.account GROUP BY current_value;",
            "SELECT count(*) FROM pfr_aa_integration.account ORDER BY current_value;",
            "SELECT count(*) FROM pfr_aa_integration.account; SELECT current_value "
            "FROM pfr_aa_integration.account;",
        ])
        for query in queries:
            with self.subTest(query=query):
                with patch.object(query_service, "get_session") as get_session:
                    with self.assertRaises(HTTPException) as raised:
                        await query_service.run_query(query, 50, None)
                    self.assertEqual(raised.exception.status_code, 400)
                    get_session.assert_not_called()

    async def test_duplicate_labels_cannot_overwrite_sensitive_result(self):
        with self.assertRaises(HTTPException) as raised:
            await self.execute(
                "SELECT count(*) AS current_value, current_value "
                "FROM pfr_aa_integration.account;",
                ["current_value", "current_value"], [(42, 999)],
            )
        self.assertEqual(raised.exception.status_code, 400)
        self.assertIn("unique aliases", raised.exception.detail)

    async def test_unexpected_result_shape_fails_closed(self):
        with self.assertRaises(HTTPException) as raised:
            await self.execute(
                "SELECT count(*) FROM pfr_aa_integration.account;",
                ["count", "current_value"], [(42, 999)],
            )
        self.assertEqual(raised.exception.status_code, 500)
        self.assertEqual(raised.exception.detail, "Unable to safely mask query results")

    def test_native_aggregate_namespace_case_and_visible_filters(self):
        context = analyze_protected_query(
            'SELECT SYSTEM.SUM(total_fetches_available) AS "Total" '
            "FROM pfr_aa_integration.account "
            "WHERE investor_profile_id = 'id' LIMIT 50 ALLOW FILTERING;"
        )
        self.assertIsNotNone(context)
        self.assertTrue(context.result_policy(["Total"]).is_visible("Total"))

    def test_unknown_tables_and_arbitrary_functions_remain_blocked(self):
        for query in (
            "SELECT count(*) FROM pfr_aa_integration.unknown_table;",
            "SELECT custom_aggregate(investor_profile_id) FROM pfr_aa_integration.account;",
            "SELECT count(*) FROM pfr_aa_integration.account GROUP BY token(investor_profile_id);",
        ):
            with self.subTest(query=query):
                with self.assertRaises(ProtectedQueryError):
                    analyze_protected_query(query)

    async def test_slow_count_outlives_normal_query_deadline(self):
        session = Mock()
        session.execute_async.return_value = DriverResponse(["count"], [(42,)], delay=0.05)
        with patch.object(query_service, "get_session", return_value=session):
            with patch.object(query_service, "QUERY_TIMEOUT", 0.01):
                response = await query_service.run_query(
                    "SELECT count(*) FROM pfr_aa_integration.account;", 50, None,
                )
        self.assertEqual(response.rows, [{"count": 42}])
        session.execute.assert_not_called()
        self.assertIsNone(session.execute_async.call_args.kwargs["timeout"])

    async def test_non_aggregate_queries_keep_normal_deadline(self):
        def slow_read(*args, **kwargs):
            time.sleep(0.05)
        session = Mock(execute=Mock(side_effect=slow_read))
        with patch.object(query_service, "get_session", return_value=session):
            with patch.object(query_service, "QUERY_TIMEOUT", 0.01):
                with self.assertRaises(HTTPException) as raised:
                    await query_service.run_query("SELECT * FROM other.events;", 50, None)
        self.assertEqual(raised.exception.status_code, 504)
        session.execute_async.assert_not_called()

    async def test_count_retries_timeouts_with_increasing_allowances_until_success(self):
        session = Mock()
        errors = [ReadTimeout("slow")] * 4 + [OperationTimedOut("slow")]
        session.execute_async.side_effect = [
            DriverResponse(["count"], [], error=error) for error in errors
        ] + [DriverResponse(["count"], [(42,)])]
        with patch.object(query_service, "get_session", return_value=session):
            with patch("app.services.aggregate_execution.asyncio.sleep", new_callable=AsyncMock):
                response = await query_service.run_query(
                    "SELECT count(*) FROM pfr_aa_integration.account;", 50, None,
                )
        self.assertEqual(response.rows, [{"count": 42}])
        self.assertEqual(session.execute_async.call_count, 6)
        for call, seconds in zip(session.execute_async.call_args_list, [60, 120, 240, 480, 960, 1920]):
            self.assertIn(f"USING TIMEOUT {seconds}s;", call.args[0].query_string)
            self.assertIsNone(call.kwargs["timeout"])

    async def test_non_timeout_database_errors_are_reported_without_retrying(self):
        session = Mock()
        session.execute_async.return_value = DriverResponse(
            [], [], error=InvalidRequest("bad query"),
        )
        with patch.object(query_service, "get_session", return_value=session):
            with self.assertRaises(HTTPException) as raised:
                await query_service.run_query("SELECT count(*) FROM other.events;", 50, None)
        self.assertEqual(raised.exception.status_code, 500)
        self.assertEqual(session.execute_async.call_count, 1)

    async def test_disconnected_count_detaches_callbacks_and_stops_retrying(self):
        session = Mock()
        response = DriverResponse(["count"], [(42,)], delay=60)
        session.execute_async.return_value = response
        with patch.object(query_service, "get_session", return_value=session):
            task = asyncio.create_task(query_service.run_query("SELECT count(*) FROM other.events;", 50, None))
            await asyncio.sleep(0)
            task.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await task
        response.clear_callbacks.assert_called_once()
        self.assertEqual(session.execute_async.call_count, 1)


if __name__ == "__main__":
    unittest.main()
