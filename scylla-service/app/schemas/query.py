from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, field_validator

PAGE_SIZE_DEFAULT = 50
PAGE_SIZE_MAX = 200


class QueryRequest(BaseModel):
    query: str
    page_size: int = Field(default=PAGE_SIZE_DEFAULT, ge=1, le=PAGE_SIZE_MAX)
    paging_state: Optional[str] = None  # base64-encoded token from previous response

    @field_validator("query")
    @classmethod
    def query_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("query must not be empty")
        return v.strip()


class QueryResponse(BaseModel):
    columns: List[str]
    rows: List[Dict[str, Any]]
    row_count: int
    paging_state: Optional[str] = None  # null means no more pages
