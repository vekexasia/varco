from __future__ import annotations

import hashlib
import hmac
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

from . import audit
from .crypto import generate_consumer_keypair, new_id, pairing_code, verify_access_request, verify_authenticate
from .manifest import ManifestError, validate_manifest
from .models import AccessRequest, Grant, Share, hash_pin, utcnow
from .policy import (
    action_allowed,
    camera_entities,
    entity_allowed,
    evaluate_restrictions,
    history_entities,
    rate_limit_restrictions,
    read_entities,
    template_restrictions,
    subscription_entities,
)
from .storage import MemoryVarcoStore

_LOGGER = logging.getLogger(__name__)

OUTBOX_MAX_EVENTS = 100

# Weight units consumed per data-plane operation; expensive ops cost more.
DATA_PLANE_OP_WEIGHTS = {
    "history_query": 5,
    "camera_snapshot": 5,
    "call_service": 2,
}
DATA_PLANE_DEFAULT_WEIGHT = 1

MAX_HISTORY_ENTITIES = 10
MAX_HISTORY_DAYS = 30
MAX_HISTORY_POINTS_PER_ENTITY = 5000


def _registry_modules():
    from homeassistant.helpers import area_registry, device_registry, entity_registry, label_registry

    return area_registry, device_registry, entity_registry, label_registry


def _secret_hash(secret: str) -> str:
    return hashlib.sha256(secret.encode()).hexdigest()


