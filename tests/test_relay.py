import asyncio
import sys
import types

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF


def _install_homeassistant_stubs():
    if "homeassistant" in sys.modules:
        return
    ha = types.ModuleType("homeassistant")
    components = types.ModuleType("homeassistant.components")
    persistent_notification = types.ModuleType("homeassistant.components.persistent_notification")
    persistent_notification.async_create = lambda hass, message, title=None, notification_id=None: None
    persistent_notification.async_dismiss = lambda hass, notification_id: None
    core = types.ModuleType("homeassistant.core")
    core.callback = lambda func: func
    helpers = types.ModuleType("homeassistant.helpers")
    aiohttp_client = types.ModuleType("homeassistant.helpers.aiohttp_client")
    aiohttp_client.async_get_clientsession = lambda hass: None
    config_validation = types.ModuleType("homeassistant.helpers.config_validation")
    config_validation.string = str
    config_validation.boolean = bool
    components.persistent_notification = persistent_notification
    helpers.aiohttp_client = aiohttp_client
    helpers.config_validation = config_validation
    ha.components = components
    ha.core = core
    ha.helpers = helpers
    sys.modules["homeassistant"] = ha
    sys.modules["homeassistant.components"] = components
    sys.modules["homeassistant.components.persistent_notification"] = persistent_notification
    sys.modules["homeassistant.core"] = core
    sys.modules["homeassistant.helpers"] = helpers
    sys.modules["homeassistant.helpers.aiohttp_client"] = aiohttp_client
    sys.modules["homeassistant.helpers.config_validation"] = config_validation


_install_homeassistant_stubs()

from custom_components.varco import relay as relay_module
from custom_components.varco.crypto import (
    b64url_decode,
    b64url_encode,
    canonical_json,
    challenge_payload,
    generate_authority_keypair,
    verify_signature,
)
from custom_components.varco.models import AccessRequest, Grant
from custom_components.varco.relay import VarcoRelay
from custom_components.varco.storage import MemoryVarcoStore

import json


class FakeHass:
    pass


def make_relay():
    keys = generate_authority_keypair()
    entry_data = {
        "authority_id": keys["authority_id"],
        "private_key": keys["private_key"],
        "bridge_ws_url": "wss://bridge.example/ws",
        "webrtc_enabled": False,
    }
    relay = VarcoRelay(hass=FakeHass(), entry_data=entry_data, store=MemoryVarcoStore())
    sent = []

    async def fake_send(message):
        sent.append(message)

    relay._send = fake_send
    return relay, keys, sent


class FakeClient:
    """Consumer-side half of the secure session handshake."""

    def __init__(self):
        self._private = ec.generate_private_key(ec.SECP256R1())
        self._send = None
        self._recv = None
        self._send_nonce = 0
        self._recv_nonce = 0

    @property
    def client_pub(self):
        der = self._private.public_key().public_bytes(
            serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo
        )
        return b64url_encode(der)

    def finish(self, hello, authority_id):
        server_public = serialization.load_der_public_key(b64url_decode(hello["server_pub"]))
        shared = self._private.exchange(ec.ECDH(), server_public)
        salt = b64url_decode(authority_id)

        def hkdf(info):
            return HKDF(algorithm=hashes.SHA256(), length=32, salt=salt, info=info).derive(shared)

        self._send = AESGCM(hkdf(b"varco-session-c2s-v1"))
        self._recv = AESGCM(hkdf(b"varco-session-s2c-v1"))

    def encrypt(self, payload):
        nonce = self._send_nonce.to_bytes(12, "big")
        self._send_nonce += 1
        body = self._send.encrypt(nonce, canonical_json(payload), None)
        return {"type": "ciphertext", "nonce": b64url_encode(nonce), "body": b64url_encode(body)}

    def decrypt(self, envelope):
        nonce = b64url_decode(envelope["nonce"])
        assert nonce == self._recv_nonce.to_bytes(12, "big")
        self._recv_nonce += 1
        body = b64url_decode(envelope["body"])
        return json.loads(self._recv.decrypt(nonce, body, None).decode())


async def _handshake(relay, keys, sent, session_id="s1"):
    client = FakeClient()
    await relay._handle_bridge_message({
        "type": "client_message",
        "sessionId": session_id,
        "payload": {"type": "client_hello", "client_pub": client.client_pub},
    })
    frame = sent.pop()
    assert frame["type"] == "authority_message"
    assert frame["payload"]["type"] == "server_hello"
    client.finish(frame["payload"], keys["authority_id"])
    return client


