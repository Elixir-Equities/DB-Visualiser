"""Conservative CQL analysis for sources protected by response masking.

The analyzer deliberately supports a small, lineage-preserving SELECT subset.
If a protected query cannot be proven safe, it is rejected before it reaches
Scylla. Queries for other sources are returned to the existing flow unchanged.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from typing import List, Optional, Sequence

from app.masking.policy import TableMaskingPolicy
from app.masking.registry import (
    get_table_policy,
    is_protected_keyspace,
    is_protected_source,
)

_NUMBER_RE = re.compile(r"(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?")
_IDENTIFIER_START_RE = re.compile(r"[A-Za-z_]")
_IDENTIFIER_PART_RE = re.compile(r"[A-Za-z0-9_$]")
_COMPARISON_OPERATORS = {"=", "<", "<=", ">", ">=", "!=", "<>"}
_CLAUSE_STARTS = {"where", "order", "group", "per", "limit", "allow"}
_OPENING = {"(": ")", "[": "]", "{": "}"}
_CLOSING = {value: key for key, value in _OPENING.items()}


class ProtectedQueryError(ValueError):
    """A protected query cannot be executed without risking a masking bypass."""


@dataclass(frozen=True)
class _Token:
    kind: str
    value: str

    @property
    def keyword(self) -> str:
        return self.value.casefold() if self.kind == "IDENT" else ""


@dataclass(frozen=True)
class ProtectedQuery:
    keyspace: str
    table: str
    policy: TableMaskingPolicy
    fingerprint: str


def _unsafe(message: str = "Unsupported query for protected PFR data") -> None:
    raise ProtectedQueryError(message)


def _tokenize(query: str) -> List[_Token]:
    tokens: List[_Token] = []
    i = 0
    size = len(query)

    while i < size:
        char = query[i]
        if char.isspace():
            i += 1
            continue

        if query.startswith("--", i) or query.startswith("//", i):
            newline = query.find("\n", i + 2)
            i = size if newline == -1 else newline + 1
            continue

        if query.startswith("/*", i):
            end = query.find("*/", i + 2)
            if end == -1:
                _unsafe()
            i = end + 2
            continue

        if char == "'":
            i += 1
            while i < size:
                if query[i] != "'":
                    i += 1
                    continue
                if i + 1 < size and query[i + 1] == "'":
                    i += 2
                    continue
                i += 1
                tokens.append(_Token("STRING", ""))
                break
            else:
                _unsafe()
            continue

        if char == '"':
            i += 1
            value: List[str] = []
            while i < size:
                if query[i] != '"':
                    value.append(query[i])
                    i += 1
                    continue
                if i + 1 < size and query[i + 1] == '"':
                    value.append('"')
                    i += 2
                    continue
                i += 1
                tokens.append(_Token("QIDENT", "".join(value)))
                break
            else:
                _unsafe()
            continue

        number = _NUMBER_RE.match(query, i)
        if number:
            tokens.append(_Token("NUMBER", number.group(0)))
            i = number.end()
            continue

        if _IDENTIFIER_START_RE.fullmatch(char):
            end = i + 1
            while end < size and _IDENTIFIER_PART_RE.fullmatch(query[end]):
                end += 1
            tokens.append(_Token("IDENT", query[i:end]))
            i = end
            continue

        two_char = query[i : i + 2]
        if two_char in {"<=", ">=", "!=", "<>"}:
            tokens.append(_Token("SYMBOL", two_char))
            i += 2
            continue

        tokens.append(_Token("SYMBOL", char))
        i += 1

    return tokens


def _identifier(token: _Token) -> Optional[str]:
    if token.kind == "IDENT":
        return token.value.casefold()
    if token.kind == "QIDENT":
        return token.value
    return None


def _strip_trailing_semicolon(tokens: Sequence[_Token]) -> List[_Token]:
    semicolons = [index for index, token in enumerate(tokens) if token.value == ";"]
    if not semicolons:
        return list(tokens)
    if len(semicolons) != 1 or semicolons[0] != len(tokens) - 1:
        _unsafe("Multiple statements are not supported for protected PFR data")
    return list(tokens[:-1])


def _qualified_keyspace_reference(tokens: Sequence[_Token]) -> bool:
    for index, token in enumerate(tokens[:-2]):
        identifier = _identifier(token)
        table = _identifier(tokens[index + 2])
        if (
            identifier is not None
            and tokens[index + 1].value == "."
            and table is not None
            and is_protected_source(identifier, table)
        ):
            return True
    if len(tokens) >= 2 and tokens[0].keyword == "use":
        identifier = _identifier(tokens[1])
        return identifier is not None and is_protected_keyspace(identifier)
    return False


def _find_top_level_keyword(
    tokens: Sequence[_Token],
    keyword: str,
    *,
    start: int = 0,
) -> Optional[int]:
    stack: List[str] = []
    for index in range(start, len(tokens)):
        value = tokens[index].value
        if value in _OPENING:
            stack.append(value)
        elif value in _CLOSING:
            if not stack or stack.pop() != _CLOSING[value]:
                _unsafe()
        elif not stack and tokens[index].keyword == keyword:
            return index
    if stack:
        _unsafe()
    return None


def _split_top_level(
    tokens: Sequence[_Token],
    *,
    symbol: Optional[str] = None,
    keyword: Optional[str] = None,
) -> List[List[_Token]]:
    parts: List[List[_Token]] = []
    current: List[_Token] = []
    stack: List[str] = []

    for token in tokens:
        if token.value in _OPENING:
            stack.append(token.value)
        elif token.value in _CLOSING:
            if not stack or stack.pop() != _CLOSING[token.value]:
                _unsafe()

        is_separator = not stack and (
            (symbol is not None and token.value == symbol)
            or (keyword is not None and token.keyword == keyword)
        )
        if is_separator:
            if not current:
                _unsafe()
            parts.append(current)
            current = []
        else:
            current.append(token)

    if stack or not current:
        _unsafe()
    parts.append(current)
    return parts


def _validate_projection(tokens: Sequence[_Token]) -> None:
    if len(tokens) == 1 and tokens[0].value == "*":
        return

    for projection in _split_top_level(tokens, symbol=","):
        if len(projection) != 1 or _identifier(projection[0]) is None:
            _unsafe(
                "Aliases and calculated projections are not supported for protected PFR data"
            )
        if projection[0].keyword in {"json", "distinct"}:
            _unsafe(
                "JSON, DISTINCT, and calculated projections are not supported for protected PFR data"
            )


def _contains_function_call(tokens: Sequence[_Token]) -> bool:
    for index, token in enumerate(tokens[:-1]):
        if token.kind not in {"IDENT", "QIDENT"} or tokens[index + 1].value != "(":
            continue
        if token.keyword != "in":
            return True
    return False


def _validate_where(tokens: Sequence[_Token], policy: TableMaskingPolicy) -> None:
    if not tokens or _contains_function_call(tokens):
        _unsafe("Only direct visible-field filters are supported for protected PFR data")

    for condition in _split_top_level(tokens, keyword="and"):
        if any(token.keyword in {"or", "as"} for token in condition):
            _unsafe("Only AND filters on visible fields are supported for protected PFR data")
        if len(condition) < 3:
            _unsafe("Invalid filter for protected PFR data")

        field = _identifier(condition[0])
        if field is None or not policy.is_visible(field):
            _unsafe("Filtering is allowed only on visible PFR fields")

        for token in condition[2:]:
            if token.kind == "QIDENT":
                _unsafe("Filter values cannot reference PFR columns")
            if token.kind == "IDENT" and token.keyword not in {
                "false", "key", "not", "null", "true",
            }:
                _unsafe("Filter values must be CQL literals")

        operator = condition[1]
        if operator.value in _COMPARISON_OPERATORS:
            continue
        if operator.keyword == "in":
            if len(condition) < 4 or condition[2].value != "(" or condition[-1].value != ")":
                _unsafe("Invalid IN filter for protected PFR data")
            continue
        if operator.keyword in {"contains", "like", "is"}:
            continue
        _unsafe("Unsupported filter operator for protected PFR data")


def _validate_order_by(tokens: Sequence[_Token], policy: TableMaskingPolicy) -> None:
    if not tokens or _contains_function_call(tokens):
        _unsafe("Only direct visible-field ordering is supported for protected PFR data")

    for ordering in _split_top_level(tokens, symbol=","):
        field = _identifier(ordering[0]) if ordering else None
        if field is None or not policy.is_visible(field):
            _unsafe("Ordering is allowed only on visible PFR fields")
        if len(ordering) == 2 and ordering[1].keyword in {"asc", "desc"}:
            continue
        if len(ordering) != 1:
            _unsafe("Invalid ordering for protected PFR data")


def _next_clause(tokens: Sequence[_Token], start: int) -> int:
    stack: List[str] = []
    for index in range(start, len(tokens)):
        token = tokens[index]
        if token.value in _OPENING:
            stack.append(token.value)
        elif token.value in _CLOSING:
            if not stack or stack.pop() != _CLOSING[token.value]:
                _unsafe()
        elif not stack and token.keyword in _CLAUSE_STARTS:
            return index
    if stack:
        _unsafe()
    return len(tokens)


def _validate_tail(tokens: Sequence[_Token], policy: TableMaskingPolicy) -> None:
    cursor = 0
    seen = set()

    while cursor < len(tokens):
        keyword = tokens[cursor].keyword
        if not keyword or keyword in seen:
            _unsafe()
        seen.add(keyword)

        if keyword == "where":
            end = _next_clause(tokens, cursor + 1)
            _validate_where(tokens[cursor + 1 : end], policy)
            cursor = end
            continue

        if keyword == "order":
            if cursor + 1 >= len(tokens) or tokens[cursor + 1].keyword != "by":
                _unsafe()
            end = _next_clause(tokens, cursor + 2)
            _validate_order_by(tokens[cursor + 2 : end], policy)
            cursor = end
            continue

        if keyword == "group":
            _unsafe("GROUP BY is not supported for protected PFR data")

        if keyword == "per":
            clause = tokens[cursor : cursor + 4]
            if (
                len(clause) != 4
                or clause[1].keyword != "partition"
                or clause[2].keyword != "limit"
                or clause[3].kind != "NUMBER"
                or not clause[3].value.isdigit()
            ):
                _unsafe("Invalid PER PARTITION LIMIT for protected PFR data")
            cursor += 4
            continue

        if keyword == "limit":
            if (
                cursor + 1 >= len(tokens)
                or tokens[cursor + 1].kind != "NUMBER"
                or not tokens[cursor + 1].value.isdigit()
            ):
                _unsafe("Invalid LIMIT for protected PFR data")
            cursor += 2
            continue

        if keyword == "allow":
            if cursor + 1 >= len(tokens) or tokens[cursor + 1].keyword != "filtering":
                _unsafe()
            cursor += 2
            continue

        _unsafe()


def _shape_fingerprint(tokens: Sequence[_Token]) -> str:
    """Fingerprint query structure without making literals dictionary-attackable."""
    shape = []
    for token in tokens:
        if token.kind == "STRING":
            shape.append("STRING:?")
        elif token.kind == "NUMBER":
            shape.append("NUMBER:#")
        elif token.kind == "IDENT":
            shape.append(f"IDENT:{token.value.casefold()}")
        else:
            shape.append(f"{token.kind}:{token.value}")
    return hashlib.sha256("\x1f".join(shape).encode("utf-8")).hexdigest()[:16]


def analyze_protected_query(query: str) -> Optional[ProtectedQuery]:
    """Return masking context for a protected source, otherwise ``None``."""
    raw_tokens = _tokenize(query)
    if not raw_tokens or not _qualified_keyspace_reference(raw_tokens):
        return None
    tokens = _strip_trailing_semicolon(raw_tokens)

    if tokens[0].keyword != "select":
        _unsafe("Only SELECT queries are supported for protected PFR data")

    from_index = _find_top_level_keyword(tokens, "from", start=1)
    if from_index is None or from_index + 3 >= len(tokens):
        _unsafe()

    keyspace = _identifier(tokens[from_index + 1])
    table = _identifier(tokens[from_index + 3])
    if (
        keyspace is None
        or tokens[from_index + 2].value != "."
        or table is None
    ):
        _unsafe()

    if not is_protected_source(keyspace, table):
        _unsafe()

    policy = get_table_policy(keyspace, table)
    if policy is None:
        _unsafe("Unknown table in protected PFR keyspace")

    _validate_projection(tokens[1:from_index])
    _validate_tail(tokens[from_index + 4 :], policy)

    return ProtectedQuery(
        keyspace=keyspace,
        table=table,
        policy=policy,
        fingerprint=_shape_fingerprint(tokens),
    )
