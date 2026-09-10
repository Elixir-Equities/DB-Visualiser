"""Logging helpers that keep protected PFR query text and values out of logs."""

from __future__ import annotations

import logging
from typing import Optional

from app.masking.query_analyzer import ProtectedQuery


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
            "scylladb_timeout | error_type=%s keyspace=%s table=%s fingerprint=%s",
            type(error).__name__,
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
            "query_error | error_type=%s keyspace=%s table=%s fingerprint=%s",
            type(error).__name__,
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
