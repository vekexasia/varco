from __future__ import annotations

import json
import re
from collections import defaultdict
from typing import Any

from .const import DEFAULT_BRIDGE_WS_URL

_ENTITY_RE = re.compile(r"^[a-z0-9_]+\.[a-z0-9_]+$")
_DYNAMIC_CARD_TYPES = {"area", "tile", "weather", "weather-forecast"}
_CAMERA_CARD_TYPES = {"camera", "picture-glance", "picture-entity"}
_HISTORY_CARD_TYPES = {"history-graph"}
_KEY_ATTRIBUTES = {
    "friendly_name",
    "unit_of_measurement",
    "device_class",
    "state_class",
    "icon",
    "entity_picture",
    "supported_features",
    "brightness",
    "color_mode",
    "current_position",
    "current_temperature",
    "temperature",
    "humidity",
    "battery_level",
}


def build_dashboard_export(
    config: dict[str, Any],
    *,
    hass: Any | None = None,
    authority_id: str = "",
    bridge_url: str = DEFAULT_BRIDGE_WS_URL,
    selected_entities: list[str] | None = None,
    dashboard_title: str | None = None,
    dashboard_url_path: str | None = None,
    view_index: int | None = None,
) -> dict[str, Any]:
    harvest = harvest_lovelace_config(config, view_index=view_index)
    available_entities = set(harvest["entities"])
    if selected_entities is None:
        selected = sorted(available_entities)
    else:
        selected = sorted(entity for entity in selected_entities if entity in available_entities)

    selected_set = set(selected)
    manifest = {
        "name": _manifest_name(dashboard_title, harvest["view_title"]),
        "version": "0.1.0",
        "read_entities": sorted(entity for entity in harvest["read_entities"] if entity in selected_set),
        "subscriptions": sorted(entity for entity in harvest["subscriptions"] if entity in selected_set),
        "history": sorted(entity for entity in harvest["history"] if entity in selected_set),
        "camera_snapshots": sorted(entity for entity in harvest["camera_snapshots"] if entity in selected_set),
        "actions": [],
    }
    catalog = entity_catalog(selected, harvest["references"], hass=hass)
    export = {
        "manifest": manifest,
        "catalog": catalog,
        "warnings": harvest["warnings"],
        "entities": [
            {
                "entity_id": entity_id,
                "domain": domain_of(entity_id),
                "references": harvest["references"].get(entity_id, []),
                "selected": entity_id in selected_set,
                "scopes": {
                    "read": entity_id in harvest["read_entities"],
                    "subscriptions": entity_id in harvest["subscriptions"],
                    "history": entity_id in harvest["history"],
                    "camera_snapshots": entity_id in harvest["camera_snapshots"],
                },
            }
            for entity_id in sorted(available_entities)
        ],
        "dashboard": {"title": dashboard_title or "Home Assistant dashboard", "url_path": dashboard_url_path, "view_title": harvest["view_title"]},
        "brief": "",
    }
    export["brief"] = render_brief(
        manifest,
        catalog,
        harvest["warnings"],
        authority_id=authority_id,
        bridge_url=bridge_url,
        dashboard_title=dashboard_title,
        dashboard_url_path=dashboard_url_path,
        view_title=harvest["view_title"],
    )
    return export