def test_challenge_message_replies_with_valid_signature():
    async def run():
        relay, keys, sent = make_relay()
        nonce = b64url_encode(b"\x07" * 32)
        await relay._handle_bridge_message({"type": "challenge", "nonce": nonce})
        assert len(sent) == 1
        assert sent[0]["type"] == "auth"
        assert verify_signature(keys["public_key"], sent[0]["signature"], challenge_payload(nonce))
    asyncio.run(run())


def test_ready_marks_connected_and_clears_error():
    async def run():
        relay, _, _ = make_relay()
        relay.status.update({"connected": False, "last_error": "boom"})
        await relay._handle_bridge_message({"type": "ready"})
        assert relay.status["connected"] is True
        assert relay.status["last_error"] is None
    asyncio.run(run())


def test_ready_records_bridge_url_and_last_connected():
    async def run():
        from datetime import datetime

        relay, _, _ = make_relay()
        assert relay.status["bridge_url"] == "wss://bridge.example/ws"
        await relay._handle_bridge_message({"type": "ready"})
        assert relay.status["bridge_url"] == "wss://bridge.example/ws"
        last_connected = relay.status["last_connected"]
        assert isinstance(last_connected, str) and last_connected
        # Parses as an ISO 8601 timestamp.
        datetime.fromisoformat(last_connected)
    asyncio.run(run())


def test_client_connected_and_disconnected_manage_sessions():
    async def run():
        relay, _, _ = make_relay()
        await relay._handle_bridge_message({"type": "client_connected", "sessionId": "s1"})
        assert "s1" in relay.sessions
        await relay._handle_bridge_message({"type": "client_disconnected", "sessionId": "s1"})
        assert "s1" not in relay.sessions
    asyncio.run(run())


def test_client_hello_establishes_secure_session():
    async def run():
        relay, keys, sent = make_relay()
        await _handshake(relay, keys, sent)
        assert relay.sessions["s1"].secure is not None
    asyncio.run(run())


def test_message_before_hello_closes_with_session_not_ready():
    async def run():
        relay, _, sent = make_relay()
        await relay._handle_bridge_message({
            "type": "client_message",
            "sessionId": "s1",
            "payload": {"type": "ciphertext", "nonce": "AAAA", "body": "AAAA"},
        })
        assert sent == [{"type": "close_client", "sessionId": "s1", "reason": "session_not_ready"}]
    asyncio.run(run())


def test_decrypt_failure_returns_generic_session_error():
    async def run():
        relay, keys, sent = make_relay()
        client = await _handshake(relay, keys, sent)
        garbage = {"type": "ciphertext", "nonce": b64url_encode(b"\x00" * 12), "body": b64url_encode(b"\x00" * 32)}
        await relay._handle_bridge_message({"type": "client_message", "sessionId": "s1", "payload": garbage})
        response = client.decrypt(sent.pop()["payload"])
        assert response == {"type": "error", "code": "session_error", "message": "Internal error"}
    asyncio.run(run())


def test_handler_exception_is_not_leaked_to_client():
    async def run():
        relay, keys, sent = make_relay()
        client = await _handshake(relay, keys, sent)

        async def boom(session_id, plaintext, channel_binding=None):
            raise RuntimeError("secret internal detail")

        relay.authority.handle_plaintext = boom
        await relay._handle_bridge_message({
            "type": "client_message",
            "sessionId": "s1",
            "payload": client.encrypt({"type": "get_states"}),
        })
        response = client.decrypt(sent.pop()["payload"])
        assert response["code"] == "session_error"
        assert "secret internal detail" not in json.dumps(response)
    asyncio.run(run())


def test_outbox_events_are_encrypted_and_flushed_after_response():
    async def run():
        relay, keys, sent = make_relay()
        client = await _handshake(relay, keys, sent)
        events = [{"type": "state_delta", "seq": 1}, {"type": "state_delta", "seq": 2}]

        async def fake_handle(session_id, plaintext, channel_binding=None):
            return {"type": "pong"}

        async def fake_pop_outbox(session_id):
            return list(events)

        relay.authority.handle_plaintext = fake_handle
        relay.authority.pop_outbox = fake_pop_outbox
        await relay._handle_bridge_message({
            "type": "client_message",
            "sessionId": "s1",
            "payload": client.encrypt({"type": "ping"}),
        })
        assert len(sent) == 3
        assert client.decrypt(sent[0]["payload"]) == {"type": "pong"}
        assert client.decrypt(sent[1]["payload"]) == events[0]
        assert client.decrypt(sent[2]["payload"]) == events[1]
    asyncio.run(run())


