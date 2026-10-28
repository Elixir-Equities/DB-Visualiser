"""
Protect the MCP endpoint with the same API key as the /api/v1 routes.
"""
from __future__ import annotations

from fastapi import HTTPException
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from app.core.responses import err
from app.core.security import require_api_key


class ApiKeyMiddleware:
    """
    Run `require_api_key` on every MCP request.

    The MCP app is Starlette, not FastAPI, so it cannot take the function as
    a route dependency. This reads the X-API-Key header and calls it directly
    instead, so MCP and REST callers pass the same check and get the same
    error body.
    """

    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = dict(scope["headers"])
        api_key = headers.get(b"x-api-key")
        try:
            require_api_key(x_api_key=api_key.decode() if api_key is not None else None)
        except HTTPException as exc:
            body = err(message=str(exc.detail), code=f"HTTP_{exc.status_code}").model_dump()
            await JSONResponse(body, status_code=exc.status_code)(scope, receive, send)
            return

        await self.app(scope, receive, send)
