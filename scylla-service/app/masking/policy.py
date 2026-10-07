"""Immutable masking-policy types shared by protected keyspaces."""

from __future__ import annotations

from dataclasses import dataclass
from typing import FrozenSet


@dataclass(frozen=True)
class TableMaskingPolicy:
    """Columns that may leave the backend unchanged for one table.

    Any column not present in ``visible_fields`` is masked. ``json_text_fields``
    identifies structured values persisted in Scylla ``text`` columns so they
    receive a JSON placeholder without parsing or exposing their contents.
    ``masked_fields`` provides the inverse policy for tables where only named
    columns are sensitive and every other column should remain visible.
    """

    visible_fields: FrozenSet[str] = frozenset()
    masked_fields: FrozenSet[str] = frozenset()
    json_text_fields: FrozenSet[str] = frozenset()
    reveal_all: bool = False

    def __post_init__(self) -> None:
        if self.visible_fields and self.masked_fields:
            raise ValueError("A table policy cannot mix visible and masked fields")
        if self.reveal_all and (self.visible_fields or self.masked_fields):
            raise ValueError("A reveal-all policy cannot define field rules")

    def is_visible(self, column: str) -> bool:
        if self.reveal_all:
            return True
        if self.masked_fields:
            return column not in self.masked_fields
        return column in self.visible_fields