def test_notify_owner_includes_pairing_code_truncated_key_and_scopes(monkeypatch):
    async def run():
        relay, _, _ = make_relay()
        captured = {}

        def fake_create(hass, message, title=None, notification_id=None):
            captured.update({"message": message, "title": title, "notification_id": notification_id})

        monkeypatch.setattr(relay_module.persistent_notification, "async_create", fake_create)
        consumer_pk = "A" * 20 + "B" * 20
        request = AccessRequest(
            request_id="req-1",
            consumer_pk=consumer_pk,
            manifest={
                "name": "Demo Dashboard",
                "version": "2.0.0",
                "read_entities": [f"sensor.s{i}" for i in range(10)],
                "subscriptions": ["sensor.s0"],
                "history": [],
                "camera_snapshots": ["camera.porta"],
                "actions": ["light.turn_on@light.cucina"],
            },
            nonce="n",
            pairing_code="123456",
        )
        await relay._notify_owner(request)
        message = captured["message"]
        assert captured["notification_id"] == "varco_req-1"
        assert "**123456**" in message
        truncated = consumer_pk[:12] + "..." + consumer_pk[-8:]
        assert truncated in message
        assert consumer_pk not in message
        assert "version `2.0.0`" in message
        assert "`sensor.s7`, +2 more" in message
        assert "Live subscriptions: `sensor.s0`" in message
        assert "History: none" in message
        assert "Camera snapshots: `camera.porta`" in message
        assert "Home Assistant actions: `light.turn_on@light.cucina`" in message
    asyncio.run(run())


def test_client_disconnected_discards_authority_session_state():
    async def run():
        relay, _, _ = make_relay()
        await relay._handle_bridge_message({"type": "client_connected", "sessionId": "s1"})
        relay.authority._session("s1")
        relay.authority.queue_event("s1", {"type": "state_delta", "subscription_id": "sub", "states": {}})
        await relay._handle_bridge_message({"type": "client_disconnected", "sessionId": "s1"})
        assert "s1" not in relay.sessions
        assert "s1" not in relay.authority.sessions
    asyncio.run(run())


def test_push_state_changed_sends_live_without_retaining_outbox_copy():
    async def run():
        relay, keys, sent = make_relay()
        client = await _handshake(relay, keys, sent)
        relay.authority._session("s1")
        event = {"type": "state_delta", "subscription_id": "sub", "states": {"sensor.temp": {"state": "22"}}}

        async def fake_state_changed(entity_id, state):
            return [("s1", event)]

        relay.authority.state_changed = fake_state_changed
        await relay._push_state_changed("sensor.temp", None)
        assert len(sent) == 1
        assert client.decrypt(sent[0]["payload"]) == event
        assert await relay.authority.pop_outbox("s1") == []
    asyncio.run(run())


def test_restriction_update_sends_queued_error_to_live_client():
    async def run():
        relay, keys, sent = make_relay()
        client = await _handshake(relay, keys, sent)
        grant = Grant(
            grant_id="g1",
            consumer_pk="consumer-pk",
            manifest={"name": "Demo", "version": "1", "subscriptions": ["sensor.temp"]},
        )
        await relay.store.async_upsert_grant(grant)
        relay.authority._session("s1").consumer_pk = grant.consumer_pk

        updated = await relay.set_grant_restrictions(
            grant.grant_id,
            [{"id": "hours", "type": "schedule", "applies_to": "subscriptions", "params": {}}],
        )

        assert updated.grant_id == grant.grant_id
        assert len(sent) == 1
        frame = sent[0]
        assert frame["type"] == "authority_message"
        assert frame["sessionId"] == "s1"
        assert client.decrypt(frame["payload"])["code"] == "grant_restrictions_updated"

    asyncio.run(run())


