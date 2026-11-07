"""
MCP tool for running read-only CQL queries.
"""
from __future__ import annotations

from typing import Annotated, Any, Optional

from fastmcp import FastMCP
from pydantic import Field

from app.api.v1.endpoints import query
from app.mcp_server.errors import run_endpoint
from app.mcp_server.schema_tools import READ_ONLY
from app.mcp_server.select_guard import ensure_single_select
from app.schemas.query import PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX, QueryRequest

query_tools = FastMCP("query-tools", mask_error_details=True)


@query_tools.tool(annotations=READ_ONLY)
async def run_select_query(
    cql: Annotated[
        str,
        Field(
            min_length=1,
            description="One CQL SELECT statement, with keyspace-qualified table names, "
            "e.g. SELECT * FROM my_keyspace.my_table WHERE id = 1",
        ),
    ],
    page_size: Annotated[int, Field(ge=1, le=PAGE_SIZE_MAX, description="Rows per page.")] = PAGE_SIZE_DEFAULT,
    paging_state: Annotated[
        Optional[str],
        Field(description="The paging_state from the previous page's result, to get the next page."),
    ] = None,
) -> Any:
    """
    Run one read-only CQL SELECT query against ScyllaDB.

    Only a single SELECT is accepted. Sensitive columns come back masked, as
    they do in the Visualiser. When paging_state in the result is not null,
    call again with it to get the next page.
    """
    payload = QueryRequest(query=ensure_single_select(cql), page_size=page_size, paging_state=paging_state)
    return await run_endpoint(query.execute_query(payload))
