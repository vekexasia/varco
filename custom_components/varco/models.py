from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import StrEnum
from typing import Any


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


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
        )

    def as_dict(self) -> dict[str, Any]:
        return dict(self.__dict__)
