"""Server-side masking for protected Scylla query results."""

from app.masking.masker import MaskingError, mask_rows
from app.masking.query_analyzer import (
    ProtectedQuery,
    ProtectedQueryError,
    analyze_protected_query,
)

__all__ = [
    "MaskingError",
    "ProtectedQuery",
    "ProtectedQueryError",
    "analyze_protected_query",
    "mask_rows",
]
