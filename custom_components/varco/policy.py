from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, time, timezone
from typing import Any

from .models import Grant, verify_pin


@dataclass(frozen=True)
class RestrictionDecision:
    allowed: bool
    restriction_id: str | None = None
    reason: str | None = None


def _list(manifest: dict[str, Any], key: str) -> list[str]:
    # Manifests are normalized to canonical snake_case at the access_request
    # boundary (manifest.validate_manifest) and on storage load (coerce_manifest).
    value = manifest.get(key)
    if isinstance(value, list):
        return [str(item) for item in value]
    return []


SCOPE_KEY_ALIASES: tuple[tuple[str, ...], ...] = (
    ("read_entities", "readEntities"),
    ("subscriptions",),
    ("history",),
    ("camera_snapshots", "cameraSnapshots"),
    ("actions",),
)


def trim_manifest(requested: dict[str, Any], approved: dict[str, Any]) -> dict[str, Any]:
    """Intersect the requested manifest scope lists with an owner-approved subset.

    Non-scope keys (name, version, ...) are kept from the requested manifest.
    Approved values not present in the request are dropped; scope categories
    missing from ``approved`` become empty.
    """

    trimmed = dict(requested)
    for keys in SCOPE_KEY_ALIASES:
        requested_values: list[str] = []
        approved_values: set[str] = set()
        for key in keys:
            for value in _list(requested, key):
                if value not in requested_values:
                    requested_values.append(value)
            approved_values.update(_list(approved, key))
        for key in keys:
            trimmed.pop(key, None)
        trimmed[keys[0]] = [value for value in requested_values if value in approved_values]
    return trimmed


def read_entities(manifest: dict[str, Any]) -> set[str]:
    return set(_list(manifest, "read_entities"))


def subscription_entities(manifest: dict[str, Any]) -> set[str]:
    return set(_list(manifest, "subscriptions")) | read_entities(manifest)


def history_entities(manifest: dict[str, Any]) -> set[str]:
    return set(_list(manifest, "history"))


def camera_entities(manifest: dict[str, Any]) -> set[str]:
    return set(_list(manifest, "camera_snapshots"))


def action_scopes(manifest: dict[str, Any]) -> set[str]:
    return set(_list(manifest, "actions"))


def entity_allowed(entity_id: str, allowed: set[str]) -> bool:
    if entity_id in allowed or "*" in allowed:
        return True
    domain = entity_id.split(".", 1)[0] if "." in entity_id else ""
    return f"{domain}.*" in allowed


def action_allowed(manifest: dict[str, Any], domain: str, service: str, entity_id: str | None) -> bool:
    scopes = action_scopes(manifest)
    candidates = action_candidates(domain, service, entity_id)
    return bool(candidates & scopes)


def action_candidates(domain: str, service: str, entity_id: str | None) -> set[str]:
    if not entity_id:
        # Entity-less calls are domain-wide; only an explicit domain.* scope allows them.
        return {f"{domain}.*"}
    candidates = {f"{domain}.{service}@{entity_id}", f"{domain}.*@{entity_id}", f"*@{entity_id}"}
    entity_domain = entity_id.split(".", 1)[0] if "." in entity_id else ""
    if entity_domain == domain:
        candidates.add(f"{domain}.*")
    return candidates


def evaluate_restrictions(
    grant: Grant,
    operation: str,
    context: dict[str, Any],
    *,
    now: datetime | None = None,
) -> RestrictionDecision:
    """Return whether all enabled restrictions matching this operation allow it."""

    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)

    for restriction in grant.restrictions:
        if not restriction.get("enabled", True):
            continue
        if not restriction_matches(restriction, operation, context):
            continue
        decision = _evaluate_restriction(restriction, context, now)
        if not decision.allowed:
            return decision
    return RestrictionDecision(True)


def restriction_matches(restriction: dict[str, Any], operation: str, context: dict[str, Any]) -> bool:
    applies_to = restriction.get("applies_to") or "grant"
    if isinstance(applies_to, list):
        return any(_selector_matches(str(selector), operation, context) for selector in applies_to)
    if isinstance(applies_to, dict):
        op = applies_to.get("operation")
        if op and not _selector_matches(str(op), operation, context):
            return False
        selectors = applies_to.get("actions") or applies_to.get("scopes")
        if selectors:
            if isinstance(selectors, str):
                selectors = [selectors]
            return any(_selector_matches(str(selector), operation, context) for selector in selectors)
        entities = applies_to.get("entities")
        if entities:
            if isinstance(entities, str):
                entities = [entities]
            targets = context.get("entity_ids") or []
            if isinstance(targets, str):
                targets = [targets]
            return any(entity_allowed(str(entity), set(map(str, entities))) for entity in targets)
        return True
    return _selector_matches(str(applies_to), operation, context)


