from __future__ import annotations

from typing import Any

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.data_entry_flow import FlowResult

from .const import DEFAULT_BRIDGE_WS_URL, DEFAULT_CLIENT_BASE_URL, DOMAIN, NAME
from .crypto import generate_authority_keypair

CONF_BRIDGE_WS_URL = "bridge_ws_url"
CONF_CLIENT_BASE_URL = "client_base_url"


class VarcoConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> FlowResult:
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")
        if user_input is not None:
            identity = generate_authority_keypair()
            return self.async_create_entry(title=NAME, data={**user_input, **identity})
        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema({
                vol.Required(CONF_BRIDGE_WS_URL, default=DEFAULT_BRIDGE_WS_URL): str,
                vol.Required(CONF_CLIENT_BASE_URL, default=DEFAULT_CLIENT_BASE_URL): str,
            }),
            errors={},
        )
