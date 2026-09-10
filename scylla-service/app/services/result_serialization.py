"""Convert Cassandra-specific result values into JSON-safe representations."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any, Dict, Iterable, List

from cassandra.util import Date as CassandraDate
from cassandra.util import Duration as CassandraDuration
from cassandra.util import Time as CassandraTime


def serialize_value(value: Any) -> Any:
    """Return a JSON-safe copy while preserving ordinary Python value types."""
    if isinstance(value, (CassandraDate, CassandraTime, CassandraDuration)):
        return str(value)
    if isinstance(value, Mapping):
        return {key: serialize_value(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set, frozenset)):
        return [serialize_value(item) for item in value]
    return value


def serialize_rows(rows: Iterable[Mapping[str, Any]]) -> List[Dict[str, Any]]:
    """Copy result rows and normalize Cassandra-only values recursively."""
    return [
        {column: serialize_value(value) for column, value in row.items()}
        for row in rows
    ]
