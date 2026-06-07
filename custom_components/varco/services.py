from __future__ import annotations

import voluptuous as vol

from .authority import VarcoAuthority
from .const import DOMAIN

_SCHEMA_REQUEST = vol.Schema({vol.Required("request_id"): str})
_SCHEMA_GRANT = vol.Schema({vol.Required("grant_id"): str})


def _authority(hass) -> VarcoAuthority:
    domain_data = hass.data.get(DOMAIN, {})
    for value in domain_data.values():
        if isinstance(value, dict) and "relay" in value:
            return value["relay"].authority
    raise RuntimeError("Varco is not loaded")


async def async_setup_services(hass) -> None:
    if hass.services.has_service(DOMAIN, "approve_request"):
        return

    async def approve(call):
        await _authority(hass).approve_request(call.data["request_id"])

    async def reject(call):
        await _authority(hass).reject_request(call.data["request_id"])

    async def revoke(call):
        await _authority(hass).revoke_grant(call.data["grant_id"])

    async def delete(call):
        await _authority(hass).delete_grant(call.data["grant_id"])

    hass.services.async_register(DOMAIN, "approve_request", approve, schema=_SCHEMA_REQUEST)
    hass.services.async_register(DOMAIN, "reject_request", reject, schema=_SCHEMA_REQUEST)
    hass.services.async_register(DOMAIN, "revoke_grant", revoke, schema=_SCHEMA_GRANT)
    hass.services.async_register(DOMAIN, "delete_grant", delete, schema=_SCHEMA_GRANT)
