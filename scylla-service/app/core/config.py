from __future__ import annotations

import logging
import os
import re
from functools import lru_cache
from typing import FrozenSet, List

from pydantic import ValidationError, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        validate_default=True,
    )

    # Application
    APP_ENV: str = "development"
    APP_HOST: str = "0.0.0.0"
    APP_PORT: int = 8000
    LOG_LEVEL: str = "INFO"

    # Shared secret every /api/v1 caller must send as the X-API-Key header.
    # Injected by the proxy (nginx / Vite dev proxy) — never exposed to the browser.
    INTERNAL_API_TOKEN: str = ""

    # ScyllaDB / Cassandra
    SCYLLA_CONTACT_POINTS: str = "127.0.0.1"
    SCYLLA_PORT: int = 9042
    SCYLLA_USERNAME: str = ""
    SCYLLA_PASSWORD: str = ""
    SCYLLA_SSL: bool = False
    SCYLLA_CA_CERT: str = ""  # PEM-encoded CA certificate content

    # Comma-separated physical keyspace names that share the PFR masking policy.
    # Deployment environments can map different test/prod names to one policy.
    PFR_MASKED_KEYSPACES: str

    @property
    def scylla_contact_points_list(self) -> List[str]:
        return [h.strip() for h in self.SCYLLA_CONTACT_POINTS.split(",") if h.strip()]

    @property
    def pfr_masked_keyspaces(self) -> FrozenSet[str]:
        return frozenset(
            name.strip().casefold()
            for name in self.PFR_MASKED_KEYSPACES.split(",")
            if name.strip()
        )

    @field_validator("PFR_MASKED_KEYSPACES")
    @classmethod
    def validate_pfr_masked_keyspaces(cls, value: str) -> str:
        names = [name.strip() for name in value.split(",") if name.strip()]
        if not names:
            raise ValueError("PFR_MASKED_KEYSPACES must contain at least one keyspace")
        invalid = [
            name
            for name in names
            if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_$]*", name) is None
        ]
        if invalid:
            raise ValueError("PFR_MASKED_KEYSPACES contains an invalid keyspace name")
        normalized = [name.casefold() for name in names]
        if len(normalized) != len(set(normalized)):
            raise ValueError("PFR_MASKED_KEYSPACES contains duplicate keyspaces")
        return ",".join(names)

    @field_validator("LOG_LEVEL")
    @classmethod
    def validate_log_level(cls, v: str) -> str:
        allowed = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}
        upper = v.upper()
        if upper not in allowed:
            raise ValueError(f"LOG_LEVEL must be one of {allowed}")
        return upper

    @field_validator("SCYLLA_CA_CERT", mode="before")
    @classmethod
    def fallback_ca_cert(cls, v: str) -> str:
        # CA_CERT supports existing Kubernetes Secrets; SCYLLA_CA_CERT is the
        # preferred application setting. Escaped newlines keep Docker env-file
        # usage possible while real multi-line PEM values work unchanged.
        return (v or os.getenv("CA_CERT", "")).replace("\\n", "\n")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    try:
        return Settings()
    except ValidationError as exc:
        if any(
            error["loc"] == ("PFR_MASKED_KEYSPACES",)
            and error["type"] == "missing"
            for error in exc.errors()
        ):
            logging.getLogger(__name__).critical(
                "PFR_MASKED_KEYSPACES is not configured; refusing to start"
            )
        raise
