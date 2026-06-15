from __future__ import annotations

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant

from .const import DOMAIN
from .dashboard_export import build_dashboard_export
from .manifest import ManifestError
from .share_links import build_bearer_share_link, build_claim_share_link


def _relay(hass: HomeAssistant):
    for value in hass.data.get(DOMAIN, {}).values():
        if isinstance(value, dict) and "relay" in value:
            return value["relay"]
    raise RuntimeError("Varco is not loaded")


def _authority(hass: HomeAssistant):
    return _relay(hass).authority


def async_setup(hass: HomeAssistant) -> None:
    websocket_api.async_register_command(hass, websocket_info)
    websocket_api.async_register_command(hass, websocket_access_requests)
    websocket_api.async_register_command(hass, websocket_grants)
    websocket_api.async_register_command(hass, websocket_audit)
    websocket_api.async_register_command(hass, websocket_approve)
    websocket_api.async_register_command(hass, websocket_reject)
    websocket_api.async_register_command(hass, websocket_revoke)
    websocket_api.async_register_command(hass, websocket_delete_grant)
    websocket_api.async_register_command(hass, websocket_update_grant_restrictions)
    websocket_api.async_register_command(hass, websocket_create_preapproved_grant)
    websocket_api.async_register_command(hass, websocket_create_share)
    websocket_api.async_register_command(hass, websocket_dashboard_export)


@websocket_api.websocket_command({vol.Required("type"): "varco/info"})
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_info(hass: HomeAssistant, connection, msg) -> None:
    relay = _relay(hass)
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


@websocket_api.websocket_command({vol.Required("type"): "varco/approve_request", vol.Required("request_id"): str, vol.Optional("expires_at"): vol.Any(None, str), vol.Optional("approved_manifest"): vol.Any(None, dict)})
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_approve(hass: HomeAssistant, connection, msg) -> None:
    grant = await _authority(hass).approve_request(msg["request_id"], expires_at=msg.get("expires_at"), approved_manifest=msg.get("approved_manifest"))
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


@websocket_api.websocket_command({vol.Required("type"): "varco/delete_grant", vol.Required("grant_id"): str})
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_delete_grant(hass: HomeAssistant, connection, msg) -> None:
    grant = await _authority(hass).delete_grant(msg["grant_id"])
    connection.send_result(msg["id"], grant.as_dict())


@websocket_api.websocket_command({vol.Required("type"): "varco/create_preapproved_grant", vol.Required("manifest"): dict, vol.Optional("expires_at"): vol.Any(None, str), vol.Optional("restrictions", default=[]): list})
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_create_preapproved_grant(hass: HomeAssistant, connection, msg) -> None:
    try:
        grant, identity = await _authority(hass).create_preapproved_grant(msg["manifest"], expires_at=msg.get("expires_at"), restrictions=msg.get("restrictions"))
    except ManifestError as err:
        connection.send_error(msg["id"], "invalid_manifest", str(err))
        return
    relay = _relay(hass)
    share_url = build_bearer_share_link(relay.bridge_ws_url, relay.authority_id, grant.grant_id, identity["private_key"])
    connection.send_result(msg["id"], {"grant": grant.as_dict(), "consumer_private_key": identity["private_key"], "consumer_public_key": identity["public_key"], "share_url": share_url})


@websocket_api.websocket_command({vol.Required("type"): "varco/create_share", vol.Required("name"): str, vol.Required("manifest"): dict, vol.Optional("max_claims", default=1): int, vol.Optional("expires_at"): vol.Any(None, str), vol.Optional("restrictions", default=[]): list, vol.Optional("note"): vol.Any(None, str)})
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_create_share(hass: HomeAssistant, connection, msg) -> None:
    try:
        share, secret = await _authority(hass).create_share(msg["name"], msg["manifest"], max_claims=msg.get("max_claims", 1), expires_at=msg.get("expires_at"), restrictions=msg.get("restrictions"), note=msg.get("note"))
    except ManifestError as err:
        connection.send_error(msg["id"], "invalid_manifest", str(err))
        return
    relay = _relay(hass)
    share_url = build_claim_share_link(relay.bridge_ws_url, relay.authority_id, share.share_id, secret)
    connection.send_result(msg["id"], {"share": share.as_dict(include_secret_hash=False), "share_url": share_url})


@websocket_api.websocket_command({vol.Required("type"): "varco/update_grant_restrictions", vol.Required("grant_id"): str, vol.Required("restrictions"): list})
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_update_grant_restrictions(hass: HomeAssistant, connection, msg) -> None:
    grant = await _relay(hass).set_grant_restrictions(msg["grant_id"], msg["restrictions"])
    connection.send_result(msg["id"], grant.as_dict())


@websocket_api.websocket_command(
    {
        vol.Required("type"): "varco/dashboard_export",
        vol.Required("config"): dict,
        vol.Optional("selected_entities"): [str],
        vol.Optional("dashboard_title"): str,
        vol.Optional("dashboard_url_path"): vol.Any(None, str),
        vol.Optional("view_index"): vol.Any(None, int),
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_dashboard_export(hass: HomeAssistant, connection, msg) -> None:
    relay = _relay(hass)
    export = build_dashboard_export(
        msg["config"],
        hass=hass,
        authority_id=relay.authority_id,
        bridge_url=relay.bridge_ws_url,
        selected_entities=msg.get("selected_entities"),
        dashboard_title=msg.get("dashboard_title"),
        dashboard_url_path=msg.get("dashboard_url_path"),
        view_index=msg.get("view_index"),
    )
    connection.send_result(msg["id"], export)
