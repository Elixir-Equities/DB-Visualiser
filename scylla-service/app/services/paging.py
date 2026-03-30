"""
Utilities for encoding/decoding cassandra-driver paging_state.

Token format (opaque to the frontend):
    {query_fingerprint}.{base64(driver_bytes)}

The fingerprint is the first 16 hex chars of SHA-256(normalised_query).
Including it in the token lets us detect — and reject — requests where
the client sends a paging_state that was issued for a different query,
preventing the driver from receiving a mismatched continuation token.
"""
from __future__ import annotations

import base64
import binascii
import hashlib

from fastapi import HTTPException

_SEP = "."
_FINGERPRINT_LEN = 16  # chars from sha256 hex digest


def _fingerprint(query: str) -> str:
    return hashlib.sha256(query.encode()).hexdigest()[:_FINGERPRINT_LEN]


def encode_paging_state(state: bytes | None, query: str) -> str | None:
    """
    Wrap driver bytes + query fingerprint into an opaque string token.
    Returns None when there are no more pages.
    """
    if state is None:
        return None
    return _fingerprint(query) + _SEP + base64.b64encode(state).decode("ascii")


def decode_paging_state(token: str | None, query: str) -> bytes | None:
    """
    Validate and unwrap a token back to raw driver bytes.

    Raises HTTP 400 for:
    - malformed token structure
    - query fingerprint mismatch (query changed between pages)
    - invalid base64 payload
    """
    if not token:
        return None

    parts = token.split(_SEP, 1)
    if len(parts) != 2:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Malformed paging_state token",
                "code": "INVALID_PAGING_STATE",
            },
        )

    stored_fp, encoded_state = parts

    if stored_fp != _fingerprint(query):
        raise HTTPException(
            status_code=400,
            detail={
                "message": "paging_state was issued for a different query",
                "code": "PAGING_STATE_QUERY_MISMATCH",
            },
        )

    try:
        return base64.b64decode(encoded_state.encode("ascii"))
    except (binascii.Error, ValueError):
        raise HTTPException(
            status_code=400,
            detail={
                "message": "paging_state contains invalid base64 data",
                "code": "INVALID_PAGING_STATE",
            },
        )
