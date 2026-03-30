from fastapi import APIRouter

from app.core.responses import ok
from app.schemas.keyspace import KeyspaceListResponse
from app.schemas.response import ApiResponse
from app.services import keyspace_service

router = APIRouter()


@router.get("/keyspaces", response_model=ApiResponse[KeyspaceListResponse])
async def list_keyspaces() -> ApiResponse:
    keyspaces = await keyspace_service.list_keyspaces()
    return ok(KeyspaceListResponse(keyspaces=keyspaces))
