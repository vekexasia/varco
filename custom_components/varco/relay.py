from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass
from typing import Any

from aiohttp import WSMsgType
from homeassistant.components import persistent_notification
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .authority import VarcoAuthority
from .crypto import SecureServerSession, sign_challenge
from .models import AccessRequest
from .storage import HomeAssistantVarcoStore
from .webrtc import create_peer_stack_or_none

_LOGGER = logging.getLogger(__name__)


@dataclass
class BridgeSession:
    session_id: str
    secure: SecureServerSession | None = None


class VarcoRelay:
    def __init__(self, hass, entry_data: dict[str, Any], store: HomeAssistantVarcoStore) -> None:
        self.hass = hass
        self.entry_data = entry_data
        self.store = store
        self.peer_stack = create_peer_stack_or_none() if entry_data.get("webrtc_enabled", False) else None
        self.authority = VarcoAuthority(store=store, hass=hass, notify_owner=self._notify_owner, peer_stack=self.peer_stack)
        self.authority_id = entry_data["authority_id"]
        self.private_key = entry_data["private_key"]
        self.bridge_ws_url = entry_data["bridge_ws_url"].rstrip("/")
        self.sessions: dict[str, BridgeSession] = {}
        self.status: dict[str, Any] = {"connected": False, "last_error": None}
        self._task: asyncio.Task | None = None
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
        delay = 1
        session = async_get_clientsession(self.hass)
        while not self._stop_event.is_set():
            try:
                await self._connect(session)
                delay = 1
            except asyncio.CancelledError:
                raise
            except Exception as err:
                self.status.update({"connected": False, "last_error": str(err)})
                _LOGGER.warning("Varco relay disconnected: %s", err)
                try:
                    await asyncio.wait_for(self._stop_event.wait(), timeout=delay)
                except TimeoutError:
                    pass
                delay = min(delay * 2, 60)

    async def _connect(self, session) -> None:
        url = f"{self.bridge_ws_url}/authority/{self.authority_id}"
        async with session.ws_connect(url, heartbeat=30, max_msg_size=2 * 1024 * 1024) as ws:
            self._ws = ws
            async for msg in ws:
                if msg.type == WSMsgType.TEXT:
                    await self._handle_bridge_message(json.loads(msg.data))
                elif msg.type in (WSMsgType.CLOSED, WSMsgType.ERROR):
                    break
        self._ws = None
        self.status["connected"] = False

    async def _handle_bridge_message(self, message: dict[str, Any]) -> None:
        typ = message.get("type")
        if typ == "challenge":
            await self._send({"type": "auth", "signature": sign_challenge(self.private_key, message["nonce"])})
        elif typ == "ready":
            self.status.update({"connected": True, "last_error": None})
        elif typ == "client_connected":
            self.sessions[message["sessionId"]] = BridgeSession(message["sessionId"])
        elif typ == "client_message":
            await self._handle_client_message(message["sessionId"], message["payload"])
        elif typ == "client_disconnected":
            session_id = message.get("sessionId")
            self.sessions.pop(session_id, None)
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
            response = await self.authority.handle_plaintext(session_id, plaintext)
        except Exception as err:
            _LOGGER.exception("Varco client message failed")
            response = {"type": "error", "code": "session_error", "message": str(err)}
        await self._send_to_client(session_id, session.secure.encrypt(response))
        for event in await self.authority.pop_outbox(session_id):
            await self._send_to_client(session_id, session.secure.encrypt(event))

    def _on_state_changed(self, event) -> None:
        entity_id = event.data.get("entity_id")
        if not entity_id:
            return
        new_state = event.data.get("new_state")
        self.hass.add_job(self._push_state_changed(entity_id, new_state))

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

    async def _send(self, message: dict[str, Any]) -> None:
        if self._ws is not None and not self._ws.closed:
            await self._ws.send_json(message)

    async def _send_to_client(self, session_id: str, payload: dict[str, Any]) -> None:
        await self._send({"type": "authority_message", "sessionId": session_id, "payload": payload})

    async def _close_client(self, session_id: str, reason: str) -> None:
        await self._send({"type": "close_client", "sessionId": session_id, "reason": reason})

    async def _notify_owner(self, request: AccessRequest) -> None:
        manifest = request.manifest
        message = (
            f"Consumer `{manifest.get('name', 'Unknown')}` requests Varco access.\n\n"
            f"Pairing code: **{request.pairing_code}**\n\n"
            f"[Open Varco panel](/varco) to approve or reject this request.\n\n"
            f"Service fallback: `varco.approve_request` with request_id `{request.request_id}`, "
            f"or `varco.reject_request`."
        )
        persistent_notification.async_create(self.hass, message, title="Varco access request", notification_id=f"varco_{request.request_id}")
