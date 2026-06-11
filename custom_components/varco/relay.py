from __future__ import annotations

import asyncio
import time
import json
import logging
from dataclasses import dataclass
from typing import Any

from aiohttp import WSMsgType
from homeassistant.components import persistent_notification
from homeassistant.core import callback
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .authority import VarcoAuthority
from .crypto import SecureServerSession, sign_challenge
from .models import AccessRequest
from .storage import HomeAssistantVarcoStore
from .webrtc import create_peer_stack_or_none

_LOGGER = logging.getLogger(__name__)

# Response types a signaling-only bridge still relays: pairing, session auth,
# WebRTC negotiation, and errors (which only arise from signaling messages on
# such a bridge, since consumer data-plane ciphertext never reaches us there).
# The lane tag is envelope metadata visible to the bridge; the payload stays
# encrypted.
SIGNALING_RESPONSE_TYPES = {
    "access_request_pending",
    "authenticated",
    "webrtc_answer",
    "webrtc_ice_ack",
    "webrtc_unavailable",
    "error",
}
SIGNALING_ONLY_ERROR = "Bridge is signaling-only: relay data disabled"

# Bridge handshake protocol version. The bridge advertises its version in the
# challenge message and the auth reply declares ours; a mismatch is terminal.
PROTO_VERSION = 1

# Close codes that are deterministic rejections: reconnecting with the same
# key and code can never succeed, so after a few attempts the relay slows to
# a long retry interval and raises a persistent notification instead of
# hammering the bridge (and its Cloudflare request quota).
TERMINAL_CLOSE_CODES = {
    4401: "the bridge rejected authentication (4401 auth required)",
    4403: "the bridge rejected this authority (4403: bad signature or not allowlisted)",
    4406: "the bridge does not support this protocol version (4406); update the Varco integration",
}
TERMINAL_AFTER_ATTEMPTS = 3


@dataclass
class BridgeSession:
    session_id: str
    secure: SecureServerSession | None = None


