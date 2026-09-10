"""Non-mutating, type-aware masking of protected Scylla rows."""

from __future__ import annotations

from collections.abc import Collection, Mapping
from dataclasses import is_dataclass
from datetime import date, datetime, time
from enum import Enum
from numbers import Number
from typing import Any, Dict, Iterable, List
from uuid import UUID

from cassandra.util import Date as CassandraDate
from cassandra.util import Duration as CassandraDuration
from cassandra.util import Time as CassandraTime

from app.masking.policy import TableMaskingPolicy

MASKED_TEXT = "<masked: text>"
MASKED_NUMBER = "<masked: number>"
MASKED_DATE = "<masked: date>"
MASKED_BOOLEAN = "<masked: boolean>"
MASKED_JSON = "<masked: JSON present>"
MASKED_BINARY = "<masked: binary>"
MASKED_VALUE = "<masked: value>"


class MaskingError(ValueError):
    """Raised when a result cannot be safely represented as a masked row."""


def mask_value(value: Any, *, json_text: bool = False) -> Any:
    """Return a placeholder that reveals type/presence, never source content."""
    if value is None:
        return None
    if json_text:
        return MASKED_JSON
    if isinstance(value, bool):
        return MASKED_BOOLEAN
    if isinstance(
        value,
        (datetime, date, time, CassandraDate, CassandraTime, CassandraDuration),
    ):
        return MASKED_DATE
    if isinstance(value, Number):
        return MASKED_NUMBER
    if isinstance(value, (bytes, bytearray, memoryview)):
        return MASKED_BINARY
    if isinstance(value, (str, UUID, Enum)):
        return MASKED_TEXT
    if isinstance(value, Mapping):
        return MASKED_JSON
    if is_dataclass(value) or callable(getattr(value, "_asdict", None)):
        return MASKED_JSON
    if isinstance(value, Collection):
        return f"<masked: {len(value)} items>"
    return MASKED_VALUE


def mask_row(
    row: Mapping[str, Any],
    policy: TableMaskingPolicy,
) -> Dict[str, Any]:
    """Copy one row, preserving only fields explicitly approved by policy."""
    if not isinstance(row, Mapping):
        raise MaskingError("Query result row is not a mapping")

    if policy.reveal_all:
        return dict(row)

    masked: Dict[str, Any] = {}
    for column, value in row.items():
        if not isinstance(column, str):
            raise MaskingError("Query result contains a non-text column name")
        if policy.is_visible(column):
            masked[column] = value
        else:
            masked[column] = mask_value(
                value,
                json_text=column in policy.json_text_fields,
            )
    return masked


def mask_rows(
    rows: Iterable[Mapping[str, Any]],
    policy: TableMaskingPolicy,
) -> List[Dict[str, Any]]:
    return [mask_row(row, policy) for row in rows]
