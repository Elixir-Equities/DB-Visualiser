"""
Build the MCP server that exposes ScyllaDB browsing to AI clients.
"""
from __future__ import annotations

from fastmcp import FastMCP
from starlette.middleware import Middleware
from starlette.types import ASGIApp, Receive, Scope, Send

from app.mcp_server.auth import ApiKeyMiddleware
from app.mcp_server.query_tools import query_tools
from app.mcp_server.schema_tools import schema_tools

mcp = FastMCP(
    "paisasmart-scylla-visualizer",
    instructions=(
        "Read-only access to PaisaSmart's ScyllaDB. Use list_keyspaces, "
        "list_tables and get_table_schema to find the right table and its "
        "keys, then run_select_query with one SELECT statement. Sensitive "
        "columns come back masked. Prefer filtering on partition keys and "
        "keep page sizes small."
    ),
    mask_error_details=True,
)
mcp.mount(schema_tools)
mcp.mount(query_tools)

# Stateless so any pod behind the load balancer can answer any request,
# with no MCP session pinned to the pod that started it.
mcp_app = mcp.http_app(
    path="/mcp",
    stateless_http=True,
    middleware=[Middleware(ApiKeyMiddleware)],
)


class _AddTrailingSlash:
    """
    Hand /mcp to the MCP app as /mcp/.

    FastMCP 2.9 always serves its endpoint at "/mcp/" and redirects "/mcp"
    there, while main.py routes exactly "/mcp" to it, so the two redirect to
    each other forever. Rewriting the path answers /mcp directly, with no
    redirect for a client behind the gateway to follow.
    """

    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http" and not scope["path"].endswith("/"):
            path = scope["path"] + "/"
            scope = {**scope, "path": path, "raw_path": path.encode()}
        await self.app(scope, receive, send)


# What main.py routes /mcp to; mcp_app itself is still needed for its lifespan.
mcp_route = _AddTrailingSlash(mcp_app)
