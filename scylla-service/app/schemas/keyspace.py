from pydantic import BaseModel
from typing import Dict, List


class KeyspaceInfo(BaseModel):
    name: str
    replication: Dict[str, str]


class KeyspaceListResponse(BaseModel):
    keyspaces: List[KeyspaceInfo]
