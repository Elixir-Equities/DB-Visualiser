from __future__ import annotations

from typing import List

from app.db.client import execute_dict
from app.schemas.keyspace import KeyspaceInfo


async def list_keyspaces() -> List[KeyspaceInfo]:
    rows = await execute_dict(
        "SELECT keyspace_name, replication FROM system_schema.keyspaces"
    )
    return [
        KeyspaceInfo(
            name=row["keyspace_name"],
            replication=dict(row.get("replication") or {}),
        )
        for row in rows
    ]
