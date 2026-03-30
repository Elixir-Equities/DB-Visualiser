from __future__ import annotations

from typing import List

from fastapi import HTTPException

from app.db.client import execute_dict
from app.schemas.table import ColumnInfo, ColumnKind, TableSchemaResponse

# Order in which column kinds appear in the response
_KIND_ORDER = {
    ColumnKind.partition_key: 0,
    ColumnKind.clustering: 1,
    ColumnKind.regular: 2,
    ColumnKind.static: 3,
}


async def list_tables(keyspace: str) -> List[str]:
    rows = await execute_dict(
        "SELECT table_name FROM system_schema.tables WHERE keyspace_name = %s",
        (keyspace,),
    )
    if not rows:
        ks_rows = await execute_dict(
            "SELECT keyspace_name FROM system_schema.keyspaces WHERE keyspace_name = %s",
            (keyspace,),
        )
        if not ks_rows:
            raise HTTPException(status_code=404, detail=f"Keyspace '{keyspace}' not found")
    return [row["table_name"] for row in rows]


async def get_table_schema(keyspace: str, table: str) -> TableSchemaResponse:
    rows = await execute_dict(
        """
        SELECT column_name, type, kind, position
        FROM system_schema.columns
        WHERE keyspace_name = %s AND table_name = %s
        """,
        (keyspace, table),
    )
    if not rows:
        raise HTTPException(
            status_code=404,
            detail=f"Table '{keyspace}.{table}' not found or has no columns",
        )

    # Build (sort_key, ColumnInfo) pairs so position is captured before sorting
    tagged: list[tuple[tuple, ColumnInfo]] = []
    for row in rows:
        try:
            kind = ColumnKind(row["kind"])
        except ValueError:
            kind = ColumnKind.regular  # safe fallback for unknown kinds

        sort_key = (_KIND_ORDER[kind], row["position"] or 0)
        tagged.append((sort_key, ColumnInfo(name=row["column_name"], type=row["type"], kind=kind)))

    tagged.sort(key=lambda t: t[0])
    columns = [col for _, col in tagged]

    return TableSchemaResponse(table_name=table, keyspace=keyspace, columns=columns)
