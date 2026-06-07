from __future__ import annotations

from typing import Any


def _list(manifest: dict[str, Any], *keys: str) -> list[str]:
    for key in keys:
        value = manifest.get(key)
        if isinstance(value, list):
            return [str(item) for item in value]
    return []


def read_entities(manifest: dict[str, Any]) -> set[str]:
    return set(_list(manifest, "read_entities", "readEntities"))


def subscription_entities(manifest: dict[str, Any]) -> set[str]:
    return set(_list(manifest, "subscriptions")) | read_entities(manifest)


def history_entities(manifest: dict[str, Any]) -> set[str]:
    return set(_list(manifest, "history"))


def camera_entities(manifest: dict[str, Any]) -> set[str]:
    return set(_list(manifest, "camera_snapshots", "cameraSnapshots"))


def action_scopes(manifest: dict[str, Any]) -> set[str]:
    return set(_list(manifest, "actions"))


def entity_allowed(entity_id: str, allowed: set[str]) -> bool:
    if entity_id in allowed or "*" in allowed:
        return True
    domain = entity_id.split(".", 1)[0] if "." in entity_id else ""
    return f"{domain}.*" in allowed


def action_allowed(manifest: dict[str, Any], domain: str, service: str, entity_id: str | None) -> bool:
    scopes = action_scopes(manifest)
    candidates = {f"{domain}.{service}@{entity_id}"} if entity_id else set()
    candidates.add(f"{domain}.*")
    if entity_id:
        candidates.add(f"*@{entity_id}")
    return bool(candidates & scopes)
