"""
Turn endpoint results and errors into MCP tool results.
"""
from __future__ import annotations

from collections.abc import Awaitable
from typing import Any

from fastapi import HTTPException
from fastapi.encoders import jsonable_encoder
from fastmcp.exceptions import ToolError

from app.schemas.response import ApiResponse


async def run_endpoint(call: Awaitable[ApiResponse]) -> Any:
    """
    Await an endpoint function and return the `data` of its ApiResponse.

    The tools call the same endpoint functions as the REST API, so they get
    the same validation and masking. Those raise HTTPException, which inside a
    tool would reach the client as a generic error; a ToolError sends its
    message ("Query contains a disallowed statement: ...") to the model instead.
    """
    try:
        response = await call
    except HTTPException as exc:
        raise ToolError(str(exc.detail)) from exc
    return jsonable_encoder(response.data)
