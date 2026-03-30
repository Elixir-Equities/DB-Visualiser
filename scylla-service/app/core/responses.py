from typing import Any, Optional

from app.schemas.response import ApiError, ApiResponse


def ok(data: Any = None) -> ApiResponse:
    return ApiResponse(success=True, data=data, error=None)


def err(message: str, code: str, data: Optional[Any] = None) -> ApiResponse:
    return ApiResponse(success=False, data=data, error=ApiError(message=message, code=code))