def _selector_matches(selector: str, operation: str, context: dict[str, Any]) -> bool:
    selector = selector.strip()
    normalized = selector.lower()
    if normalized in {"grant", "*"}:
        return True
    if normalized in {"read", "reads", "get_states"}:
        return operation == "read"
    if normalized in {"subscribe", "subscription", "subscriptions", "subscribe_states"}:
        return operation == "subscribe"
    if normalized in {"history", "history_query"}:
        return operation == "history"
    if normalized in {"camera", "camera_snapshot", "camera_snapshots"}:
        return operation == "camera"
    if normalized in {"action", "actions", "write", "writes", "call_service"}:
        return operation == "action"
    if operation == "action":
        candidates: set[str] = set()
        for entity_id in context.get("entity_ids") or [None]:
            candidates |= action_candidates(str(context.get("domain") or ""), str(context.get("service") or ""), entity_id)
        return selector in candidates
    return False


def _evaluate_restriction(restriction: dict[str, Any], context: dict[str, Any], now: datetime) -> RestrictionDecision:
    typ = str(restriction.get("type") or "").lower()
    restriction_id = str(restriction.get("id") or typ or "restriction")
    params = restriction.get("params") if isinstance(restriction.get("params"), dict) else {}

    if typ in {"expiry", "expires_at", "ttl"}:
        expires_at = _parse_datetime(params.get("expires_at") or restriction.get("expires_at"))
        if expires_at is None:
            return RestrictionDecision(False, restriction_id, "invalid_expiry")
        if now >= expires_at:
            return RestrictionDecision(False, restriction_id, "expired")
        return RestrictionDecision(True)

    if typ in {"schedule", "time_window"}:
        if not _schedule_allows(params, now):
            return RestrictionDecision(False, restriction_id, "outside_schedule")
        return RestrictionDecision(True)

    if typ == "pin":
        pin_hash = params.get("pin_hash") or restriction.get("pin_hash")
        if not isinstance(pin_hash, str) or not pin_hash:
            return RestrictionDecision(False, restriction_id, "pin_not_configured")
        provided = _pin_for_restriction(context, restriction_id)
        if provided is None:
            return RestrictionDecision(False, restriction_id, "pin_required")
        if not verify_pin(str(provided), pin_hash):
            return RestrictionDecision(False, restriction_id, "invalid_pin")
        return RestrictionDecision(True)

    # Stateful rate limits and hass-bound template conditions are evaluated by
    # VarcoAuthority after stateless checks.
    if typ in {"rate_limit", "cooldown", "template"}:
        return RestrictionDecision(True)

    return RestrictionDecision(False, restriction_id, "unknown_restriction_type")


def _pin_for_restriction(context: dict[str, Any], restriction_id: str) -> Any | None:
    pins = context.get("pins")
    if isinstance(pins, dict) and restriction_id in pins:
        return pins[restriction_id]
    return context.get("pin")


def rate_limit_restrictions(grant: Grant, operation: str, context: dict[str, Any]) -> list[dict[str, Any]]:
    matches = []
    for restriction in grant.restrictions:
        if not restriction.get("enabled", True):
            continue
        if str(restriction.get("type") or "").lower() not in {"rate_limit", "cooldown"}:
            continue
        if restriction_matches(restriction, operation, context):
            matches.append(restriction)
    return matches


def template_restrictions(grant: Grant, operation: str, context: dict[str, Any]) -> list[dict[str, Any]]:
    matches = []
    for restriction in grant.restrictions:
        if not restriction.get("enabled", True):
            continue
        if str(restriction.get("type") or "").lower() != "template":
            continue
        if restriction_matches(restriction, operation, context):
            matches.append(restriction)
    return matches


def _parse_datetime(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _schedule_allows(params: dict[str, Any], now: datetime) -> bool:
    days = params.get("days")
    if days:
        allowed_days = {_normalize_day(day) for day in days if _normalize_day(day) is not None}
        if now.weekday() not in allowed_days:
            return False

    start = _parse_time(params.get("start_time") or params.get("start"))
    end = _parse_time(params.get("end_time") or params.get("end"))
    if start is None and end is None:
        return True
    if start is None or end is None:
        return False

    current = now.timetz().replace(tzinfo=None)
    if start <= end:
        return start <= current <= end
    return current >= start or current <= end


def _parse_time(value: Any) -> time | None:
    if not isinstance(value, str):
        return None
    parts = value.split(":")
    if len(parts) < 2:
        return None
    try:
        return time(int(parts[0]), int(parts[1]))
    except ValueError:
        return None


def _normalize_day(value: Any) -> int | None:
    if isinstance(value, int) and 0 <= value <= 6:
        return value
    names = {"mon": 0, "tue": 1, "wed": 2, "thu": 3, "fri": 4, "sat": 5, "sun": 6}
    text = str(value).strip().lower()[:3]
    return names.get(text)
