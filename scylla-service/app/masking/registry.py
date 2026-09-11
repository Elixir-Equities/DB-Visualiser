"""Registry of keyspaces whose query results require masking."""

from __future__ import annotations

from typing import FrozenSet, Optional

from app.core.config import get_settings
from app.masking.ch_policy import CH_TABLE_POLICY
from app.masking.pfr_policy import PFR_TABLE_POLICIES
from app.masking.policy import TableMaskingPolicy


def protected_keyspaces() -> FrozenSet[str]:
    """Return configured physical keyspaces using the logical PFR policy."""
    return get_settings().pfr_masked_keyspaces


def is_protected_keyspace(keyspace: str) -> bool:
    return keyspace.casefold() in protected_keyspaces()


def is_ch_masked_table(keyspace: str, table: str) -> bool:
    settings = get_settings()
    return (
        keyspace.casefold() == settings.ch_masked_keyspace
        and table.casefold() == settings.ch_masked_table
    )


def is_protected_source(keyspace: str, table: str) -> bool:
    """Return whether a source must pass protected-query analysis."""
    return is_protected_keyspace(keyspace) or is_ch_masked_table(keyspace, table)


def get_table_policy(keyspace: str, table: str) -> Optional[TableMaskingPolicy]:
    # PFR remains fail-closed for its entire keyspace and cannot be weakened by
    # an overlapping selective-table configuration.
    if is_protected_keyspace(keyspace):
        return PFR_TABLE_POLICIES.get(table)
    if is_ch_masked_table(keyspace, table):
        return CH_TABLE_POLICY
    return None
