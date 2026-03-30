"""
ScyllaDB singleton session.

cassandra-driver is synchronous. The session is created once at startup
and reused for the lifetime of the process. All callers share the same
Session object — cassandra-driver is internally thread-safe and multiplexes
requests over its connection pool, so sharing is both safe and efficient.

How the singleton works
-----------------------
`_session` is a module-level variable initialised to None.
`get_session()` returns it after `init_session()` has been called.
FastAPI's lifespan hook calls `init_session()` on startup and
`shutdown_session()` on shutdown, so the rest of the app never has to
manage the lifecycle manually.
"""
from __future__ import annotations

import ssl
from typing import Optional

from cassandra.auth import PlainTextAuthProvider
from cassandra.cluster import Cluster, Session
from cassandra.policies import DCAwareRoundRobinPolicy

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)

_session: Optional[Session] = None
_cluster: Optional[Cluster] = None


def _build_ssl_context(ca_cert: str) -> ssl.SSLContext:
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    # cadata accepts a PEM string directly — no temp file required.
    ctx.load_verify_locations(cadata=ca_cert)
    # Disable hostname verification for internal / self-signed certs.
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_REQUIRED
    return ctx


def init_session() -> None:
    """Create the Cluster and open a Session. Called once at app startup."""
    global _cluster, _session

    settings = get_settings()
    contact_points = settings.scylla_contact_points_list

    logger.info(
        "Connecting to ScyllaDB | hosts=%s port=%d ssl=%s",
        contact_points,
        settings.SCYLLA_PORT,
        settings.SCYLLA_SSL,
    )

    auth_provider = None
    if settings.SCYLLA_USERNAME and settings.SCYLLA_PASSWORD:
        auth_provider = PlainTextAuthProvider(
            username=settings.SCYLLA_USERNAME,
            password=settings.SCYLLA_PASSWORD,
        )

    ssl_context = None
    if settings.SCYLLA_SSL:
        if not settings.SCYLLA_CA_CERT:
            raise ValueError("SCYLLA_SSL is enabled but SCYLLA_CA_CERT is not set")
        ssl_context = _build_ssl_context(settings.SCYLLA_CA_CERT)

    try:
        _cluster = Cluster(
            contact_points=contact_points,
            port=settings.SCYLLA_PORT,
            auth_provider=auth_provider,
            ssl_context=ssl_context,
            protocol_version=4,
            load_balancing_policy=DCAwareRoundRobinPolicy(),
        )
        _session = _cluster.connect()
        logger.info("ScyllaDB session established successfully")
    except Exception as exc:
        logger.error("Failed to connect to ScyllaDB: %s", exc)
        raise


def shutdown_session() -> None:
    """Gracefully close the session and cluster. Called at app shutdown."""
    global _cluster, _session

    if _session is not None:
        try:
            _session.shutdown()
            logger.info("ScyllaDB session closed")
        except Exception as exc:
            logger.warning("Error closing session: %s", exc)
        finally:
            _session = None

    if _cluster is not None:
        try:
            _cluster.shutdown()
            logger.info("ScyllaDB cluster closed")
        except Exception as exc:
            logger.warning("Error closing cluster: %s", exc)
        finally:
            _cluster = None


def get_session() -> Session:
    """Return the shared Session. Raises if called before init_session()."""
    if _session is None:
        raise RuntimeError("ScyllaDB session has not been initialised. Call init_session() first.")
    return _session
