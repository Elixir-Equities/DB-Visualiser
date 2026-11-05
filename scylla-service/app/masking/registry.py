"""Registry of keyspaces whose query results require masking."""

from __future__ import annotations

from typing import FrozenSet, Optional

from app.core.config import get_settings
from app.masking.pfr_policy import PFR_TABLE_POLICIES
from app.masking.policy import TableMaskingPolicy


def protected_keyspaces() -> FrozenSet[str]:
    """Return configured physical keyspaces using the logical PFR policy."""
    return get_settings().pfr_masked_keyspaces


def is_protected_keyspace(keyspace: str) -> bool:
    return keyspace.casefold() in protected_keyspaces()


def is_protected_source(keyspace: str, table: str) -> bool:
    """Return whether a source must pass protected-query analysis."""
    return is_protected_keyspace(keyspace)


def get_table_policy(keyspace: str, table: str) -> Optional[TableMaskingPolicy]:
    # PFR remains fail-closed for its entire keyspace.
    if is_protected_keyspace(keyspace):
        return PFR_TABLE_POLICIES.get(table)
    return None
