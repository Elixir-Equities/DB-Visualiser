"""
Allow only a single SELECT statement through the MCP query tool.

The REST /query endpoint relies on query_validator, which blocks DROP,
DELETE, TRUNCATE and ALTER but still lets INSERT, UPDATE, CREATE, BATCH and
GRANT through. An AI client should only ever read, so the MCP tool is
stricter: one statement, starting with SELECT, with no comments that could
hide anything. CQL has no subqueries or SELECT ... INTO, so a lone SELECT
cannot write.
"""
from __future__ import annotations

import re

from fastmcp.exceptions import ToolError

_COMMENT = re.compile(r"--|//|/\*")
_STARTS_WITH_SELECT = re.compile(r"^SELECT\b", re.IGNORECASE)


def ensure_single_select(query: str) -> str:
    """Return the query without a trailing semicolon, or raise ToolError."""
    statement = query.strip().rstrip(";").strip()

    if not statement:
        raise ToolError("query must not be empty")
    if _COMMENT.search(statement):
        raise ToolError("Comments are not allowed in queries run through MCP.")
    # Rejects a ';' inside a string literal too; rare, and erring on the safe side.
    if ";" in statement:
        raise ToolError("Only one statement can be run at a time.")
    if not _STARTS_WITH_SELECT.match(statement):
        raise ToolError("Only SELECT queries can be run through MCP.")

    return statement
