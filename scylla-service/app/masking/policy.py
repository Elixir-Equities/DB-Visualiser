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
    """

    visible_fields: FrozenSet[str] = frozenset()
    json_text_fields: FrozenSet[str] = frozenset()
    reveal_all: bool = False

    def is_visible(self, column: str) -> bool:
        return self.reveal_all or column in self.visible_fields
