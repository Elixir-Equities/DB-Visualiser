"""
MCP tools for browsing keyspaces, tables and table schemas.
"""
from __future__ import annotations

from typing import Annotated, Any

from fastmcp import FastMCP
from pydantic import Field

from app.api.v1.endpoints import keyspaces, tables
from app.mcp_server.errors import run_endpoint

# Hide unexpected errors (connection details, stack traces) behind a generic
# message, as the REST API's unhandled-exception handler does.
schema_tools = FastMCP("schema-tools", mask_error_details=True)

READ_ONLY = {"readOnlyHint": True, "openWorldHint": False}

Keyspace = Annotated[str, Field(min_length=1, description="Keyspace name, as returned by list_keyspaces.")]


@schema_tools.tool(annotations=READ_ONLY)
async def list_keyspaces() -> Any:
    """List the ScyllaDB keyspaces."""
    return await run_endpoint(keyspaces.list_keyspaces())


@schema_tools.tool(annotations=READ_ONLY)
async def list_tables(keyspace: Keyspace) -> Any:
    """List the tables in a keyspace."""
    return await run_endpoint(tables.list_tables(keyspace=keyspace))


@schema_tools.tool(annotations=READ_ONLY)
async def get_table_schema(
    keyspace: Keyspace,
    table: Annotated[str, Field(min_length=1, description="Table name, as returned by list_tables.")],
) -> Any:
    """Get a table's columns, types, and partition and clustering keys."""
    return await run_endpoint(tables.get_schema(keyspace=keyspace, table=table))
