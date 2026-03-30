from __future__ import annotations

from functools import lru_cache
from typing import List

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
    )

    # Application
    APP_ENV: str = "development"
    APP_HOST: str = "0.0.0.0"
    APP_PORT: int = 8000
    LOG_LEVEL: str = "INFO"

    # ScyllaDB / Cassandra
    SCYLLA_CONTACT_POINTS: str = "127.0.0.1"
    SCYLLA_PORT: int = 9042
    SCYLLA_USERNAME: str = ""
    SCYLLA_PASSWORD: str = ""
    SCYLLA_SSL: bool = False
    SCYLLA_CA_CERT: str = ""  # PEM-encoded CA certificate content

    @property
    def scylla_contact_points_list(self) -> List[str]:
        return [h.strip() for h in self.SCYLLA_CONTACT_POINTS.split(",") if h.strip()]

    @field_validator("LOG_LEVEL")
    @classmethod
    def validate_log_level(cls, v: str) -> str:
        allowed = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}
        upper = v.upper()
        if upper not in allowed:
            raise ValueError(f"LOG_LEVEL must be one of {allowed}")
        return upper


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
