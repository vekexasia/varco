from __future__ import annotations

import base64
import hashlib
import hmac
import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import StrEnum
from typing import Any


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def _b64(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode().rstrip("=")


def _unb64(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def hash_pin(pin: str, *, salt: bytes | None = None, iterations: int = 120_000) -> str:
    """Hash an owner-managed restriction PIN for storage.

    PINs are Authority-local secrets. Store only this encoded hash and let the
    owner change/remove the PIN instead of revealing it later.
    """

    salt = salt or os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", str(pin).encode(), salt, iterations)
    return f"pbkdf2_sha256${iterations}${_b64(salt)}${_b64(digest)}"


def verify_pin(pin: str, encoded_hash: str) -> bool:
    try:
        algorithm, raw_iterations, raw_salt, raw_digest = encoded_hash.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        iterations = int(raw_iterations)
        salt = _unb64(raw_salt)
        expected = _unb64(raw_digest)
    except (TypeError, ValueError):
        return False
    actual = hashlib.pbkdf2_hmac("sha256", str(pin).encode(), salt, iterations)
    return hmac.compare_digest(actual, expected)


class AccessStatus(StrEnum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


@dataclass
class AccessRequest:
    request_id: str
    consumer_pk: str
    manifest: dict[str, Any]
    nonce: str
    pairing_code: str
    status: AccessStatus = AccessStatus.PENDING
    created_at: str = field(default_factory=utcnow)
    decided_at: str | None = None

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "AccessRequest":
        return cls(
            request_id=data["request_id"],
            consumer_pk=data["consumer_pk"],
            manifest=dict(data.get("manifest") or {}),
            nonce=data["nonce"],
            pairing_code=data["pairing_code"],
            status=AccessStatus(data.get("status", AccessStatus.PENDING)),
            created_at=data.get("created_at") or utcnow(),
            decided_at=data.get("decided_at"),
        )

    def as_dict(self) -> dict[str, Any]:
        return {**self.__dict__, "status": str(self.status)}


@dataclass
class Grant:
    grant_id: str
    consumer_pk: str
    manifest: dict[str, Any]
    request_id: str | None = None
    revoked: bool = False
    created_at: str = field(default_factory=utcnow)
    revoked_at: str | None = None
    expires_at: str | None = None
    renewed_at: str | None = None
    last_used_at: str | None = None
    restrictions: list[dict[str, Any]] = field(default_factory=list)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Grant":
        return cls(
            grant_id=data["grant_id"],
            consumer_pk=data["consumer_pk"],
            manifest=dict(data.get("manifest") or {}),
            request_id=data.get("request_id"),
            revoked=bool(data.get("revoked", False)),
            created_at=data.get("created_at") or utcnow(),
            revoked_at=data.get("revoked_at"),
            expires_at=data.get("expires_at"),
            renewed_at=data.get("renewed_at"),
            last_used_at=data.get("last_used_at"),
            restrictions=[dict(item) for item in data.get("restrictions") or [] if isinstance(item, dict)],
        )

    def as_dict(self) -> dict[str, Any]:
        return dict(self.__dict__)
