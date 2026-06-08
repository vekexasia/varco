from __future__ import annotations

from .const import DEFAULT_BRIDGE_WS_URL, DOMAIN

try:
    import voluptuous as vol
    from homeassistant.helpers import config_validation as cv
except ModuleNotFoundError:
    vol = None
    cv = None

CONF_BRIDGE_WS_URL = "bridge_ws_url"
CONF_WEBRTC_ENABLED = "webrtc_enabled"

if vol is not None and cv is not None:
    CONFIG_SCHEMA = vol.Schema(
        {
            DOMAIN: vol.Schema(
                {
                    vol.Optional(CONF_BRIDGE_WS_URL, default=DEFAULT_BRIDGE_WS_URL): cv.string,
                    vol.Optional(CONF_WEBRTC_ENABLED, default=True): cv.boolean,
                }
            )
        },
        extra=vol.ALLOW_EXTRA,
    )
else:
    CONFIG_SCHEMA = None

PLATFORMS: list[str] = []


async def async_setup(hass, config) -> bool:
    entries = hass.config_entries.async_entries(DOMAIN)
    if DOMAIN in config and not entries:
        from .crypto import generate_authority_keypair

        entry_data = {**dict(config[DOMAIN]), **generate_authority_keypair()}
        await _async_setup_authority(hass, "yaml", entry_data)
    else:
        for entry in entries:
            await _async_setup_authority(hass, entry.entry_id, entry.data)
    return True


async def async_setup_entry(hass, entry) -> bool:
    return await _async_setup_authority(hass, entry.entry_id, entry.data)


async def _async_setup_authority(hass, entry_id: str, entry_data: dict) -> bool:
    from .relay import VarcoRelay
    from .services import async_setup_services
    from .websocket_api import async_setup as async_setup_websocket
    from .storage import HomeAssistantVarcoStore

    hass.data.setdefault(DOMAIN, {})
    if entry_id in hass.data[DOMAIN]:
        return True
    store = HomeAssistantVarcoStore(hass)
    relay = VarcoRelay(hass, entry_data, store)
    hass.data[DOMAIN][entry_id] = {"store": store, "relay": relay}
    await async_setup_services(hass)
    if not hass.data[DOMAIN].get("websocket_registered"):
        async_setup_websocket(hass)
        hass.data[DOMAIN]["websocket_registered"] = True
    await _async_register_panel(hass)
    await relay.async_start()
    return True

async def async_unload_entry(hass, entry) -> bool:
    data = hass.data.get(DOMAIN, {}).pop(entry.entry_id, None)
    if data:
        await data["relay"].async_stop()
    return True


async def _async_register_panel(hass) -> None:
    if hass.data[DOMAIN].get("frontend_registered"):
        return
    import os
    from homeassistant.components import panel_custom
    from homeassistant.components.http import StaticPathConfig

    frontend_dir = os.path.join(os.path.dirname(__file__), "frontend")
    await hass.http.async_register_static_paths([StaticPathConfig(f"/{DOMAIN}_frontend", frontend_dir, cache_headers=False)])
    await panel_custom.async_register_panel(
        hass,
        webcomponent_name="varco-panel",
        frontend_url_path="varco",
        sidebar_title="Varco",
        sidebar_icon="mdi:shield-home",
        module_url=f"/{DOMAIN}_frontend/panel.js",
        embed_iframe=False,
        require_admin=True,
        config_panel_domain=DOMAIN,
    )
    hass.data[DOMAIN]["frontend_registered"] = True