def _secret_matches(secret: str, encoded: str) -> bool:
    return hmac.compare_digest(_secret_hash(secret), encoded)

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
        now_provider: Callable[[], datetime] | None = None,
        monotonic_provider: Callable[[], float] | None = None,
    ) -> None:
        self.store = store
        self.hass = hass
        self.notify_owner = notify_owner
        self.peer_stack = peer_stack
        self.now_provider = now_provider or (lambda: datetime.now(timezone.utc))
        self.monotonic_provider = monotonic_provider or time.monotonic
        self.sessions: dict[str, RuntimeSession] = {}
        self._rate_hits: dict[tuple[str, str], list[float]] = {}
        self._access_request_last: dict[str, float] = {}
        self.access_request_min_interval = 5.0
        self.data_plane_rate_limit = 240
        self.data_plane_rate_window = 60.0
        self._data_plane_hits: dict[str, list[tuple[float, int]]] = {}

    def _session(self, session_id: str) -> RuntimeSession:
        return self.sessions.setdefault(session_id, RuntimeSession(session_id=session_id))

    def _is_grant_expired(self, grant: Grant) -> bool:
        if not grant.expires_at:
            return False
        try:
            expires = datetime.fromisoformat(grant.expires_at)
        except (TypeError, ValueError):
            return False
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        return self.now_provider() >= expires

    def _is_expired(self, expires_at: str | None) -> bool:
        if not expires_at:
            return False
        try:
            expires = datetime.fromisoformat(expires_at)
        except (TypeError, ValueError):
            return False
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        return self.now_provider() >= expires

    async def handle_plaintext(self, session_id: str, message: dict[str, Any], channel_binding: str | None = None) -> dict[str, Any]:
        typ = message.get("type")
        if typ == "access_request":
            return await self._access_request(session_id, message)
        if typ == "authenticate":
            return await self._authenticate(session_id, message, channel_binding)
        if typ == "claim_share":
            return await self._claim_share(session_id, message)

        grant = await self._require_grant(session_id, message.get("request_id"))
        if isinstance(grant, dict):
            return grant

        rate_error = await self._check_data_plane_rate(grant, typ, message.get("request_id"))
        if rate_error is not None:
            return rate_error

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
        if typ == "grant_info":
            return self._grant_info(grant, message)
        if typ == "call_service":
            return await self._call_service(grant, message)
        if typ == "webrtc_offer":
            return await self._webrtc_offer(session_id, grant, message)
        if typ == "webrtc_ice":
            return await self._webrtc_ice(grant, message)
        return self._error(message.get("request_id"), "unknown_message", "Unknown message type")

    async def approve_request(self, request_id: str, expires_at: str | None = None, approved_manifest: dict | None = None) -> Grant:
        grant = await self.store.async_approve_request(request_id, expires_at=expires_at, approved_manifest=approved_manifest)
        await self._dismiss_notification(request_id)
        await audit.async_log(self.store, "access_request_approved", grant.grant_id)
        return grant

    async def create_preapproved_grant(self, manifest: dict[str, Any], expires_at: str | None = None, restrictions: list[dict[str, Any]] | None = None) -> tuple[Grant, dict[str, str]]:
        manifest = validate_manifest(manifest)
        identity = generate_consumer_keypair()
        normalized_restrictions = [self._normalize_restriction(item) for item in restrictions or [] if isinstance(item, dict)]
        grant = await self.store.async_create_preapproved_grant(identity["public_key"], manifest, expires_at=expires_at, restrictions=normalized_restrictions)
        await audit.async_log(self.store, "grant_created", grant.grant_id, {"source": "preapproved_share", "manifest_name": manifest.get("name")})
        return grant, identity

    async def create_share(self, name: str, manifest: dict[str, Any], max_claims: int = 1, expires_at: str | None = None, restrictions: list[dict[str, Any]] | None = None, note: str | None = None) -> tuple[Share, str]:
        manifest = validate_manifest(manifest)
        secret = new_id(32)
        share = Share(
            share_id=new_id(16),
            name=name or str(manifest.get("name") or "Shared access"),
            manifest=manifest,
            secret_hash=_secret_hash(secret),
            max_claims=max(1, int(max_claims)),
            expires_at=expires_at,
            restrictions=[self._normalize_restriction(item) for item in restrictions or [] if isinstance(item, dict)],
            note=note,
        )
        await self.store.async_upsert_share(share)
        await audit.async_log(self.store, "share_created", share.share_id, {"name": share.name, "max_claims": share.max_claims})
        return share, secret

    async def reject_request(self, request_id: str) -> AccessRequest:
        request = await self.store.async_reject_request(request_id)
        await audit.async_log(self.store, "access_request_rejected", request_id)
        await self._dismiss_notification(request_id)
        return request

    async def revoke_grant(self, grant_id: str) -> Grant:
        grant = await self.store.async_revoke_grant(grant_id)
        for session in self.sessions.values():
            if session.consumer_pk == grant.consumer_pk:
                session.closed = True
                self.queue_event(session.session_id, {"type": "error", "code": "grant_revoked", "message": "Grant revoked"})
        await audit.async_log(self.store, "grant_revoked", grant.grant_id)
        return grant

    async def delete_grant(self, grant_id: str) -> Grant:
        grant = await self.store.async_delete_grant(grant_id)
        for session in self.sessions.values():
            if session.consumer_pk == grant.consumer_pk:
                session.closed = True
                self.queue_event(session.session_id, {"type": "error", "code": "grant_revoked", "message": "Grant deleted"})
        await audit.async_log(self.store, "grant_deleted", grant.grant_id)
        return grant

    async def set_grant_restrictions(self, grant_id: str, restrictions: list[dict[str, Any]]) -> Grant:
        grant = await self.store.async_get_grant(grant_id)
        if grant is None:
            raise KeyError(grant_id)
        grant.restrictions = [self._normalize_restriction(item) for item in restrictions if isinstance(item, dict)]
        await self.store.async_upsert_grant(grant)
        await audit.async_log(self.store, "grant_restrictions_updated", grant.grant_id, {"restriction_count": len(grant.restrictions)})
        for session in self.sessions.values():
            if session.consumer_pk == grant.consumer_pk:
                session.subscriptions.clear()
                self.queue_event(
                    session.session_id,
                    {
                        "type": "error",
                        "code": "grant_restrictions_updated",
                        "message": "Grant restrictions updated; active subscriptions cleared",
                    },
                )
        return grant

    def _normalize_restriction(self, restriction: dict[str, Any]) -> dict[str, Any]:
        normalized = dict(restriction)
        params = dict(normalized.get("params") or {}) if isinstance(normalized.get("params"), dict) else {}
        if str(normalized.get("type") or "").lower() == "pin":
            pin = params.pop("pin", None)
            if pin is None:
                pin = normalized.pop("pin", None)
            else:
                normalized.pop("pin", None)
            if pin is not None:
                params["pin_hash"] = hash_pin(str(pin))
        normalized["params"] = params
        return normalized

    async def _dismiss_notification(self, request_id: str) -> None:
        if self.hass is None:
            return
        try:
            from homeassistant.components import persistent_notification
        except ImportError:
            return
        try:
            persistent_notification.async_dismiss(self.hass, f"varco_{request_id}")
        except Exception:
            _LOGGER.warning("Failed to dismiss notification for request %s", request_id, exc_info=True)

    async def state_changed(self, entity_id: str, state: Any | None = None) -> list[tuple[str, dict[str, Any]]]:
        events: list[tuple[str, dict[str, Any]]] = []
        payload = self._state_payload(entity_id, state)
        for session_id, session in self.sessions.items():
            if session.closed:
                continue
            for sub in session.subscriptions.values():
                if entity_id in sub.entity_ids:
                    event = {"type": "state_delta", "subscription_id": sub.subscription_id, "states": {entity_id: payload}}
                    events.append((session_id, event))
        return events

    def queue_event(self, session_id: str, event: dict[str, Any]) -> None:
        """Queue an event for later flush via pop_outbox.

        Bounded per session: state deltas coalesce per subscription (latest
        state per entity wins) and the oldest event is dropped at the cap so a
        slow or idle consumer cannot grow memory without bound.
        """
        session = self.sessions.get(session_id)
        if session is None:
            return
        if event.get("type") == "state_delta":
            for pending in session.outbox:
                if pending.get("type") == "state_delta" and pending.get("subscription_id") == event.get("subscription_id"):
                    pending["states"].update(event.get("states") or {})
                    return
        if len(session.outbox) >= OUTBOX_MAX_EVENTS:
            del session.outbox[0]
        session.outbox.append(event)

    async def pop_outbox(self, session_id: str) -> list[dict[str, Any]]:
        session = self.sessions.get(session_id)
        if session is None:
            return []
        outbox = session.outbox
        session.outbox = []
        return outbox

    def discard_session(self, session_id: str) -> None:
        self.sessions.pop(session_id, None)

    async def _access_request(self, session_id: str, message: dict[str, Any]) -> dict[str, Any]:
        consumer_pk = str(message.get("consumer_pk") or "")
        manifest = dict(message.get("manifest") or {})
        nonce = str(message.get("nonce") or "")
        signature = str(message.get("signature") or "")
        if not verify_access_request(consumer_pk, nonce, manifest, signature):
            await audit.async_log(self.store, "session_error", details={"reason": "bad_access_request_signature"})
            return self._error(message.get("request_id"), "bad_signature", "Invalid access request signature")
        try:
            manifest = validate_manifest(manifest)
        except ManifestError as err:
            await audit.async_log(self.store, "session_error", details={"reason": "invalid_manifest", "error": str(err)})
            return self._error(message.get("request_id"), "invalid_manifest", f"Invalid manifest: {err}")
        now = self.monotonic_provider()
        last = self._access_request_last.get(consumer_pk)
        if last is not None and now - last < self.access_request_min_interval:
            await audit.async_log(self.store, "session_error", details={"reason": "access_request_rate_limited"})
            return self._error(message.get("request_id"), "rate_limited", "Access request rate limited")
        if len(self._access_request_last) >= 1000:
            cutoff = now - self.access_request_min_interval
            self._access_request_last = {pk: ts for pk, ts in self._access_request_last.items() if ts > cutoff}
        self._access_request_last[consumer_pk] = now
        # Coalesce: reuse the pending request slot for this consumer so repeated
        # requests do not grow storage; the stable request_id also keeps the
        # owner notification_id stable.
        existing = await self.store.async_get_pending_request_by_consumer(consumer_pk)
        request = AccessRequest(
            request_id=existing.request_id if existing else new_id(12),
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
        return {"type": "access_request_pending", "request_id": message.get("request_id"), "access_request_id": request.request_id, "pairing_code": request.pairing_code, "status": "pending"}

    async def _claim_share(self, session_id: str, message: dict[str, Any]) -> dict[str, Any]:
        share_id = str(message.get("share_id") or "")
        secret = str(message.get("secret") or "")
        consumer_pk = str(message.get("consumer_pk") or "")
        share = await self.store.async_get_share(share_id)
        if share is None or share.revoked or self._is_expired(share.expires_at):
            return self._error(message.get("request_id"), "share_unavailable", "Share link is no longer available")
        if not _secret_matches(secret, share.secret_hash):
            await audit.async_log(self.store, "session_error", details={"reason": "bad_share_secret", "share_id": share_id})
            return self._error(message.get("request_id"), "bad_share_secret", "Invalid share link")
        existing = await self.store.async_get_grant_by_consumer(consumer_pk)
        if existing is not None and not existing.revoked:
            if existing.share_id == share_id:
                self._session(session_id).consumer_pk = consumer_pk
                return {"type": "share_claimed", "request_id": message.get("request_id"), "grant_id": existing.grant_id, "manifest": existing.manifest}
            return self._error(message.get("request_id"), "consumer_already_claimed", "This browser already claimed a different share")
        if share.claims_used >= share.max_claims:
            return self._error(message.get("request_id"), "share_claims_exhausted", "Share link has already been claimed")
        try:
            grant = await self.store.async_claim_share(share, consumer_pk)
        except ValueError:
            return self._error(message.get("request_id"), "share_claims_exhausted", "Share link has already been claimed")
        await audit.async_log(self.store, "share_claimed", share.share_id, {"grant_id": grant.grant_id, "claims_used": share.claims_used, "max_claims": share.max_claims})
        self._session(session_id).consumer_pk = consumer_pk
        return {"type": "share_claimed", "request_id": message.get("request_id"), "grant_id": grant.grant_id, "manifest": grant.manifest}


    async def _authenticate(self, session_id: str, message: dict[str, Any], channel_binding: str | None) -> dict[str, Any]:
        consumer_pk = str(message.get("consumer_pk") or "")
        nonce = str(message.get("nonce") or "")
        signature = str(message.get("signature") or "")
        if channel_binding is None:
            await audit.async_log(self.store, "session_error", details={"reason": "authenticate_without_channel_binding"})
            return self._error(message.get("request_id"), "bad_signature", "Authentication requires a secure channel")
        if not verify_authenticate(consumer_pk, nonce, signature, channel_binding):
            await audit.async_log(self.store, "session_error", details={"reason": "bad_authenticate_signature"})
            return self._error(message.get("request_id"), "bad_signature", "Invalid authentication signature")
        grant = await self.store.async_get_grant_by_consumer(consumer_pk)
        if grant is None or grant.revoked or self._is_grant_expired(grant):
            return self._error(message.get("request_id"), "not_authorized", "No active grant")
        grant.last_used_at = utcnow()
        await self.store.async_upsert_grant(grant)
        self._session(session_id).consumer_pk = consumer_pk
        await audit.async_log(self.store, "consumer_connected", grant.grant_id, {"consumer_pk": consumer_pk})
        return {"type": "authenticated", "request_id": message.get("request_id"), "grant_id": grant.grant_id, "manifest": grant.manifest}

    async def _check_data_plane_rate(self, grant: Grant, operation: Any, request_id: Any) -> dict[str, Any] | None:
        weight = DATA_PLANE_OP_WEIGHTS.get(str(operation), DATA_PLANE_DEFAULT_WEIGHT)
        now = self.monotonic_provider()
        hits = self._data_plane_hits.setdefault(grant.consumer_pk, [])
        cutoff = now - self.data_plane_rate_window
        hits[:] = [hit for hit in hits if hit[0] > cutoff]
        used = sum(hit_weight for _, hit_weight in hits)
        if used + weight > self.data_plane_rate_limit:
            await audit.async_log(self.store, "rate_limited", grant.grant_id, {"operation": str(operation), "request_id": request_id})
            return self._error(request_id, "rate_limited", "Data-plane rate limit exceeded")
        hits.append((now, weight))
        return None

    async def _require_grant(self, session_id: str, request_id: Any) -> Grant | dict[str, Any]:
        session = self._session(session_id)
        if session.closed:
            return self._error(request_id, "grant_revoked", "Grant revoked")
        if not session.consumer_pk:
            return self._error(request_id, "not_authenticated", "Session is not authenticated")
        grant = await self.store.async_get_grant_by_consumer(session.consumer_pk)
        if grant is None or grant.revoked or self._is_grant_expired(grant):
            session.closed = True
            return self._error(request_id, "grant_revoked", "Grant revoked")
        return grant

    def _grant_info(self, grant: Grant, message: dict[str, Any]) -> dict[str, Any]:
        return {"type": "grant_info", "request_id": message.get("request_id"), "grant_id": grant.grant_id, "manifest": grant.manifest}

    async def _get_states(self, grant: Grant, message: dict[str, Any]) -> dict[str, Any]:
        entity_ids = self._expand_entity_ids([str(entity) for entity in message.get("entity_ids") or []], read_entities(grant.manifest))
        denied = [entity for entity in entity_ids if not entity_allowed(entity, read_entities(grant.manifest))]
        if denied:
            await audit.async_log(self.store, "permission_error", grant.grant_id, {"request_id": message.get("request_id"), "operation": "get_states", "denied_count": len(denied)})
            return self._error(message.get("request_id"), "permission_denied", "Entity not allowed")
        restriction_error = await self._enforce_restrictions(grant, "read", {"entity_ids": entity_ids}, message)
        if restriction_error:
            return restriction_error
        return {"type": "states", "request_id": message.get("request_id"), "states": {entity: self._state_payload(entity) for entity in entity_ids}}

    async def _subscribe(self, session_id: str, grant: Grant, message: dict[str, Any]) -> dict[str, Any]:
        entity_ids = set(self._expand_entity_ids([str(entity) for entity in message.get("entity_ids") or []], subscription_entities(grant.manifest)))
        denied = [entity for entity in entity_ids if not entity_allowed(entity, subscription_entities(grant.manifest))]
        if denied:
            await audit.async_log(self.store, "permission_error", grant.grant_id, {"operation": "subscribe_states", "denied_count": len(denied)})
            return self._error(message.get("request_id"), "permission_denied", "Subscription not allowed")
        restriction_error = await self._enforce_restrictions(grant, "subscribe", {"entity_ids": list(entity_ids)}, message)
        if restriction_error:
            return restriction_error
        subscription_id = str(message.get("subscription_id") or new_id(8))
        self._session(session_id).subscriptions[subscription_id] = RuntimeSubscription(subscription_id, entity_ids)
        return {"type": "state_snapshot", "request_id": message.get("request_id"), "subscription_id": subscription_id, "states": {entity: self._state_payload(entity) for entity in sorted(entity_ids)}}

    async def _unsubscribe(self, session_id: str, message: dict[str, Any]) -> dict[str, Any]:
        subscription_id = str(message.get("subscription_id") or "")
        self._session(session_id).subscriptions.pop(subscription_id, None)
        return {"type": "unsubscribed", "request_id": message.get("request_id"), "subscription_id": subscription_id}

    async def _history_query(self, grant: Grant, message: dict[str, Any]) -> dict[str, Any]:
        entity_ids = [str(entity) for entity in message.get("entity_ids") or []]
        if len(entity_ids) > MAX_HISTORY_ENTITIES:
            await audit.async_log(self.store, "history_query_limited", grant.grant_id, {"reason": "too_many_entities", "entity_count": len(entity_ids)})
            return self._error(message.get("request_id"), "history_limit_exceeded", f"Too many entities (max {MAX_HISTORY_ENTITIES})")
        if any(not entity_allowed(entity, history_entities(grant.manifest)) for entity in entity_ids):
            await audit.async_log(self.store, "permission_error", grant.grant_id, {"operation": "history_query", "denied_count": 1})
            return self._error(message.get("request_id"), "permission_denied", "History not allowed")
        restriction_error = await self._enforce_restrictions(grant, "history", {"entity_ids": entity_ids}, message)
        if restriction_error:
            return restriction_error
        end = self._parse_history_time(message.get("end_time")) or self.now_provider()
        start = self._parse_history_time(message.get("start_time")) or end - timedelta(hours=24)
        min_start = end - timedelta(days=MAX_HISTORY_DAYS)
        range_clamped = start < min_start
        if range_clamped:
            start = min_start
        query = dict(message, start_time=start.isoformat(), end_time=end.isoformat())
        history = await self._history_payload(entity_ids, query)
        truncated = False
        if isinstance(history, dict):
            for entity_id, points in history.items():
                if isinstance(points, list) and len(points) > MAX_HISTORY_POINTS_PER_ENTITY:
                    history[entity_id] = points[:MAX_HISTORY_POINTS_PER_ENTITY]
                    truncated = True
        if truncated or range_clamped:
            await audit.async_log(self.store, "history_query_limited", grant.grant_id, {"reason": "clamped", "truncated": truncated, "range_clamped": range_clamped, "entity_count": len(entity_ids)})
        return {"type": "history_result", "request_id": message.get("request_id"), "history": history, "truncated": truncated, "range_clamped": range_clamped}

    async def _camera_snapshot(self, grant: Grant, message: dict[str, Any]) -> dict[str, Any]:
        entity_id = str(message.get("entity_id") or "")
        if not entity_allowed(entity_id, camera_entities(grant.manifest)):
            await audit.async_log(self.store, "permission_error", grant.grant_id, {"operation": "camera_snapshot"})
            return self._error(message.get("request_id"), "permission_denied", "Camera not allowed")
        restriction_error = await self._enforce_restrictions(grant, "camera", {"entity_ids": [entity_id]}, message)
        if restriction_error:
            return restriction_error
        return {"type": "camera_snapshot", "request_id": message.get("request_id"), "entity_id": entity_id, "content_type": "image/jpeg", "body": await self._camera_payload(entity_id)}

    async def _call_service(self, grant: Grant, message: dict[str, Any]) -> dict[str, Any]:
        domain = str(message.get("domain") or "")
        service = str(message.get("service") or "")
        service_data = dict(message.get("service_data") or {})
        target = message.get("target") if isinstance(message.get("target"), dict) else {}
        resolved = self._resolve_non_entity_targets(target, service_data)
        if resolved is None:
            await audit.async_log(self.store, "permission_error", grant.grant_id, {"operation": "call_service", "domain": domain, "service": service, "reason": "unresolved_target"})
            return self._error(message.get("request_id"), "permission_denied", "Service call not allowed")
        entity_ids = list(dict.fromkeys(self._service_entity_ids(target, service_data) + resolved))
        if entity_ids:
            denied = [entity for entity in entity_ids if not action_allowed(grant.manifest, domain, service, entity)]
        elif action_allowed(grant.manifest, domain, service, None):
            denied = []
        else:
            denied = [None]
        if denied:
            await audit.async_log(self.store, "permission_error", grant.grant_id, {"operation": "call_service", "domain": domain, "service": service, "reason": "unauthorized_entity", "denied_count": len(denied)})
            return self._error(message.get("request_id"), "permission_denied", "Service call not allowed")
        context = {"domain": domain, "service": service, "entity_ids": entity_ids, "pin": message.get("pin"), "pins": message.get("pins")}
        restriction_error = await self._enforce_restrictions(grant, "action", context, message)
        if restriction_error:
            return restriction_error
        if self.hass is not None and hasattr(self.hass, "services"):
            await self.hass.services.async_call(domain, service, service_data, target=target, blocking=True)
        await audit.async_log(self.store, "call_service", grant.grant_id, {"domain": domain, "service": service, "entity_count": len(entity_ids)})
        return {"type": "service_called", "request_id": message.get("request_id"), "ok": True}

    async def _enforce_restrictions(self, grant: Grant, operation: str, context: dict[str, Any], message: dict[str, Any]) -> dict[str, Any] | None:
        decision = evaluate_restrictions(grant, operation, context, now=self.now_provider())
        if not decision.allowed:
            await self._audit_restriction_denied(grant, operation, decision.restriction_id, decision.reason)
            return self._error(message.get("request_id"), "permission_denied", f"Restriction denied: {decision.reason}")
        template_decision = await self._check_template_restrictions(grant, operation, context)
        if template_decision is not None:
            restriction_id, reason = template_decision
            await self._audit_restriction_denied(grant, operation, restriction_id, reason)
            return self._error(message.get("request_id"), "permission_denied", f"Restriction denied: {reason}")
        rate_decision = self._check_and_record_rate_limits(grant, operation, context)
        if rate_decision is not None:
            restriction_id, reason = rate_decision
            await self._audit_restriction_denied(grant, operation, restriction_id, reason)
            return self._error(message.get("request_id"), "permission_denied", f"Restriction denied: {reason}")
        return None

    def _check_and_record_rate_limits(self, grant: Grant, operation: str, context: dict[str, Any]) -> tuple[str, str] | None:
        now = self.monotonic_provider()
        matched = rate_limit_restrictions(grant, operation, context)
        to_record: list[tuple[str, list[float]]] = []
        for restriction in matched:
            restriction_id = str(restriction.get("id") or "rate_limit")
            params = restriction.get("params") if isinstance(restriction.get("params"), dict) else {}
            hits = self._rate_hits.setdefault((grant.grant_id, restriction_id), [])
            cooldown_seconds = float(params.get("cooldown_seconds") or 0)
            if cooldown_seconds and hits and now - hits[-1] < cooldown_seconds:
                return restriction_id, "cooldown_active"
            limit = int(params.get("limit") or params.get("max") or 0)
            window_seconds = float(params.get("window_seconds") or 0)
            if limit and window_seconds:
                hits[:] = [hit for hit in hits if now - hit < window_seconds]
                if len(hits) >= limit:
                    return restriction_id, "rate_limited"
            to_record.append((restriction_id, hits))
        for _, hits in to_record:
            hits.append(now)
        return None

    async def _check_template_restrictions(self, grant: Grant, operation: str, context: dict[str, Any]) -> tuple[str, str] | None:
        for restriction in template_restrictions(grant, operation, context):
            restriction_id = str(restriction.get("id") or "template")
            params = restriction.get("params") if isinstance(restriction.get("params"), dict) else {}
            value_template = params.get("value_template") or restriction.get("value_template")
            if not isinstance(value_template, str) or not value_template.strip():
                return restriction_id, "template_not_configured"
            try:
                result = await self._render_template(value_template)
            except Exception:
                # Fail closed; never log the template result or exception details,
                # which may contain entity states.
                return restriction_id, "template_error"
            if not self._template_result_truthy(result):
                return restriction_id, "template_denied"
        return None

    async def _render_template(self, value_template: str) -> Any:
        if self.hass is not None and hasattr(self.hass, "varco_render_template"):
            return await self.hass.varco_render_template(value_template)
        if self.hass is None:
            raise RuntimeError("template_evaluation_unavailable")
        from homeassistant.helpers.template import Template

        return Template(value_template, self.hass).async_render(parse_result=False)

    def _template_result_truthy(self, result: Any) -> bool:
        if isinstance(result, str):
            return result.strip().lower() in {"1", "true", "yes", "on"}
        return bool(result)

    async def _audit_restriction_denied(self, grant: Grant, operation: str, restriction_id: str | None, reason: str | None) -> None:
        await audit.async_log(
            self.store,
            "restriction_denied",
            grant.grant_id,
            {"operation": operation, "restriction_id": restriction_id, "reason": reason},
        )

    def _service_entity_ids(self, target: dict[str, Any], service_data: dict[str, Any]) -> list[str]:
        return self._service_target_values(target, service_data, "entity_id")

    def _service_target_values(self, target: dict[str, Any], service_data: dict[str, Any], key: str) -> list[str]:
        values: list[str] = []
        for source in (target.get(key), service_data.get(key)):
            if isinstance(source, list):
                values.extend(str(item) for item in source)
            elif source:
                values.append(str(source))
        return list(dict.fromkeys(values))

    def _resolve_non_entity_targets(self, target: dict[str, Any], service_data: dict[str, Any]) -> list[str] | None:
        """Resolve area/device/label targets to the entity ids they reference.

        Returns a (possibly empty) list of entity ids, or None when any target
        cannot be resolved (no hass, registries unavailable, unknown id). The
        resolution is a conservative superset of Home Assistant's own service
        target resolution, so the per-entity grant check never under-covers.
        """
        area_ids = self._service_target_values(target, service_data, "area_id")
        device_ids = self._service_target_values(target, service_data, "device_id")
        label_ids = self._service_target_values(target, service_data, "label_id")
        if not (area_ids or device_ids or label_ids):
            return []
        if self.hass is None:
            return None
        try:
            area_registry, device_registry, entity_registry, label_registry = _registry_modules()
            area_reg = area_registry.async_get(self.hass)
            dev_reg = device_registry.async_get(self.hass)
            ent_reg = entity_registry.async_get(self.hass)
            label_reg = label_registry.async_get(self.hass)
        except Exception:
            return None
        if any(area_reg.async_get_area(area_id) is None for area_id in area_ids):
            return None
        if any(dev_reg.async_get(device_id) is None for device_id in device_ids):
            return None
        if any(label_reg.async_get_label(label_id) is None for label_id in label_ids):
            return None
        resolved_devices = set(device_ids)
        entities: list[str] = []
        for area_id in area_ids:
            resolved_devices.update(entry.id for entry in device_registry.async_entries_for_area(dev_reg, area_id))
            entities.extend(entry.entity_id for entry in entity_registry.async_entries_for_area(ent_reg, area_id))
        for label_id in label_ids:
            resolved_devices.update(entry.id for entry in device_registry.async_entries_for_label(dev_reg, label_id))
            entities.extend(entry.entity_id for entry in entity_registry.async_entries_for_label(ent_reg, label_id))
        for device_id in sorted(resolved_devices):
            entities.extend(entry.entity_id for entry in entity_registry.async_entries_for_device(ent_reg, device_id, include_disabled_entities=True))
        return list(dict.fromkeys(entities))

    async def _webrtc_offer(self, session_id: str, grant: Grant, message: dict[str, Any]) -> dict[str, Any]:
        if self.peer_stack is None:
            return await self._webrtc_fallback(grant, message, "authority_peer_stack_unavailable")
        try:
            answer = await self.peer_stack.create_answer(session_id, message.get("sdp"), lambda data: self.handle_plaintext(session_id, data))
        except Exception as err:
            return await self._webrtc_fallback(grant, message, f"authority_peer_stack_error:{type(err).__name__}")
        await audit.async_log(self.store, "webrtc_answer", grant.grant_id)
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
        return {"type": "webrtc_ice_ack", "request_id": message.get("request_id")}

    async def _webrtc_fallback(self, grant: Grant, message: dict[str, Any], reason: str) -> dict[str, Any]:
        await audit.async_log(self.store, "webrtc_fallback", grant.grant_id, {"reason": reason})
        return {"type": "webrtc_unavailable", "request_id": message.get("request_id"), "fallback": "relay"}

    def _error(self, request_id: Any, code: str, message: str) -> dict[str, Any]:
        return {"type": "error", "request_id": request_id, "code": code, "message": message}

    def _expand_entity_ids(self, requested: list[str], allowed: set[str]) -> list[str]:
        expanded: list[str] = []
        known_entity_ids: list[str] | None = None
        for entity in requested:
            if entity == "*" or entity.endswith(".*"):
                if known_entity_ids is None:
                    known_entity_ids = self._known_entity_ids()
                expanded.extend(item for item in known_entity_ids if entity_allowed(item, {entity}) and entity_allowed(item, allowed))
            else:
                expanded.append(entity)
        return list(dict.fromkeys(expanded))

    def _known_entity_ids(self) -> list[str]:
        if self.hass is None or not hasattr(self.hass, "states"):
            return []
        states = self.hass.states
        if hasattr(states, "async_entity_ids"):
            return sorted(str(entity_id) for entity_id in states.async_entity_ids())
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
        return {
            "entity_id": entity_id,
            "state": getattr(state, "state", None),
            "attributes": dict(getattr(state, "attributes", {}) or {}),
            "last_changed": str(getattr(state, "last_changed", "")),
        }

    async def _history_payload(self, entity_ids: list[str], message: dict[str, Any]) -> Any:
        if self.hass is not None and hasattr(self.hass, "varco_history"):
            return await self.hass.varco_history(entity_ids, message)
        if self.hass is None:
            return {entity_id: [] for entity_id in entity_ids}
        end = self._parse_history_time(message.get("end_time")) or self.now_provider()
        start = self._parse_history_time(message.get("start_time")) or end - timedelta(hours=24)
        try:
            from homeassistant.components.recorder.history import get_significant_states
        except Exception:
            return {entity_id: [] for entity_id in entity_ids}

        def load_history():
            return get_significant_states(
                self.hass,
                start,
                end,
                entity_ids=entity_ids,
                significant_changes_only=False,
                minimal_response=False,
                no_attributes=True,
            )

        raw = await self.hass.async_add_executor_job(load_history)
        return {entity_id: [self._history_point(item) for item in raw.get(entity_id, [])] for entity_id in entity_ids}

    def _parse_history_time(self, value: Any) -> datetime | None:
        if not isinstance(value, str) or not value:
            return None
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)

    def _history_point(self, item: Any) -> dict[str, Any]:
        if isinstance(item, dict):
            state = item.get("state", item.get("s"))
            updated = item.get("last_updated", item.get("last_changed"))
            if updated is None and "lu" in item:
                updated = datetime.fromtimestamp(float(item["lu"]), timezone.utc).isoformat()
            return {"t": str(updated), "state": state, "v": self._numeric_or_none(state)}
        state = getattr(item, "state", None)
        updated = getattr(item, "last_updated", getattr(item, "last_changed", None))
        return {"t": str(updated), "state": state, "v": self._numeric_or_none(state)}

    def _numeric_or_none(self, value: Any) -> float | None:
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    async def _camera_payload(self, entity_id: str) -> str:
        if self.hass is not None and hasattr(self.hass, "varco_camera_snapshot"):
            return await self.hass.varco_camera_snapshot(entity_id)
        return f"snapshot:{entity_id}"
