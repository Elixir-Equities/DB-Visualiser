"""
Allow only a single SELECT statement through the MCP query tool.

The REST /query endpoint relies on query_validator, which blocks DROP,
DELETE, TRUNCATE and ALTER but still lets INSERT, UPDATE, CREATE, BATCH and
GRANT through. An AI client should only ever read, so the MCP tool is
stricter: one statement, starting with SELECT, with no comments that could
hide anything. CQL has no subqueries or SELECT ... INTO, so a lone SELECT
cannot write.

The comment and ';' checks only look at CQL code, not at quoted values, so
WHERE url = 'https://example.com' or note = 'a;b' are still allowed.
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

    code = _without_literals(statement)
    if _COMMENT.search(code):
        raise ToolError("Comments are not allowed in queries run through MCP.")
    if ";" in code:
        raise ToolError("Only one statement can be run at a time.")
    if not _STARTS_WITH_SELECT.match(code):
        raise ToolError("Only SELECT queries can be run through MCP.")

    return statement


def _without_literals(statement: str) -> str:
    """
    Return the statement with the contents of every quoted literal removed.

    Covers CQL's 'strings' and "identifiers", where a doubled quote is an
    escaped one, and $$dollar-quoted strings$$. An unterminated quote is
    rejected: everything after it would be unchecked.
    """
    code = []
    i = 0
    while i < len(statement):
        if statement.startswith("$$", i):
            end = statement.find("$$", i + 2)
            if end == -1:
                raise ToolError("The query has an unterminated $$ string.")
            code.append("$$$$")
            i = end + 2
        elif statement[i] in ("'", '"'):
            quote = statement[i]
            end = i + 1
            while True:
                end = statement.find(quote, end)
                if end == -1:
                    raise ToolError("The query has an unterminated quoted value.")
                if statement.startswith(quote * 2, end):
                    end += 2  # '' or "" is an escaped quote, still inside
                    continue
                break
            code.append(quote * 2)
            i = end + 1
        else:
            code.append(statement[i])
            i += 1
    return "".join(code)