def harvest_lovelace_config(config: dict[str, Any], *, view_index: int | None = None) -> dict[str, Any]:
    refs: dict[str, list[dict[str, Any]]] = defaultdict(list)
    read_entities: set[str] = set()
    subscriptions: set[str] = set()
    history: set[str] = set()
    cameras: set[str] = set()
    warnings: list[dict[str, str]] = []

    views = config.get("views") if isinstance(config, dict) else []
    if not isinstance(views, list):
        warnings.append({"path": "views", "message": "Dashboard config has no views list to harvest."})
        views = []

    selected_views = []
    if view_index is not None:
        if 0 <= view_index < len(views):
            selected_views = [(view_index, views[view_index])]
        else:
            warnings.append({"path": f"views[{view_index}]", "message": "Selected view index was not found."})
    else:
        selected_views = list(enumerate(views))

    for index, view in selected_views:
        if not isinstance(view, dict):
            warnings.append({"path": f"views[{index}]", "message": "View config is not an object."})
            continue
        view_title = str(view.get("title") or view.get("path") or f"View {index + 1}")
        for card_index, card in enumerate(_as_list(view.get("cards"))):
            _walk_card(
                card,
                path=f"views[{index}].cards[{card_index}]",
                view_title=view_title,
                refs=refs,
                read_entities=read_entities,
                subscriptions=subscriptions,
                history=history,
                cameras=cameras,
                warnings=warnings,
            )
        for section_index, section in enumerate(_as_list(view.get("sections"))):
            if not isinstance(section, dict):
                continue
            for card_index, card in enumerate(_as_list(section.get("cards"))):
                _walk_card(
                    card,
                    path=f"views[{index}].sections[{section_index}].cards[{card_index}]",
                    view_title=view_title,
                    refs=refs,
                    read_entities=read_entities,
                    subscriptions=subscriptions,
                    history=history,
                    cameras=cameras,
                    warnings=warnings,
                )
        for badge_index, badge in enumerate(_as_list(view.get("badges"))):
            _walk_card(
                badge,
                path=f"views[{index}].badges[{badge_index}]",
                view_title=view_title,
                refs=refs,
                read_entities=read_entities,
                subscriptions=subscriptions,
                history=history,
                cameras=cameras,
                warnings=warnings,
            )

    all_entities = set(read_entities) | set(history) | set(cameras)
    single_view_title = None
    if len(selected_views) == 1 and isinstance(selected_views[0][1], dict):
        single_view_title = str(selected_views[0][1].get("title") or selected_views[0][1].get("path") or f"View {selected_views[0][0] + 1}")

    return {
        "entities": sorted(all_entities),
        "read_entities": sorted(read_entities),
        "subscriptions": sorted(subscriptions),
        "history": sorted(history),
        "camera_snapshots": sorted(cameras),
        "references": {entity: contexts for entity, contexts in refs.items()},
        "warnings": warnings,
        "view_title": single_view_title,
    }


def render_brief(
    manifest: dict[str, Any],
    catalog: list[dict[str, Any]],
    warnings: list[dict[str, str]],
    *,
    authority_id: str,
    bridge_url: str,
    dashboard_title: str | None,
    dashboard_url_path: str | None,
    view_title: str | None,
) -> str:
    manifest_json = json.dumps(manifest, indent=2, sort_keys=True)
    catalog_json = json.dumps(catalog, indent=2, sort_keys=True)
    warnings_json = json.dumps(warnings, indent=2, sort_keys=True)
    scope_defaults = _action_guidance(catalog)
    title = dashboard_title or "Home Assistant dashboard"
    if view_title:
        title = f"{title} / {view_title}"
    bootstrap = f"""import {{ createVarcoConsumerClient }} from \"@varco/client\";

const manifest = {manifest_json};

const client = createVarcoConsumerClient({{
  authorityId: \"{authority_id}\",
  bridgeUrl: \"{bridge_url}\",
  manifest,
}});

const access = await client.requestAccess();
console.log(access.pairing_code);
await client.connect();
"""
    return f"""# Varco consumer build brief: {title}

You are a coding agent building an external Varco consumer for the Home Assistant dashboard described below.

Use this brief to scaffold the consumer. The included manifest is a read-only blueprint harvested from Lovelace. Do not request a Home Assistant token and do not bypass Varco pairing. The owner will still approve or reject access in Home Assistant after the consumer requests this manifest.

Before finalizing the app, ask the user which entities need write or history capabilities. Start from the read-only manifest, then propose narrow action scopes only where the user confirms they are needed.

Suggested action defaults by domain:

{scope_defaults}

## Source

- Dashboard: {title}
- Dashboard URL path: {dashboard_url_path or "default Lovelace dashboard"}
- Export type: manifest blueprint, not a grant and not generated application code

## Security note

This bundle contains point-in-time Home Assistant state values. Treat it as private and do not share it blindly. Live values will change after export.

## Manifest JSON

```json
{manifest_json}
```

## Entity catalog

```json
{catalog_json}
```

## Unresolved or dynamic dashboard references

These items may require a user conversation because Varco did not deeply resolve dynamic Lovelace behavior:

```json
{warnings_json}
```

## Ready-to-run @varco/client bootstrap

```ts
{bootstrap}
```
"""


