from __future__ import annotations

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant

from .const import DOMAIN


def _authority(hass: HomeAssistant):
    for value in hass.data.get(DOMAIN, {}).values():
        if isinstance(value, dict) and "relay" in value:
            return value["relay"].authority
    raise RuntimeError("Varco is not loaded")


def async_setup(hass: HomeAssistant) -> None:
    websocket_api.async_register_command(hass, websocket_info)
    websocket_api.async_register_command(hass, websocket_access_requests)
    websocket_api.async_register_command(hass, websocket_grants)
    websocket_api.async_register_command(hass, websocket_audit)
    websocket_api.async_register_command(hass, websocket_approve)
    websocket_api.async_register_command(hass, websocket_reject)
    websocket_api.async_register_command(hass, websocket_revoke)


@websocket_api.websocket_command({vol.Required("type"): "varco/info"})
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_info(hass: HomeAssistant, connection, msg) -> None:
    relay = next(value["relay"] for value in hass.data.get(DOMAIN, {}).values() if isinstance(value, dict) and "relay" in value)
    connection.send_result(msg["id"], {"authority_id": relay.authority_id, "relay": relay.status})


@websocket_api.websocket_command({vol.Required("type"): "varco/access_requests"})
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_access_requests(hass: HomeAssistant, connection, msg) -> None:
    requests = await _authority(hass).store.async_list_access_requests()
    connection.send_result(msg["id"], [request.as_dict() for request in requests])


@websocket_api.websocket_command({vol.Required("type"): "varco/grants"})
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_grants(hass: HomeAssistant, connection, msg) -> None:
    grants = await _authority(hass).store.async_list_grants()
    connection.send_result(msg["id"], [grant.as_dict() for grant in grants])


@websocket_api.websocket_command({vol.Required("type"): "varco/audit"})
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_audit(hass: HomeAssistant, connection, msg) -> None:
    connection.send_result(msg["id"], await _authority(hass).store.async_audit_events())


@websocket_api.websocket_command({vol.Required("type"): "varco/approve_request", vol.Required("request_id"): str})
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_approve(hass: HomeAssistant, connection, msg) -> None:
    grant = await _authority(hass).approve_request(msg["request_id"])
    connection.send_result(msg["id"], grant.as_dict())


@websocket_api.websocket_command({vol.Required("type"): "varco/reject_request", vol.Required("request_id"): str})
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_reject(hass: HomeAssistant, connection, msg) -> None:
    await _authority(hass).reject_request(msg["request_id"])
    connection.send_result(msg["id"], {"ok": True})


@websocket_api.websocket_command({vol.Required("type"): "varco/revoke_grant", vol.Required("grant_id"): str})
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_revoke(hass: HomeAssistant, connection, msg) -> None:
    grant = await _authority(hass).revoke_grant(msg["grant_id"])
    connection.send_result(msg["id"], grant.as_dict())
