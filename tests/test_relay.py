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
from custom_components.varco.models import AccessRequest
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
        assert relay.status == {"connected": True, "last_error": None}
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
