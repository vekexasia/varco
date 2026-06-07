from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

SENSITIVE_DETAIL_KEYS = {"states", "state", "history", "camera", "payload", "snapshot", "body"}


def sanitize_details(details: dict[str, Any] | None) -> dict[str, Any]:
    if not details:
        return {}
    return {key: ("<redacted>" if key in SENSITIVE_DETAIL_KEYS else value) for key, value in details.items()}


async def async_log(store: Any, event: str, grant_id: str | None = None, details: dict[str, Any] | None = None) -> None:
    await store.async_append_audit({
        "ts": datetime.now(timezone.utc).isoformat(),
        "event": event,
        "grant_id": grant_id,
        "details": sanitize_details(details),
    })
