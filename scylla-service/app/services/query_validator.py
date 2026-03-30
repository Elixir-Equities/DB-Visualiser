"""
Utility functions for validating and sanitising CQL queries before execution.
"""
from __future__ import annotations

import re

from fastapi import HTTPException

# Statements that are blocked entirely for safety
_BLOCKED_PATTERN = re.compile(
    r"\b(DROP|DELETE|TRUNCATE|ALTER)\b",
    re.IGNORECASE,
)

# Detects an existing LIMIT clause
_LIMIT_PATTERN = re.compile(r"\bLIMIT\s+\d+\b", re.IGNORECASE)

DEFAULT_LIMIT = 100


def validate_and_prepare(query: str) -> str:
    """
    Validate that the query is safe to run and ensure a LIMIT is present.

    Raises HTTPException 400 for dangerous queries.
    Returns the (possibly modified) query string.
    """
    match = _BLOCKED_PATTERN.search(query)
    if match:
        raise HTTPException(
            status_code=400,
            detail=f"Query contains a disallowed statement: {match.group().upper()}",
        )

    if not _LIMIT_PATTERN.search(query):
        # Strip trailing semicolon before appending LIMIT
        query = query.rstrip().rstrip(";")
        query = f"{query} LIMIT {DEFAULT_LIMIT}"

    return query
