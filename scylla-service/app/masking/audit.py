"""Logging helpers that keep protected query text and values out of logs."""

from __future__ import annotations

import logging
import re
from typing import Optional

from cassandra import DriverException
from cassandra.protocol import ErrorMessage

from app.masking.query_analyzer import ProtectedQuery


_ERROR_LITERALS = re.compile(
    r"\$\$.*?(?:\$\$|$)|'(?:''|[^'])*(?:'|$)|\"(?:\"\"|[^\"])*(?:\"|$)"
    r"|\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b"
    r"|\b0x[0-9a-f]+\b|(?<![\w])[-+]?\d+(?:\.\d+)?(?:e[-+]?\d+)?(?![\w])",
    re.IGNORECASE | re.DOTALL,
)


def _database_error_message(error: Exception, query: str) -> str:
    """Expose driver diagnostics, removing echoed queries and CQL literals."""
    if not isinstance(error, (DriverException, ErrorMessage)):
        # Arbitrary application exceptions may contain row values.
        return "<unavailable>"

    message = error.message if isinstance(error, ErrorMessage) else str(error)
    # Driver exceptions wrap the server message in double quotes. Remove that
    # wrapper before redaction so the whole diagnostic is not treated as a value.
    server_message = re.fullmatch(
        r'Error from server: code=[0-9a-fA-F]+ \[[^\]]*\] message="(.*)"',
        message,
        re.DOTALL,
    )
    if server_message:
        message = server_message.group(1)
    message = re.sub(re.escape(query), "<query redacted>", message, flags=re.IGNORECASE)
    message = _ERROR_LITERALS.sub("<redacted>", message)
    return " ".join(message.split())[:2000]


def log_query_execute(
    logger: logging.Logger,
    protected: Optional[ProtectedQuery],
    query: str,
    page_size: int,
    continued: bool,
) -> None:
    paging = "continued" if continued else "first_page"
    if protected:
        logger.info(
            "query_execute | page_size=%d paging=%s keyspace=%s table=%s fingerprint=%s",
            page_size,
            paging,
            protected.keyspace,
            protected.table,
            protected.fingerprint,
        )
    else:
        logger.info(
            "query_execute | page_size=%d paging=%s query=%r",
            page_size,
            paging,
            query,
        )


def log_query_timeout(
    logger: logging.Logger,
    protected: Optional[ProtectedQuery],
    query: str,
    timeout: float,
) -> None:
    if protected:
        logger.warning(
            "query_timeout | after=%.1fs keyspace=%s table=%s fingerprint=%s",
            timeout,
            protected.keyspace,
            protected.table,
            protected.fingerprint,
        )
    else:
        logger.warning("query_timeout | after=%.1fs query=%r", timeout, query)


def log_scylla_timeout(
    logger: logging.Logger,
    protected: Optional[ProtectedQuery],
    query: str,
    error: Exception,
) -> None:
    if protected:
        logger.warning(
            "scylladb_timeout | error_type=%s error_message=%s keyspace=%s table=%s fingerprint=%s",
            type(error).__name__,
            _database_error_message(error, query),
            protected.keyspace,
            protected.table,
            protected.fingerprint,
        )
    else:
        logger.warning("scylladb_timeout | error=%s query=%r", error, query)


def log_query_error(
    logger: logging.Logger,
    protected: Optional[ProtectedQuery],
    query: str,
    error: Exception,
) -> None:
    if protected:
        logger.error(
            "query_error | error_type=%s error_message=%s keyspace=%s table=%s fingerprint=%s",
            type(error).__name__,
            _database_error_message(error, query),
            protected.keyspace,
            protected.table,
            protected.fingerprint,
        )
    else:
        logger.error("query_error | error=%s query=%r", error, query)


def log_masking_error(
    logger: logging.Logger,
    protected: ProtectedQuery,
    error: Exception,
) -> None:
    logger.error(
        "query_masking_error | error_type=%s keyspace=%s table=%s fingerprint=%s",
        type(error).__name__,
        protected.keyspace,
        protected.table,
        protected.fingerprint,
    )


def log_query_done(
    logger: logging.Logger,
    protected: Optional[ProtectedQuery],
    row_count: int,
    has_next_page: bool,
) -> None:
    if protected:
        logger.info(
            "query_done | rows=%d has_next_page=%s keyspace=%s table=%s fingerprint=%s",
            row_count,
            has_next_page,
            protected.keyspace,
            protected.table,
            protected.fingerprint,
        )
    else:
        logger.info(
            "query_done | rows=%d has_next_page=%s",
            row_count,
            has_next_page,
        )
