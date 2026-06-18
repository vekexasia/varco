"""Manifest validation and normalization.

Canonical manifest keys are snake_case. camelCase aliases (``readEntities``,
``cameraSnapshots``) are accepted on the wire for compatibility with already
deployed consumers, but the Authority stores only the canonical form.
"""
from __future__ import annotations

from typing import Any

import voluptuous as vol

# canonical snake_case key -> accepted camelCase alias
_SCOPE_ALIASES = {
    "read_entities": "readEntities",
    "subscriptions": None,
    "history": None,
    "camera_snapshots": "cameraSnapshots",
    "actions": None,
}

_SCOPE_LIST = vol.All([vol.All(str, vol.Length(min=1))], list)

_MANIFEST_SCHEMA = vol.Schema(
    {
        vol.Required("name"): vol.All(str, vol.Length(min=1)),
        vol.Optional("version"): str,
        vol.Optional("icon"): str,
        vol.Optional("read_entities"): _SCOPE_LIST,
        vol.Optional("readEntities"): _SCOPE_LIST,
        vol.Optional("subscriptions"): _SCOPE_LIST,
        vol.Optional("history"): _SCOPE_LIST,
        vol.Optional("camera_snapshots"): _SCOPE_LIST,
        vol.Optional("cameraSnapshots"): _SCOPE_LIST,
        vol.Optional("actions"): _SCOPE_LIST,
        vol.Optional("dashboard"): dict,
    },
    extra=vol.ALLOW_EXTRA,
)


class ManifestError(ValueError):
    """Raised when an inbound manifest fails strict validation."""


def validate_manifest(manifest: dict[str, Any]) -> dict[str, Any]:
    """Strictly validate an inbound manifest and return the canonical form.

    Rejects conflicting snake_case/camelCase aliases instead of silently
    dropping one. Unknown extra keys are tolerated on the wire but not stored.
    """
    try:
        validated = _MANIFEST_SCHEMA(manifest)
    except vol.Invalid as err:
        raise ManifestError(str(err)) from err
    for canonical, alias in _SCOPE_ALIASES.items():
        if alias and canonical in validated and alias in validated:
            raise ManifestError(f"conflicting manifest keys: {canonical} and {alias}")
    return _canonicalize(validated)


def coerce_manifest(manifest: dict[str, Any]) -> dict[str, Any]:
    """Leniently normalize a stored manifest to canonical snake_case.

    Used when loading persisted requests/grants that may predate strict
    validation. Never raises; snake_case wins if both spellings are present.
    """
    return _canonicalize(manifest)


def _canonicalize(manifest: dict[str, Any]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key in ("name", "version", "icon", "dashboard"):
        if key in manifest:
            result[key] = manifest[key]
    for canonical, alias in _SCOPE_ALIASES.items():
        value = manifest.get(canonical)
        if not isinstance(value, list) and alias:
            value = manifest.get(alias)
        if isinstance(value, list):
            result[canonical] = [str(item) for item in value]
    return result