def test_push_state_changed_queues_bounded_when_session_has_no_secure_channel():
    async def run():
        relay, _, sent = make_relay()
        relay.authority._session("s1")

        def make_fake(value):
            async def fake_state_changed(entity_id, state):
                return [("s1", {"type": "state_delta", "subscription_id": "sub", "states": {entity_id: {"state": value}}})]
            return fake_state_changed

        for value in ("22", "23"):
            relay.authority.state_changed = make_fake(value)
            await relay._push_state_changed("sensor.temp", None)
        assert sent == []
        outbox = await relay.authority.pop_outbox("s1")
        assert len(outbox) == 1
        assert outbox[0]["states"]["sensor.temp"]["state"] == "23"
    asyncio.run(run())


def test_run_backs_off_after_clean_close(monkeypatch):
    """Clean WebSocket closes (e.g. bridge replacing the connection) must not
    cause an immediate reconnect loop. Regression test for the tight loop that
    exhausted the Durable Objects free-tier request volume."""
    async def run():
        relay, _, _ = make_relay()
        relay._reconnect_initial_delay = 5.0
        monkeypatch.setattr(relay_module, "async_get_clientsession", lambda hass: None)
        connects = []

        async def fake_connect(session):
            connects.append(1)
            if len(connects) >= 3:
                relay._stop_event.set()

        relay._connect = fake_connect
        waits = []
        real_wait_for = asyncio.wait_for

        async def fake_wait_for(awaitable, timeout):
            waits.append(timeout)
            awaitable.close()
            raise TimeoutError

        monkeypatch.setattr(asyncio, "wait_for", fake_wait_for)
        try:
            await relay._run()
        finally:
            monkeypatch.setattr(asyncio, "wait_for", real_wait_for)
        assert len(connects) == 3
        # A wait happens after every clean close, with exponential backoff.
        assert waits == [5.0, 10.0]
    asyncio.run(run())


def test_run_resets_backoff_after_long_lived_connection(monkeypatch):
    async def run():
        relay, _, _ = make_relay()
        relay._reconnect_initial_delay = 5.0
        monkeypatch.setattr(relay_module, "async_get_clientsession", lambda hass: None)
        fake_now = [0.0]
        monkeypatch.setattr(relay_module.time, "monotonic", lambda: fake_now[0])
        connects = []

        async def fake_connect(session):
            connects.append(1)
            if len(connects) == 2:
                fake_now[0] += 120.0  # second connection stays up for 2 minutes
            if len(connects) >= 3:
                relay._stop_event.set()

        relay._connect = fake_connect
        waits = []
        real_wait_for = asyncio.wait_for

        async def fake_wait_for(awaitable, timeout):
            waits.append(timeout)
            awaitable.close()
            raise TimeoutError

        monkeypatch.setattr(asyncio, "wait_for", fake_wait_for)
        try:
            await relay._run()
        finally:
            monkeypatch.setattr(asyncio, "wait_for", real_wait_for)
        assert waits == [5.0, 5.0]
    asyncio.run(run())


def test_signaling_responses_carry_lane_tag_and_data_plane_responses_do_not():
    async def run():
        relay, keys, sent = make_relay()
        client = await _handshake(relay, keys, sent)

        responses = iter([
            {"type": "authenticated", "grant_id": "g1"},
            {"type": "webrtc_answer", "sdp": "x"},
            {"type": "states", "states": {}},
        ])

        async def fake_handle(session_id, plaintext, channel_binding=None):
            return next(responses)

        relay.authority.handle_plaintext = fake_handle
        for typ in ("authenticate", "webrtc_offer", "get_states"):
            await relay._handle_bridge_message({
                "type": "client_message",
                "sessionId": "s1",
                "payload": client.encrypt({"type": typ}),
            })
        assert sent[0]["payload"]["lane"] == "signaling"
        assert sent[1]["payload"]["lane"] == "signaling"
        assert "lane" not in sent[2]["payload"]
        # The lane tag is envelope metadata only; payloads stay encrypted.
        assert client.decrypt(sent[0]["payload"]) == {"type": "authenticated", "grant_id": "g1"}
        assert client.decrypt(sent[1]["payload"]) == {"type": "webrtc_answer", "sdp": "x"}
        assert client.decrypt(sent[2]["payload"]) == {"type": "states", "states": {}}
    asyncio.run(run())


