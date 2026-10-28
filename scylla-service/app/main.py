from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.router import router as v1_router
from app.core.config import get_settings
from app.core.logging import configure_logging, get_logger
from app.core.responses import err
from app.db.session import init_session, shutdown_session
from app.mcp_server import mcp_app, mcp_route

configure_logging()
logger = get_logger(__name__)
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    logger.info("Starting up — environment: %s", settings.APP_ENV)
    init_session()
    yield
    logger.info("Shutting down")
    shutdown_session()


@asynccontextmanager
async def app_lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    # The MCP app's lifespan runs its session manager; without it every /mcp
    # call fails. Entered after the ScyllaDB session and exited before it.
    async with lifespan(app), mcp_app.lifespan(app):
        yield


app = FastAPI(
    title="ScyllaDB Visualiser API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=app_lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content=err(
            message=str(exc.detail),
            code=f"HTTP_{exc.status_code}",
        ).model_dump(),
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    # Flatten pydantic validation errors into a readable message
    messages = "; ".join(
        f"{' -> '.join(str(l) for l in e['loc'])}: {e['msg']}"
        for e in exc.errors()
    )
    return JSONResponse(
        status_code=422,
        content=err(message=messages, code="VALIDATION_ERROR").model_dump(),
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.error("Unhandled exception on %s %s: %s", request.method, request.url, exc)
    return JSONResponse(
        status_code=500,
        content=err(message="Internal server error", code="INTERNAL_ERROR").model_dump(),
    )


app.include_router(v1_router)

# MCP endpoint for AI clients, at /mcp (checks X-API-Key itself, see
# mcp_server/auth.py). A route for exactly /mcp, not a mount at "/", so it
# never catches requests meant for other routes.
app.add_route("/mcp", mcp_route, include_in_schema=False)