class VarcoRelay:
    def __init__(self, hass, entry_data: dict[str, Any], store: HomeAssistantVarcoStore) -> None:
        self.hass = hass
        self.entry_data = entry_data
        self.store = store
        self.peer_stack = create_peer_stack_or_none() if entry_data.get("webrtc_enabled", True) else None
        self.authority = VarcoAuthority(store=store, hass=hass, notify_owner=self._notify_owner, peer_stack=self.peer_stack)
        self.authority_id = entry_data["authority_id"]
        self.private_key = entry_data["private_key"]
        self.bridge_ws_url = entry_data["bridge_ws_url"].rstrip("/")
        self.sessions: dict[str, BridgeSession] = {}
        self.status: dict[str, Any] = {"connected": False, "last_error": None}
        self._task: asyncio.Task | None = None
        # Base reconnect delay in seconds; exposed for tests.
        self._reconnect_initial_delay = 1.0
        # Retry interval once a terminal rejection is detected; exposed for tests.
        self._terminal_retry_delay = 3600.0
        self._terminal_failures = 0
        self._terminal_reason: str | None = None
        self._stop_event = asyncio.Event()
        self._ws: Any = None
        self._state_unsub: Any = None

    async def async_start(self) -> None:
        self._stop_event.clear()
        create_task = getattr(self.hass, "async_create_background_task", self.hass.async_create_task)
        self._task = create_task(self._run(), "varco_relay")
        if self._state_unsub is None:
            self._state_unsub = self.hass.bus.async_listen("state_changed", self._on_state_changed)

    async def async_stop(self) -> None:
        self._stop_event.set()
        if self._state_unsub is not None:
            self._state_unsub()
            self._state_unsub = None
        if self._ws is not None:
            await self._ws.close()
        if self.peer_stack is not None:
            await self.peer_stack.close_all()
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    async def _run(self) -> None:
        delay = self._reconnect_initial_delay
        session = async_get_clientsession(self.hass)
        while not self._stop_event.is_set():
            started = time.monotonic()
            close_code = None
            try:
                close_code = await self._connect(session)
            except asyncio.CancelledError:
                raise
            except Exception as err:
                self.status.update({"connected": False, "last_error": str(err)})
                _LOGGER.warning("Varco relay disconnected: %s", err)
            if self._stop_event.is_set():
                break
            reason = self._terminal_reason
            self._terminal_reason = None
            if reason is None and close_code in TERMINAL_CLOSE_CODES:
                self._terminal_failures += 1
                if self._terminal_failures >= TERMINAL_AFTER_ATTEMPTS:
                    reason = TERMINAL_CLOSE_CODES[close_code]
            if reason is not None:
                self._notify_terminal(reason)
                wait = self._terminal_retry_delay
                delay = self._reconnect_initial_delay
            else:
                # Always wait before reconnecting, including after clean WebSocket
                # closes (e.g. the bridge replacing this connection with 4409).
                # Reconnecting immediately on clean closes caused a tight loop that
                # exhausted the Cloudflare Durable Objects free-tier request volume.
                if time.monotonic() - started >= 60:
                    delay = self._reconnect_initial_delay
                wait = delay
                delay = min(delay * 2, 60)
            try:
                await asyncio.wait_for(self._stop_event.wait(), timeout=wait)
            except TimeoutError:
                pass

    async def _connect(self, session) -> int | None:
        url = f"{self.bridge_ws_url}/authority/{self.authority_id}"
        async with session.ws_connect(url, heartbeat=30, max_msg_size=2 * 1024 * 1024) as ws:
            self._ws = ws
            async for msg in ws:
                if msg.type == WSMsgType.TEXT:
                    await self._handle_bridge_message(json.loads(msg.data))
                elif msg.type in (WSMsgType.CLOSED, WSMsgType.ERROR):
                    break
            if ws.close_code == 4405:
                self.status["last_error"] = SIGNALING_ONLY_ERROR
                _LOGGER.error("Varco bridge rejected relay data: %s", SIGNALING_ONLY_ERROR)
            close_code = ws.close_code
        self._ws = None
        self.status["connected"] = False
        return close_code

    async def _handle_bridge_message(self, message: dict[str, Any]) -> None:
        typ = message.get("type")
        if typ == "challenge":
            proto = message.get("proto", PROTO_VERSION)
            if proto != PROTO_VERSION:
                self._terminal_reason = (
                    f"the bridge requires protocol version {proto} but this integration "
                    f"supports {PROTO_VERSION}; update the Varco integration"
                )
                if self._ws is not None:
                    await self._ws.close()
                return
            await self._send({"type": "auth", "proto": PROTO_VERSION, "signature": sign_challenge(self.private_key, message["nonce"])})
        elif typ == "ready":
            self._terminal_failures = 0
            self.status.update({"connected": True, "last_error": None})
            persistent_notification.async_dismiss(self.hass, "varco_relay_paused")
        elif typ == "client_connected":
            self.sessions[message["sessionId"]] = BridgeSession(message["sessionId"])
        elif typ == "client_message":
            await self._handle_client_message(message["sessionId"], message["payload"])
        elif typ == "client_disconnected":
            session_id = message.get("sessionId")
            self.sessions.pop(session_id, None)
            if session_id:
                self.authority.discard_session(session_id)
            if self.peer_stack is not None and session_id:
                await self.peer_stack.close(session_id)

    async def _handle_client_message(self, session_id: str, payload: dict[str, Any]) -> None:
        session = self.sessions.setdefault(session_id, BridgeSession(session_id))
        if payload.get("type") == "client_hello":
            session.secure, hello = SecureServerSession.from_client_hello(self.private_key, self.authority_id, payload["client_pub"])
            await self._send_to_client(session_id, hello)
            return
        if session.secure is None:
            await self._close_client(session_id, "session_not_ready")
            return
        try:
            plaintext = session.secure.decrypt(payload)
            response = await self.authority.handle_plaintext(session_id, plaintext, channel_binding=session.secure.channel_binding)
        except Exception:
            _LOGGER.exception("Varco client message failed")
            response = {"type": "error", "code": "session_error", "message": "Internal error"}
        await self._send_to_client(session_id, self._encrypt_for_client(session, response))
        for event in await self.authority.pop_outbox(session_id):
            await self._send_to_client(session_id, self._encrypt_for_client(session, event))

    @callback
    def _on_state_changed(self, event) -> None:
        entity_id = event.data.get("entity_id")
        if not entity_id:
            return
        new_state = event.data.get("new_state")
        self.hass.async_create_task(self._push_state_changed(entity_id, new_state))

    async def _push_state_changed(self, entity_id: str, new_state: Any) -> None:
        for session_id, event in await self.authority.state_changed(entity_id, new_state):
            sent_p2p = False
            if self.peer_stack is not None and hasattr(self.peer_stack, "send_event"):
                sent_p2p = await self.peer_stack.send_event(session_id, event)
            if sent_p2p:
                continue
            session = self.sessions.get(session_id)
            if session is not None and session.secure is not None:
                await self._send_to_client(session_id, session.secure.encrypt(event))
            else:
                self.authority.queue_event(session_id, event)

    async def _send(self, message: dict[str, Any]) -> None:
        if self._ws is not None and not self._ws.closed:
            await self._ws.send_json(message)

    def _notify_terminal(self, reason: str) -> None:
        retry_minutes = int(self._terminal_retry_delay // 60)
        self.status.update({"connected": False, "last_error": reason})
        _LOGGER.error("Varco relay paused: %s. Retrying in %d minutes.", reason, retry_minutes)
        persistent_notification.async_create(
            self.hass,
            f"Varco paused its bridge connection: {reason}.\n\n"
            f"It will retry every {retry_minutes} minutes. Reload the Varco integration to retry now.",
            title="Varco relay paused",
            notification_id="varco_relay_paused",
        )

    def _encrypt_for_client(self, session: BridgeSession, payload: dict[str, Any]) -> dict[str, Any]:
        envelope: dict[str, Any] = session.secure.encrypt(payload)
        if payload.get("type") in SIGNALING_RESPONSE_TYPES:
            envelope["lane"] = "signaling"
        return envelope

    async def _send_to_client(self, session_id: str, payload: dict[str, Any]) -> None:
        await self._send({"type": "authority_message", "sessionId": session_id, "payload": payload})

    async def _close_client(self, session_id: str, reason: str) -> None:
        await self._send({"type": "close_client", "sessionId": session_id, "reason": reason})

    async def _notify_owner(self, request: AccessRequest) -> None:
        manifest = request.manifest

        def scopes(name: str) -> list[str]:
            value = manifest.get(name) or []
            return [str(item) for item in value] if isinstance(value, list) else []

        def summarize(values: list[str]) -> str:
            if not values:
                return "none"
            shown = values[:8]
            suffix = f", +{len(values) - len(shown)} more" if len(values) > len(shown) else ""
            return ", ".join(f"`{value}`" for value in shown) + suffix

        name = str(manifest.get("name") or "Unknown")
        version = str(manifest.get("version") or "not declared")
        consumer_key = request.consumer_pk[:12] + "..." + request.consumer_pk[-8:] if len(request.consumer_pk) > 24 else request.consumer_pk
        message = (
            f"Consumer `{name}` requests Varco access.\n\n"
            f"Requested by: `{name}` version `{version}`\n\n"
            f"Consumer key: `{consumer_key}`\n\n"
            f"Pairing code: **{request.pairing_code}**\n\n"
            "Requested permissions:\n"
            f"- Read entities: {summarize(scopes('read_entities'))}\n"
            f"- Live subscriptions: {summarize(scopes('subscriptions'))}\n"
            f"- History: {summarize(scopes('history'))}\n"
            f"- Camera snapshots: {summarize(scopes('camera_snapshots'))}\n"
            f"- Home Assistant actions: {summarize(scopes('actions'))}\n\n"
            f"[Open Varco panel](/varco) to approve or reject this request.\n\n"
            f"Service fallback: `varco.approve_request` with request_id `{request.request_id}`, "
            f"or `varco.reject_request`."
        )
        persistent_notification.async_create(self.hass, message, title="Varco access request", notification_id=f"varco_{request.request_id}")
