from enum import Enum
from typing import List

from pydantic import BaseModel


class ColumnKind(str, Enum):
    partition_key = "partition_key"
    clustering = "clustering"
    regular = "regular"
    static = "static"


class ColumnInfo(BaseModel):
    name: str
    type: str
    kind: ColumnKind


class TableListResponse(BaseModel):
    keyspace: str
    tables: List[str]


class TableSchemaResponse(BaseModel):
    table_name: str
    keyspace: str
    columns: List[ColumnInfo]
