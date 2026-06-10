import asyncio

from custom_components.varco.authority import VarcoAuthority
from custom_components.varco.crypto import b64url_encode, generate_consumer_keypair, sign_access_request, sign_authenticate
from custom_components.varco.policy import trim_manifest
from custom_components.varco.storage import MemoryVarcoStore

TEST_BINDING = b64url_encode(b"\x01" * 32)


class FakeStates:
    def __init__(self):
        self.values = {
            "sensor.temp": {"entity_id": "sensor.temp", "state": "21", "attributes": {}},
            "sensor.umidita": {"entity_id": "sensor.umidita", "state": "55", "attributes": {}},
            "light.cucina": {"entity_id": "light.cucina", "state": "off", "attributes": {}},
        }

    def get(self, entity_id):
        return self.values.get(entity_id)


class FakeServices:
    def __init__(self):
        self.calls = []

    async def async_call(self, domain, service, service_data, target=None, blocking=False):
        self.calls.append((domain, service, service_data, target, blocking))


class FakeHass:
    def __init__(self):
        self.states = FakeStates()
        self.services = FakeServices()


REQUESTED = {
    "name": "Demo",
    "version": "1",
    "read_entities": ["sensor.temp", "sensor.umidita"],
    "subscriptions": [],
    "history": [],
    "camera_snapshots": [],
    "actions": ["light.turn_on@light.cucina"],
}


async def paired_authority(approved_manifest=None):
    store = MemoryVarcoStore()
    hass = FakeHass()
    authority = VarcoAuthority(store=store, hass=hass)
    consumer = generate_consumer_keypair()
    nonce = "nonce"
    pending = await authority.handle_plaintext("s1", {
        "type": "access_request",
        "consumer_pk": consumer["public_key"],
        "manifest": REQUESTED,
        "nonce": nonce,
        "signature": sign_access_request(consumer["private_key"], nonce, REQUESTED),
    })
    grant = await authority.approve_request(pending["access_request_id"], approved_manifest=approved_manifest)
    auth_nonce = "auth-nonce"
    auth = await authority.handle_plaintext("s1", channel_binding=TEST_BINDING, message={"type": "authenticate", "consumer_pk": consumer["public_key"], "nonce": auth_nonce, "signature": sign_authenticate(consumer["private_key"], auth_nonce, TEST_BINDING)})
    assert auth["type"] == "authenticated"
    return authority, hass, grant


def test_trim_manifest_intersects_and_never_widens():
    trimmed = trim_manifest(REQUESTED, {
        "read_entities": ["sensor.temp", "sensor.not_requested"],
        "actions": [],
    })
    assert trimmed["read_entities"] == ["sensor.temp"]
    assert trimmed["actions"] == []
    assert trimmed["subscriptions"] == []
    assert trimmed["name"] == "Demo"


def test_approve_without_trimming_keeps_full_manifest():
    async def run():
        _, _, grant = await paired_authority()
        assert grant.manifest["read_entities"] == ["sensor.temp", "sensor.umidita"]
        assert grant.manifest["actions"] == ["light.turn_on@light.cucina"]
    asyncio.run(run())


def test_trimmed_grant_is_enforced_on_data_plane():
    async def run():
        authority, hass, grant = await paired_authority(approved_manifest={"read_entities": ["sensor.temp"], "actions": []})
        assert grant.manifest["read_entities"] == ["sensor.temp"]
        assert grant.manifest["actions"] == []

        ok = await authority.handle_plaintext("s1", {"type": "get_states", "request_id": "ok", "entity_ids": ["sensor.temp"]})
        assert ok["type"] == "states"

        denied = await authority.handle_plaintext("s1", {"type": "get_states", "request_id": "bad", "entity_ids": ["sensor.umidita"]})
        assert denied["type"] == "error"
        assert denied["code"] == "permission_denied"

        action = await authority.handle_plaintext("s1", {"type": "call_service", "request_id": "act", "domain": "light", "service": "turn_on", "target": {"entity_id": "light.cucina"}})
        assert action["type"] == "error"
        assert action["code"] == "permission_denied"
        assert hass.services.calls == []
    asyncio.run(run())
