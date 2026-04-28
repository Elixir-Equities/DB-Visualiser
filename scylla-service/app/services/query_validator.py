"""
Utility functions for validating and sanitising CQL queries before execution.
"""
from __future__ import annotations

import re

from fastapi import HTTPException

_BLOCKED_PATTERN = re.compile(
    r"\b(DROP|DELETE|TRUNCATE|ALTER)\b",
    re.IGNORECASE,
)

def validate_and_prepare(query: str) -> str:
    """
    Validate that the query is safe to run.

    Raises HTTPException 400 for dangerous queries.
    Returns the (possibly modified) query string.
    """
    match = _BLOCKED_PATTERN.search(query)
    if match:
        raise HTTPException(
            status_code=400,
            detail=f"Query contains a disallowed statement: {match.group().upper()}",
        )

    return query
