from __future__ import annotations

from typing import Any

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.data_entry_flow import FlowResult

from .const import DEFAULT_BRIDGE_WS_URL, DOMAIN, NAME

CONF_BRIDGE_WS_URL = "bridge_ws_url"
CONF_WEBRTC_ENABLED = "webrtc_enabled"


def _schema(defaults: dict[str, Any]) -> vol.Schema:
    return vol.Schema({
        vol.Required(CONF_BRIDGE_WS_URL, default=defaults.get(CONF_BRIDGE_WS_URL, DEFAULT_BRIDGE_WS_URL)): str,
        vol.Optional(CONF_WEBRTC_ENABLED, default=defaults.get(CONF_WEBRTC_ENABLED, True)): bool,
    })


def _normalize(user_input: dict[str, Any]) -> dict[str, Any]:
    return {
        CONF_BRIDGE_WS_URL: user_input.get(CONF_BRIDGE_WS_URL, DEFAULT_BRIDGE_WS_URL),
        CONF_WEBRTC_ENABLED: user_input.get(CONF_WEBRTC_ENABLED, True),
    }


class VarcoConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 1

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: config_entries.ConfigEntry) -> "VarcoOptionsFlow":
        return VarcoOptionsFlow()

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> FlowResult:
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")
        if user_input is not None:
            return self.async_create_entry(title=NAME, data=_normalize(user_input))
        return self.async_show_form(step_id="user", data_schema=_schema({}), errors={})

    async def async_step_import(self, user_input: dict[str, Any]) -> FlowResult:
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")
        return self.async_create_entry(title=NAME, data=_normalize(user_input))

    async def async_step_reconfigure(self, user_input: dict[str, Any] | None = None) -> FlowResult:
        entry = self._get_reconfigure_entry()
        if user_input is not None:
            return self.async_update_reload_and_abort(entry, data=_normalize(user_input))
        return self.async_show_form(step_id="reconfigure", data_schema=_schema(dict(entry.data)), errors={})


class VarcoOptionsFlow(config_entries.OptionsFlow):
    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> FlowResult:
        if user_input is not None:
            # Configuration lives in entry.data; keep options empty so a single
            # source of truth feeds the relay.
            self.hass.config_entries.async_update_entry(self.config_entry, data=_normalize(user_input))
            return self.async_create_entry(title="", data={})
        return self.async_show_form(step_id="init", data_schema=_schema(dict(self.config_entry.data)))
