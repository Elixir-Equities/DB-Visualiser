from fastapi import APIRouter, Query

from app.core.responses import ok
from app.schemas.response import ApiResponse
from app.schemas.table import TableListResponse, TableSchemaResponse
from app.services import table_service

router = APIRouter()


@router.get("/tables", response_model=ApiResponse[TableListResponse])
async def list_tables(
    keyspace: str = Query(..., description="Keyspace name"),
) -> ApiResponse:
    tables = await table_service.list_tables(keyspace)
    return ok(TableListResponse(keyspace=keyspace, tables=tables))


@router.get("/schema", response_model=ApiResponse[TableSchemaResponse])
async def get_schema(
    keyspace: str = Query(..., description="Keyspace name"),
    table: str = Query(..., description="Table name"),
) -> ApiResponse:
    schema = await table_service.get_table_schema(keyspace, table)
    return ok(schema)
