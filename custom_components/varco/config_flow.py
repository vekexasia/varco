from __future__ import annotations

from typing import Any

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.data_entry_flow import FlowResult

from .const import DEFAULT_BRIDGE_WS_URL, DOMAIN, NAME
from .crypto import generate_authority_keypair

CONF_BRIDGE_WS_URL = "bridge_ws_url"
CONF_WEBRTC_ENABLED = "webrtc_enabled"


class VarcoConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> FlowResult:
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")
        if user_input is not None:
            return self._create_entry(user_input)
        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema({
                vol.Required(CONF_BRIDGE_WS_URL, default=DEFAULT_BRIDGE_WS_URL): str,
                vol.Optional(CONF_WEBRTC_ENABLED, default=True): bool,
            }),
            errors={},
        )

    async def async_step_import(self, user_input: dict[str, Any]) -> FlowResult:
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")
        return self._create_entry(user_input)

    def _create_entry(self, user_input: dict[str, Any]) -> FlowResult:
        identity = generate_authority_keypair()
        data = {
            CONF_BRIDGE_WS_URL: user_input.get(CONF_BRIDGE_WS_URL, DEFAULT_BRIDGE_WS_URL),
            CONF_WEBRTC_ENABLED: user_input.get(CONF_WEBRTC_ENABLED, True),
            **identity,
        }
        return self.async_create_entry(title=NAME, data=data)