def entity_catalog(entity_ids: list[str], references: dict[str, list[dict[str, Any]]], *, hass: Any | None = None) -> list[dict[str, Any]]:
    return [_catalog_entry(entity_id, references.get(entity_id, []), hass=hass) for entity_id in sorted(entity_ids)]


def domain_of(entity_id: str) -> str:
    return entity_id.split(".", 1)[0] if "." in entity_id else ""


def _walk_card(
    card: Any,
    *,
    path: str,
    view_title: str,
    refs: dict[str, list[dict[str, Any]]],
    read_entities: set[str],
    subscriptions: set[str],
    history: set[str],
    cameras: set[str],
    warnings: list[dict[str, str]],
) -> None:
    if not isinstance(card, dict):
        warnings.append({"path": path, "message": "Card config is not an object."})
        return

    card_type = str(card.get("type") or "unknown")
    _warn_dynamic_card(card, path, card_type, warnings)
    context = {"view": view_title, "card_type": card_type, "path": path}

    direct_entities = _entity_refs_from_named_keys(card, warnings, path)
    for entity_id in direct_entities:
        read_entities.add(entity_id)
        subscriptions.add(entity_id)
        _add_reference(refs, entity_id, context)

    if card_type in _HISTORY_CARD_TYPES:
        for entity_id in direct_entities:
            history.add(entity_id)

    if card_type in _CAMERA_CARD_TYPES:
        camera_refs = list(direct_entities)
        camera_refs.extend(_entity_refs_from_value(card.get("camera_image"), warnings, f"{path}.camera_image"))
        for entity_id in camera_refs:
            if domain_of(entity_id) == "camera":
                cameras.add(entity_id)
                _add_reference(refs, entity_id, context)

    for key in ("cards", "elements"):
        for index, child in enumerate(_as_list(card.get(key))):
            _walk_card(
                child,
                path=f"{path}.{key}[{index}]",
                view_title=view_title,
                refs=refs,
                read_entities=read_entities,
                subscriptions=subscriptions,
                history=history,
                cameras=cameras,
                warnings=warnings,
            )
    for index, child in enumerate(_as_list(card.get("card"))):
        _walk_card(
            child,
            path=f"{path}.card[{index}]",
            view_title=view_title,
            refs=refs,
            read_entities=read_entities,
            subscriptions=subscriptions,
            history=history,
            cameras=cameras,
            warnings=warnings,
        )


def _entity_refs_from_named_keys(card: dict[str, Any], warnings: list[dict[str, str]], path: str) -> list[str]:
    result: list[str] = []
    for key, value in card.items():
        child_path = f"{path}.{key}"
        if key in {"card", "cards", "elements"}:
            continue
        if key in {"entity", "entities"}:
            result.extend(_entity_refs_from_value(value, warnings, child_path))
            continue
        if isinstance(value, dict):
            result.extend(_entity_refs_from_named_keys(value, warnings, child_path))
        elif isinstance(value, list):
            for index, item in enumerate(value):
                if isinstance(item, dict):
                    result.extend(_entity_refs_from_named_keys(item, warnings, f"{child_path}[{index}]"))
    return sorted(set(result))


def _entity_refs_from_value(value: Any, warnings: list[dict[str, str]], path: str) -> list[str]:
    result: list[str] = []
    if value is None:
        return result
    if isinstance(value, str):
        if _ENTITY_RE.match(value):
            result.append(value)
        elif "{{" in value or "[[" in value:
            warnings.append({"path": path, "message": "Template entity reference could not be resolved."})
        return result
    if isinstance(value, list):
        for index, item in enumerate(value):
            result.extend(_entity_refs_from_value(item, warnings, f"{path}[{index}]"))
        return result
    if isinstance(value, dict):
        if "entity" in value:
            result.extend(_entity_refs_from_value(value.get("entity"), warnings, f"{path}.entity"))
        elif "type" in value and str(value.get("type", "")).startswith("custom:"):
            warnings.append({"path": path, "message": f"Custom entity row {value.get('type')} was not deeply resolved."})
        return result
    return result