def test_challenge_with_matching_proto_replies_with_auth_and_proto():
    async def run():
        relay, keys, sent = make_relay()
        nonce = b64url_encode(b"\x07" * 32)
        await relay._handle_bridge_message({"type": "challenge", "nonce": nonce, "proto": relay_module.PROTO_VERSION})
        assert len(sent) == 1
        assert sent[0]["type"] == "auth"
        assert sent[0]["proto"] == relay_module.PROTO_VERSION
    asyncio.run(run())


def test_challenge_with_mismatched_proto_is_terminal_and_sends_no_auth():
    async def run():
        relay, _, sent = make_relay()

        class FakeWs:
            closed = False

            def __init__(self):
                self.close_calls = 0

            async def close(self):
                self.close_calls += 1

        relay._ws = FakeWs()
        await relay._handle_bridge_message({"type": "challenge", "nonce": b64url_encode(b"\x07" * 32), "proto": relay_module.PROTO_VERSION + 1})
        assert sent == []
        assert relay._ws.close_calls == 1
        assert "protocol version" in relay._terminal_reason
    asyncio.run(run())


def test_run_pauses_long_after_repeated_terminal_close_codes(monkeypatch):
    """Deterministic rejections (4401/4403/4406) must not retry on the normal
    backoff forever: after TERMINAL_AFTER_ATTEMPTS the relay waits the long
    terminal interval and raises a persistent notification."""
    async def run():
        relay, _, _ = make_relay()
        relay._reconnect_initial_delay = 5.0
        relay._terminal_retry_delay = 3600.0
        monkeypatch.setattr(relay_module, "async_get_clientsession", lambda hass: None)
        notifications = []
        monkeypatch.setattr(
            relay_module.persistent_notification,
            "async_create",
            lambda hass, message, title=None, notification_id=None: notifications.append(message),
        )
        connects = []

        async def fake_connect(session):
            connects.append(1)
            if len(connects) >= 4:
                relay._stop_event.set()
            return 4403

        relay._connect = fake_connect
        waits = []
        real_wait_for = asyncio.wait_for

        async def fake_wait_for(awaitable, timeout):
            waits.append(timeout)
            awaitable.close()
            raise TimeoutError

        monkeypatch.setattr(asyncio, "wait_for", fake_wait_for)
        try:
            await relay._run()
        finally:
            monkeypatch.setattr(asyncio, "wait_for", real_wait_for)
        # Two normal backoff waits, then the third 4403 trips the terminal pause.
        assert waits == [5.0, 10.0, 3600.0]
        assert len(notifications) == 1
        assert "4403" in notifications[0]
    asyncio.run(run())


def test_ready_resets_terminal_failures_and_dismisses_notification(monkeypatch):
    async def run():
        relay, _, _ = make_relay()
        relay._terminal_failures = 2
        dismissed = []
        monkeypatch.setattr(
            relay_module.persistent_notification,
            "async_dismiss",
            lambda hass, notification_id: dismissed.append(notification_id),
        )
        await relay._handle_bridge_message({"type": "ready"})
        assert relay._terminal_failures == 0
        assert dismissed == ["varco_relay_paused"]
    asyncio.run(run())


def test_terminal_proto_mismatch_pauses_without_counting_attempts(monkeypatch):
    """A proto mismatch detected in the challenge pauses on the first attempt."""
    async def run():
        relay, _, _ = make_relay()
        relay._terminal_retry_delay = 3600.0
        monkeypatch.setattr(relay_module, "async_get_clientsession", lambda hass: None)
        notifications = []
        monkeypatch.setattr(
            relay_module.persistent_notification,
            "async_create",
            lambda hass, message, title=None, notification_id=None: notifications.append(message),
        )

        async def fake_connect(session):
            relay._terminal_reason = "the bridge requires protocol version 2"
            relay._stop_event_armed = True
            return 1000

        relay._connect = fake_connect
        waits = []
        real_wait_for = asyncio.wait_for

        async def fake_wait_for(awaitable, timeout):
            waits.append(timeout)
            awaitable.close()
            relay._stop_event.set()
            raise TimeoutError

        monkeypatch.setattr(asyncio, "wait_for", fake_wait_for)
        try:
            await relay._run()
        finally:
            monkeypatch.setattr(asyncio, "wait_for", real_wait_for)
        assert waits == [3600.0]
        assert len(notifications) == 1
        assert "protocol version" in notifications[0]
    asyncio.run(run())
