from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable

from . import audit
from .crypto import new_id, pairing_code, verify_access_request
from .models import AccessRequest, Grant
from .policy import action_allowed, camera_entities, entity_allowed, history_entities, read_entities, subscription_entities
from .storage import MemoryVarcoStore


@dataclass
class RuntimeSubscription:
    subscription_id: str
    entity_ids: set[str]


@dataclass
class RuntimeSession:
    session_id: str
    consumer_pk: str | None = None
    closed: bool = False
    subscriptions: dict[str, RuntimeSubscription] = field(default_factory=dict)
    outbox: list[dict[str, Any]] = field(default_factory=list)


class VarcoAuthority:
    def __init__(
        self,
        store: MemoryVarcoStore,
        hass: Any | None = None,
        notify_owner: Callable[[AccessRequest], Any] | None = None,
        peer_stack: Any | None = None,
    ) -> None:
        self.store = store
        self.hass = hass
        self.notify_owner = notify_owner
        self.peer_stack = peer_stack
        self.sessions: dict[str, RuntimeSession] = {}

    def _session(self, session_id: str) -> RuntimeSession:
        return self.sessions.setdefault(session_id, RuntimeSession(session_id=session_id))

    async def handle_plaintext(self, session_id: str, message: dict[str, Any]) -> dict[str, Any]:
        typ = message.get("type")
        if typ == "access_request":
            return await self._access_request(session_id, message)
        if typ == "authenticate":
            return await self._authenticate(session_id, message)
        grant = await self._require_grant(session_id, message.get("request_id"))
        if isinstance(grant, dict):
            return grant
        if typ == "get_states":
            return await self._get_states(grant, message)
        if typ == "subscribe_states":
            return await self._subscribe(session_id, grant, message)
        if typ == "unsubscribe_states":
            return await self._unsubscribe(session_id, message)
        if typ == "history_query":
            return await self._history_query(grant, message)
        if typ == "camera_snapshot":
            return await self._camera_snapshot(grant, message)
        if typ == "call_service":
            return await self._call_service(grant, message)
        if typ == "webrtc_offer":
            return await self._webrtc_offer(session_id, grant, message)
        if typ == "webrtc_ice":
            return await self._webrtc_ice(grant, message)
        return self._error(message.get("request_id"), "unknown_message", "Unknown message type")

    async def approve_request(self, request_id: str) -> Grant:
        grant = await self.store.async_approve_request(request_id)
        await self._dismiss_notification(request_id)
        await audit.async_log(self.store, "access_request_approved", grant.grant_id)
        return grant

    async def reject_request(self, request_id: str) -> None:
        await self.store.async_reject_request(request_id)
        await self._dismiss_notification(request_id)
        await audit.async_log(self.store, "access_request_rejected", request_id)

    async def revoke_grant(self, grant_id: str) -> Grant:
        grant = await self.store.async_revoke_grant(grant_id)
        for session in self.sessions.values():
            if session.consumer_pk == grant.consumer_pk:
                session.closed = True
                session.outbox.append({"type": "error", "code": "grant_revoked", "message": "Grant revoked"})
        await audit.async_log(self.store, "grant_revoked", grant.grant_id)
        return grant

    async def _dismiss_notification(self, request_id: str) -> None:
        if self.hass is None:
            return
        try:
            from homeassistant.components import persistent_notification
            persistent_notification.async_dismiss(self.hass, f"varco_{request_id}")
        except Exception:
            pass

    async def state_changed(self, entity_id: str, state: Any | None = None) -> list[tuple[str, dict[str, Any]]]:
        events: list[tuple[str, dict[str, Any]]] = []
        payload = self._state_payload(entity_id, state)
        for session_id, session in self.sessions.items():
            if session.closed:
                continue
            for sub in session.subscriptions.values():
                if entity_id in sub.entity_ids:
                    event = {"type": "state_delta", "subscription_id": sub.subscription_id, "states": {entity_id: payload}}
                    session.outbox.append(event)
                    events.append((session_id, event))
        return events

    async def pop_outbox(self, session_id: str) -> list[dict[str, Any]]:
        session = self._session(session_id)
        outbox = session.outbox
        session.outbox = []
        return outbox

    async def _access_request(self, session_id: str, message: dict[str, Any]) -> dict[str, Any]:
        consumer_pk = str(message.get("consumer_pk") or "")
        manifest = dict(message.get("manifest") or {})
        nonce = str(message.get("nonce") or "")
        signature = str(message.get("signature") or "")
        if not verify_access_request(consumer_pk, nonce, manifest, signature):
            await audit.async_log(self.store, "session_error", details={"reason": "bad_access_request_signature"})
            return self._error(message.get("request_id"), "bad_signature", "Invalid access request signature")
        request = AccessRequest(
            request_id=new_id(12),
            consumer_pk=consumer_pk,
            manifest=manifest,
            nonce=nonce,
            pairing_code=pairing_code(consumer_pk, nonce),
        )
        await self.store.async_upsert_access_request(request)
        self._session(session_id).consumer_pk = consumer_pk
        await audit.async_log(self.store, "access_request_received", request.request_id, {"consumer_pk": consumer_pk, "manifest_name": manifest.get("name")})
        if self.notify_owner:
            result = self.notify_owner(request)
            if hasattr(result, "__await__"):
                await result
        return {"type": "access_request_pending", "request_id": request.request_id, "pairing_code": request.pairing_code, "status": "pending"}

    async def _authenticate(self, session_id: str, message: dict[str, Any]) -> dict[str, Any]:
        consumer_pk = str(message.get("consumer_pk") or "")
        grant = await self.store.async_get_grant_by_consumer(consumer_pk)
        if grant is None or grant.revoked:
            return self._error(message.get("request_id"), "not_authorized", "No active grant")
        self._session(session_id).consumer_pk = consumer_pk
        await audit.async_log(self.store, "consumer_connected", grant.grant_id, {"consumer_pk": consumer_pk})
        return {"type": "authenticated", "grant_id": grant.grant_id, "manifest": grant.manifest}

    async def _require_grant(self, session_id: str, request_id: str | None) -> Grant | dict[str, Any]:
        session = self._session(session_id)
        if session.closed:
            return self._error(request_id, "grant_revoked", "Grant revoked")
        if not session.consumer_pk:
            return self._error(request_id, "not_authenticated", "Authenticate first")
        grant = await self.store.async_get_grant_by_consumer(session.consumer_pk)
        if grant is None or grant.revoked:
            session.closed = True
            return self._error(request_id, "grant_revoked", "Grant revoked")
        return grant

    async def _get_states(self, grant: Grant, message: dict[str, Any]) -> dict[str, Any]:
        entity_ids = self._expand_entity_ids([str(item) for item in message.get("entity_ids", [])])
        denied = [entity for entity in entity_ids if not entity_allowed(entity, read_entities(grant.manifest))]
        if denied:
            await audit.async_log(self.store, "permission_error", grant.grant_id, {"request_id": message.get("request_id"), "operation": "get_states", "denied_count": len(denied)})
            return self._error(message.get("request_id"), "permission_denied", "Entity not allowed")
        return {"type": "states", "request_id": message.get("request_id"), "states": {entity: self._state_payload(entity) for entity in entity_ids}}

    async def _subscribe(self, session_id: str, grant: Grant, message: dict[str, Any]) -> dict[str, Any]:
        entity_ids = set(self._expand_entity_ids([str(item) for item in message.get("entity_ids", [])]))
        if any(not entity_allowed(entity, subscription_entities(grant.manifest)) for entity in entity_ids):
            await audit.async_log(self.store, "permission_error", grant.grant_id, {"operation": "subscribe_states", "denied_count": 1})
            return self._error(message.get("request_id"), "permission_denied", "Entity not allowed")
        subscription_id = str(message.get("subscription_id") or new_id(8))
        self._session(session_id).subscriptions[subscription_id] = RuntimeSubscription(subscription_id, entity_ids)
        return {"type": "state_snapshot", "request_id": message.get("request_id"), "subscription_id": subscription_id, "states": {entity: self._state_payload(entity) for entity in sorted(entity_ids)}}

    async def _unsubscribe(self, session_id: str, message: dict[str, Any]) -> dict[str, Any]:
        subscription_id = str(message.get("subscription_id") or "")
        self._session(session_id).subscriptions.pop(subscription_id, None)
        return {"type": "unsubscribed", "request_id": message.get("request_id"), "subscription_id": subscription_id}

    async def _history_query(self, grant: Grant, message: dict[str, Any]) -> dict[str, Any]:
        entity_ids = [str(item) for item in message.get("entity_ids", [])]
        if any(not entity_allowed(entity, history_entities(grant.manifest)) for entity in entity_ids):
            await audit.async_log(self.store, "permission_error", grant.grant_id, {"operation": "history_query", "denied_count": 1})
            return self._error(message.get("request_id"), "permission_denied", "History not allowed")
        return {"type": "history_result", "request_id": message.get("request_id"), "history": await self._history_payload(entity_ids, message)}

    async def _camera_snapshot(self, grant: Grant, message: dict[str, Any]) -> dict[str, Any]:
        entity_id = str(message.get("entity_id") or "")
        if not entity_allowed(entity_id, camera_entities(grant.manifest)):
            await audit.async_log(self.store, "permission_error", grant.grant_id, {"operation": "camera_snapshot"})
            return self._error(message.get("request_id"), "permission_denied", "Camera not allowed")
        return {"type": "camera_snapshot", "request_id": message.get("request_id"), "entity_id": entity_id, "content_type": "image/jpeg", "body": await self._camera_payload(entity_id)}

    async def _call_service(self, grant: Grant, message: dict[str, Any]) -> dict[str, Any]:
        domain = str(message.get("domain") or "")
        service = str(message.get("service") or "")
        service_data = dict(message.get("service_data") or {})
        target = dict(message.get("target") or {})
        entity_id = target.get("entity_id") or service_data.get("entity_id")
        if isinstance(entity_id, list):
            entity_id = entity_id[0] if entity_id else None
        entity_id = str(entity_id) if entity_id else None
        if not action_allowed(grant.manifest, domain, service, entity_id):
            await audit.async_log(self.store, "permission_error", grant.grant_id, {"operation": "call_service", "domain": domain, "service": service, "entity_id": entity_id})
            return self._error(message.get("request_id"), "permission_denied", "Service call not allowed")
        if self.hass is not None and hasattr(self.hass, "services"):
            await self.hass.services.async_call(domain, service, service_data, target=target, blocking=True)
        await audit.async_log(self.store, "call_service", grant.grant_id, {"domain": domain, "service": service, "entity_id": entity_id})
        return {"type": "service_called", "request_id": message.get("request_id"), "ok": True}

    async def _webrtc_offer(self, session_id: str, grant: Grant, message: dict[str, Any]) -> dict[str, Any]:
        if self.peer_stack is None:
            return await self._webrtc_fallback(grant, message, "authority_peer_stack_unavailable")
        try:
            answer = await self.peer_stack.create_answer(
                session_id,
                str(message.get("sdp") or ""),
                lambda data: self.handle_plaintext(session_id, data),
            )
        except Exception as err:
            await audit.async_log(self.store, "webrtc_fallback", grant.grant_id, {"reason": type(err).__name__})
            return {"type": "webrtc_unavailable", "request_id": message.get("request_id"), "fallback": "relay", "reason": type(err).__name__}
        await audit.async_log(self.store, "webrtc_connected", grant.grant_id)
        return {
            "type": "webrtc_answer",
            "request_id": message.get("request_id"),
            "sdp": answer["sdp"],
            "sdp_type": answer.get("sdp_type", "answer"),
            "transport": "p2p",
        }

    async def _webrtc_ice(self, grant: Grant, message: dict[str, Any]) -> dict[str, Any]:
        if self.peer_stack is None:
            return await self._webrtc_fallback(grant, message, "authority_peer_stack_unavailable")
        await audit.async_log(self.store, "webrtc_ice", grant.grant_id)
        return {"type": "webrtc_ice_ack", "request_id": message.get("request_id")}

    async def _webrtc_fallback(self, grant: Grant, message: dict[str, Any], reason: str) -> dict[str, Any]:
        await audit.async_log(self.store, "webrtc_fallback", grant.grant_id, {"reason": reason})
        return {"type": "webrtc_unavailable", "request_id": message.get("request_id"), "fallback": "relay"}

    def _expand_entity_ids(self, entity_ids: list[str]) -> list[str]:
        expanded: list[str] = []
        known = self._known_entity_ids()
        for entity_id in entity_ids:
            if entity_id == "*":
                expanded.extend(known)
            elif entity_id.endswith(".*") and "." in entity_id:
                domain = entity_id.split(".", 1)[0]
                expanded.extend(entity for entity in known if entity.startswith(f"{domain}."))
            else:
                expanded.append(entity_id)
        return list(dict.fromkeys(expanded))

    def _known_entity_ids(self) -> list[str]:
        if self.hass is None or not hasattr(self.hass, "states"):
            return []
        states = self.hass.states
        if hasattr(states, "values") and isinstance(states.values, dict):
            return sorted(str(entity_id) for entity_id in states.values.keys())
        if hasattr(states, "async_all"):
            return sorted(str(state.entity_id) for state in states.async_all())
        if hasattr(states, "all"):
            return sorted(str(state.entity_id) for state in states.all())
        return []

    def _state_payload(self, entity_id: str, state: Any | None = None) -> dict[str, Any] | None:
        if state is None and self.hass is not None and hasattr(self.hass, "states"):
            state = self.hass.states.get(entity_id)
        if state is None:
            return None
        if isinstance(state, dict):
            return dict(state)
        return {"entity_id": entity_id, "state": getattr(state, "state", None), "attributes": dict(getattr(state, "attributes", {}) or {}), "last_changed": str(getattr(state, "last_changed", ""))}

    async def _history_payload(self, entity_ids: list[str], message: dict[str, Any]) -> Any:
        if self.hass is not None and hasattr(self.hass, "varco_history"):
            return await self.hass.varco_history(entity_ids, message)
        return {entity_id: [] for entity_id in entity_ids}

    async def _camera_payload(self, entity_id: str) -> str:
        if self.hass is not None and hasattr(self.hass, "varco_camera_snapshot"):
            return await self.hass.varco_camera_snapshot(entity_id)
        return ""

    def _error(self, request_id: str | None, code: str, message: str) -> dict[str, Any]:
        return {"type": "error", "request_id": request_id, "code": code, "message": message}
