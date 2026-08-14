"""
Internal API-key authentication.

Every /api/v1 route requires an `X-API-Key` header matching INTERNAL_API_TOKEN.
The dependency is attached once to the v1 router, so any endpoint added later
is protected automatically.

The token is never sent to the browser — the proxy in front of the backend
(nginx in the container, the Vite dev proxy locally) injects the header on
each forwarded request.
"""
from __future__ import annotations

import secrets
from typing import Optional

from fastapi import Header, HTTPException, status

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)


def require_api_key(x_api_key: Optional[str] = Header(default=None)) -> None:
    """Reject the request unless X-API-Key matches INTERNAL_API_TOKEN."""
    settings = get_settings()

    # Fail closed: an unset token means the deployment is misconfigured, and
    # serving data unauthenticated is worse than serving an error.
    if not settings.INTERNAL_API_TOKEN:
        logger.error("INTERNAL_API_TOKEN is not configured — rejecting request")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Server auth is not configured",
        )

    # compare_digest keeps the check constant-time, so a wrong key leaks
    # nothing about how many leading characters were correct.
    if x_api_key is None or not secrets.compare_digest(x_api_key, settings.INTERNAL_API_TOKEN):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing X-API-Key",
        )
