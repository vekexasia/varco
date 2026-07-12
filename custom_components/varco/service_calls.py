from __future__ import annotations

from typing import Any, Callable

from . import audit
from .models import Grant
from .policy import action_allowed


def _service_target_values(target: dict[str, Any], service_data: dict[str, Any], key: str) -> list[str]:
    values: list[str] = []
    for source in (target.get(key), service_data.get(key)):
        if isinstance(source, list):
            values.extend(str(item) for item in source)
        elif source:
            values.append(str(source))
    return list(dict.fromkeys(values))


def _resolve_non_entity_targets(
    hass: Any | None,
    target: dict[str, Any],
    service_data: dict[str, Any],
    registry_modules: Callable[[], tuple[Any, Any, Any, Any]],
) -> list[str] | None:
    """Resolve area/device/label targets to the entity ids they reference."""
    area_ids = _service_target_values(target, service_data, "area_id")
    device_ids = _service_target_values(target, service_data, "device_id")
    label_ids = _service_target_values(target, service_data, "label_id")
    if not (area_ids or device_ids or label_ids):
        return []
    if hass is None:
        return None
    try:
        area_registry, device_registry, entity_registry, label_registry = registry_modules()
        area_reg = area_registry.async_get(hass)
        dev_reg = device_registry.async_get(hass)
        ent_reg = entity_registry.async_get(hass)
        label_reg = label_registry.async_get(hass)
    except Exception:
        return None
    if any(area_reg.async_get_area(area_id) is None for area_id in area_ids):
        return None
    if any(dev_reg.async_get(device_id) is None for device_id in device_ids):
        return None
    if any(label_reg.async_get_label(label_id) is None for label_id in label_ids):
        return None
    resolved_devices = set(device_ids)
    entities: list[str] = []
    for area_id in area_ids:
        resolved_devices.update(entry.id for entry in device_registry.async_entries_for_area(dev_reg, area_id))
        entities.extend(entry.entity_id for entry in entity_registry.async_entries_for_area(ent_reg, area_id))
    for label_id in label_ids:
        resolved_devices.update(entry.id for entry in device_registry.async_entries_for_label(dev_reg, label_id))
        entities.extend(entry.entity_id for entry in entity_registry.async_entries_for_label(ent_reg, label_id))
    for device_id in sorted(resolved_devices):
        entities.extend(entry.entity_id for entry in entity_registry.async_entries_for_device(ent_reg, device_id, include_disabled_entities=True))
    return list(dict.fromkeys(entities))


async def call_service(
    authority: Any,
    grant: Grant,
    message: dict[str, Any],
    registry_modules: Callable[[], tuple[Any, Any, Any, Any]],
) -> dict[str, Any]:
    domain = str(message.get("domain") or "")
    service = str(message.get("service") or "")
    service_data = dict(message.get("service_data") or {})
    target = message.get("target") if isinstance(message.get("target"), dict) else {}
    resolved = _resolve_non_entity_targets(authority.hass, target, service_data, registry_modules)
    if resolved is None:
        await audit.async_log(authority.store, "permission_error", grant.grant_id, {"operation": "call_service", "domain": domain, "service": service, "reason": "unresolved_target"})
        return authority._error(message.get("request_id"), "permission_denied", "Service call not allowed")
    entity_ids = list(dict.fromkeys(_service_target_values(target, service_data, "entity_id") + resolved))
    if entity_ids:
        denied = [entity for entity in entity_ids if not action_allowed(grant.manifest, domain, service, entity)]
    elif action_allowed(grant.manifest, domain, service, None):
        denied = []
    else:
        denied = [None]
    if denied:
        await audit.async_log(authority.store, "permission_error", grant.grant_id, {"operation": "call_service", "domain": domain, "service": service, "reason": "unauthorized_entity", "denied_count": len(denied)})
        return authority._error(message.get("request_id"), "permission_denied", "Service call not allowed")
    context = {"domain": domain, "service": service, "entity_ids": entity_ids, "pin": message.get("pin"), "pins": message.get("pins")}
    restriction_error = await authority._enforce_restrictions(grant, "action", context, message)
    if restriction_error:
        return restriction_error
    if authority.hass is not None and hasattr(authority.hass, "services"):
        await authority.hass.services.async_call(domain, service, service_data, target=target, blocking=True)
    await audit.async_log(authority.store, "call_service", grant.grant_id, {"domain": domain, "service": service, "entity_count": len(entity_ids)})
    return {"type": "service_called", "request_id": message.get("request_id"), "ok": True}