def _warn_dynamic_card(card: dict[str, Any], path: str, card_type: str, warnings: list[dict[str, str]]) -> None:
    if card_type.startswith("custom:"):
        warnings.append({"path": path, "message": f"Custom card {card_type} was not deeply resolved."})
    if card_type == "auto-entities" or "auto-entities" in card_type:
        warnings.append({"path": path, "message": "auto-entities card filters were not resolved."})
    if card_type in _DYNAMIC_CARD_TYPES:
        warnings.append({"path": path, "message": f"{card_type} card may resolve entities dynamically."})
    if any(isinstance(value, str) and "{{" in value for value in card.values()):
        warnings.append({"path": path, "message": "Template content on this card was not resolved."})


def _catalog_entry(entity_id: str, references: list[dict[str, Any]], *, hass: Any | None = None) -> dict[str, Any]:
    state = _state_for(hass, entity_id)
    attrs = _state_attributes(state)
    friendly_name = attrs.get("friendly_name") or entity_id
    snapshot = {
        "state": _state_value(state),
        "attributes": {key: attrs[key] for key in sorted(attrs) if key in _KEY_ATTRIBUTES},
        "unit_of_measurement": attrs.get("unit_of_measurement"),
        "device_class": attrs.get("device_class"),
    }
    return {
        "entity_id": entity_id,
        "domain": domain_of(entity_id),
        "friendly_name": friendly_name,
        "referencing_card_types": sorted({str(ref.get("card_type")) for ref in references}),
        "references": references,
        "state_snapshot": snapshot,
    }


def _state_for(hass: Any | None, entity_id: str) -> Any:
    if hass is None or not hasattr(hass, "states"):
        return None
    states = hass.states
    if hasattr(states, "get"):
        return states.get(entity_id)
    return None


def _state_attributes(state: Any) -> dict[str, Any]:
    if state is None:
        return {}
    if isinstance(state, dict):
        return dict(state.get("attributes") or {})
    return dict(getattr(state, "attributes", {}) or {})


def _state_value(state: Any) -> Any:
    if state is None:
        return None
    if isinstance(state, dict):
        return state.get("state")
    return getattr(state, "state", None)


def _add_reference(refs: dict[str, list[dict[str, Any]]], entity_id: str, context: dict[str, Any]) -> None:
    if context not in refs[entity_id]:
        refs[entity_id].append(dict(context))


def _as_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


def _manifest_name(dashboard_title: str | None, view_title: str | None) -> str:
    parts = [part for part in (dashboard_title or "Home Assistant dashboard", view_title) if part]
    return " / ".join(parts)


def _action_guidance(catalog: list[dict[str, Any]]) -> str:
    domains = sorted({entry.get("domain") for entry in catalog if entry.get("domain")})
    if not domains:
        return "- No entities were selected, so no action scopes are suggested."
    lines = []
    for domain in domains:
        if domain == "light":
            lines.append("- lights: ask before adding `light.turn_on@ENTITY`, `light.turn_off@ENTITY`, or `light.toggle@ENTITY`.")
        elif domain == "cover":
            lines.append("- covers: ask before adding `cover.open_cover@ENTITY`, `cover.close_cover@ENTITY`, or `cover.stop_cover@ENTITY`.")
        elif domain == "switch":
            lines.append("- switches: ask before adding `switch.turn_on@ENTITY`, `switch.turn_off@ENTITY`, or `switch.toggle@ENTITY`.")
        elif domain == "lock":
            lines.append("- locks: treat `lock.unlock@ENTITY` as sensitive and ask explicitly before including it.")
        elif domain == "button":
            lines.append("- buttons: ask before adding `button.press@ENTITY`.")
        elif domain == "climate":
            lines.append("- climate: ask for the exact operations needed, such as `climate.set_temperature@ENTITY`.")
    if not lines:
        lines.append("- For every selected entity, ask the user before adding any `domain.service@entity_id` action scope.")
    return "\n".join(lines)
