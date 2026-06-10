import asyncio

from custom_components.varco.authority import VarcoAuthority
from custom_components.varco.crypto import b64url_encode, generate_consumer_keypair, sign_access_request, sign_authenticate
from custom_components.varco.storage import MemoryVarcoStore

TEST_BINDING = b64url_encode(b"\x01" * 32)


class FakeStates:
    def __init__(self):
        self.values = {
            "sensor.temp": {"entity_id": "sensor.temp", "state": "21", "attributes": {"unit_of_measurement": "°C"}},
            "light.cucina": {"entity_id": "light.cucina", "state": "off", "attributes": {}},
            "camera.porta": {"entity_id": "camera.porta", "state": "idle", "attributes": {}},
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


async def paired_authority(manifest):
    store = MemoryVarcoStore()
    hass = FakeHass()
    authority = VarcoAuthority(store=store, hass=hass)
    consumer = generate_consumer_keypair()
    nonce = "nonce"
    pending = await authority.handle_plaintext("s1", {
        "type": "access_request",
        "consumer_pk": consumer["public_key"],
        "manifest": manifest,
        "nonce": nonce,
        "signature": sign_access_request(consumer["private_key"], nonce, manifest),
    })
    grant = await authority.approve_request(pending["access_request_id"])
    auth_nonce = "auth-nonce"
    auth = await authority.handle_plaintext("s1", channel_binding=TEST_BINDING, message={"type": "authenticate", "consumer_pk": consumer["public_key"], "nonce": auth_nonce, "signature": sign_authenticate(consumer["private_key"], auth_nonce, TEST_BINDING)})
    assert auth["type"] == "authenticated"
    return authority, store, hass, grant


def test_get_states_enforces_grant_and_redacts_audit_payloads():
    async def run():
        authority, store, _, _ = await paired_authority({"name": "Demo", "version": "1", "read_entities": ["sensor.temp"]})
        ok = await authority.handle_plaintext("s1", {"type": "get_states", "request_id": "ok", "entity_ids": ["sensor.temp"]})
        assert ok["type"] == "states"
        assert ok["states"]["sensor.temp"]["state"] == "21"
        denied = await authority.handle_plaintext("s1", {"type": "get_states", "request_id": "bad", "entity_ids": ["light.cucina"]})
        assert denied["type"] == "error"
        assert denied["code"] == "permission_denied"
        audit = await store.async_audit_events()
        assert audit[-1]["event"] == "permission_error"
        assert "sensor.temp" not in str(audit[-1])
        assert "light.cucina" not in str(audit[-1])
    asyncio.run(run())


def test_subscription_sends_initial_snapshot_then_only_authorized_deltas_until_unsubscribe():
    async def run():
        authority, _, _, _ = await paired_authority({"name": "Demo", "version": "1", "subscriptions": ["sensor.temp"]})
        snap = await authority.handle_plaintext("s1", {"type": "subscribe_states", "entity_ids": ["sensor.temp"]})
        assert snap["type"] == "state_snapshot"
        sub_id = snap["subscription_id"]
        events = await authority.state_changed("sensor.temp", {"entity_id": "sensor.temp", "state": "22", "attributes": {}})
        assert events == [("s1", {"type": "state_delta", "subscription_id": sub_id, "states": {"sensor.temp": {"entity_id": "sensor.temp", "state": "22", "attributes": {}}}})]
        await authority.handle_plaintext("s1", {"type": "unsubscribe_states", "subscription_id": sub_id})
        assert await authority.state_changed("sensor.temp", {"entity_id": "sensor.temp", "state": "23", "attributes": {}}) == []
    asyncio.run(run())


def test_call_service_supports_three_action_scope_granularities_and_rejects_others():
    async def run():
        authority, _, hass, _ = await paired_authority({
            "name": "Demo",
            "version": "1",
            "actions": ["light.turn_on@light.cucina", "switch.*", "*@cover.tenda"],
        })
        assert (await authority.handle_plaintext("s1", {"type": "call_service", "domain": "light", "service": "turn_on", "target": {"entity_id": "light.cucina"}}))["type"] == "service_called"
        assert (await authority.handle_plaintext("s1", {"type": "call_service", "domain": "switch", "service": "turn_off", "target": {"entity_id": "switch.pc"}}))["type"] == "service_called"
        assert (await authority.handle_plaintext("s1", {"type": "call_service", "domain": "cover", "service": "open_cover", "target": {"entity_id": "cover.tenda"}}))["type"] == "service_called"
        denied = await authority.handle_plaintext("s1", {"type": "call_service", "domain": "lock", "service": "unlock", "target": {"entity_id": "lock.porta"}})
        assert denied["code"] == "permission_denied"
        assert len(hass.services.calls) == 3
    asyncio.run(run())


def test_domain_wildcard_scope_rejects_cross_domain_entities_and_defines_entity_less_calls():
    async def run():
        authority, _, hass, _ = await paired_authority({
            "name": "Demo",
            "version": "1",
            "actions": ["switch.*", "light.turn_on@light.cucina"],
        })
        denied = await authority.handle_plaintext("s1", {"type": "call_service", "domain": "switch", "service": "turn_off", "target": {"entity_id": "lock.porta"}})
        assert denied["code"] == "permission_denied"
        mixed = await authority.handle_plaintext("s1", {"type": "call_service", "domain": "switch", "service": "turn_off", "target": {"entity_id": ["switch.pc", "lock.porta"]}})
        assert mixed["code"] == "permission_denied"
        assert len(hass.services.calls) == 0
        entity_less = await authority.handle_plaintext("s1", {"type": "call_service", "domain": "switch", "service": "turn_off"})
        assert entity_less["type"] == "service_called"
        entity_less_denied = await authority.handle_plaintext("s1", {"type": "call_service", "domain": "light", "service": "turn_on"})
        assert entity_less_denied["code"] == "permission_denied"
        assert len(hass.services.calls) == 1
    asyncio.run(run())


def test_history_camera_and_revocation_are_enforced_per_message():
    async def run():
        authority, _, _, grant = await paired_authority({
            "name": "Demo",
            "version": "1",
            "history": ["sensor.temp"],
            "camera_snapshots": ["camera.porta"],
        })
        assert (await authority.handle_plaintext("s1", {"type": "history_query", "entity_ids": ["sensor.temp"]}))["type"] == "history_result"
        assert (await authority.handle_plaintext("s1", {"type": "camera_snapshot", "entity_id": "camera.porta"}))["type"] == "camera_snapshot"
        await authority.revoke_grant(grant.grant_id)
        rejected = await authority.handle_plaintext("s1", {"type": "history_query", "entity_ids": ["sensor.temp"]})
        assert rejected["code"] == "grant_revoked"
    asyncio.run(run())


def test_delete_grant_removes_record_and_closes_active_session():
    async def run():
        authority, store, _, grant = await paired_authority({
            "name": "Demo",
            "version": "1",
            "history": ["sensor.temp"],
        })
        deleted = await authority.delete_grant(grant.grant_id)
        assert deleted.grant_id == grant.grant_id
        assert await store.async_list_grants() == []
        rejected = await authority.handle_plaintext("s1", {"type": "history_query", "entity_ids": ["sensor.temp"]})
        assert rejected["code"] == "grant_revoked"
        assert (await store.async_audit_events())[-1]["event"] == "grant_deleted"
    asyncio.run(run())

def test_webrtc_signaling_falls_back_to_relay_when_authority_has_no_peer_stack():
    async def run():
        authority, store, _, _ = await paired_authority({"name": "Demo", "version": "1", "read_entities": ["sensor.temp"]})
        response = await authority.handle_plaintext("s1", {"type": "webrtc_offer", "sdp": "v=0"})
        assert response["type"] == "webrtc_unavailable"
        assert response["fallback"] == "relay"
        assert (await store.async_audit_events())[-1]["event"] == "webrtc_fallback"
    asyncio.run(run())

class FakePeerStack:
    def __init__(self):
        self.calls = []
        self.handler = None

    async def create_answer(self, session_id, offer_sdp, handler):
        self.calls.append((session_id, offer_sdp))
        self.handler = handler
        return {"sdp": "answer-sdp", "sdp_type": "answer"}


def test_webrtc_offer_creates_peer_answer_and_datachannel_uses_same_authority_enforcement():
    async def run():
        peer_stack = FakePeerStack()
        authority, _, _, _ = await paired_authority({"name": "Demo", "version": "1", "read_entities": ["sensor.temp"]})
        authority.peer_stack = peer_stack
        answer = await authority.handle_plaintext("s1", {"type": "webrtc_offer", "request_id": "rtc1", "sdp": "offer-sdp"})
        assert answer == {"type": "webrtc_answer", "request_id": "rtc1", "sdp": "answer-sdp", "sdp_type": "answer", "transport": "p2p"}
        assert peer_stack.calls == [("s1", "offer-sdp")]
        states = await peer_stack.handler({"type": "get_states", "request_id": "dc1", "entity_ids": ["sensor.temp"]})
        assert states["type"] == "states"
        assert states["states"]["sensor.temp"]["state"] == "21"
    asyncio.run(run())

def test_read_scope_domain_wildcard_allows_matching_entities_and_rejects_other_domains():
    async def run():
        authority, _, _, _ = await paired_authority({"name": "Demo", "version": "1", "read_entities": ["sensor.*"], "subscriptions": ["sensor.*"]})
        ok = await authority.handle_plaintext("s1", {"type": "get_states", "entity_ids": ["sensor.temp"]})
        assert ok["type"] == "states"
        assert ok["states"]["sensor.temp"]["state"] == "21"
        snap = await authority.handle_plaintext("s1", {"type": "subscribe_states", "entity_ids": ["sensor.temp"]})
        assert snap["type"] == "state_snapshot"
        denied = await authority.handle_plaintext("s1", {"type": "get_states", "entity_ids": ["light.cucina"]})
        assert denied["code"] == "permission_denied"
    asyncio.run(run())

def test_get_states_can_request_domain_wildcard_and_expands_to_matching_authorized_entities():
    async def run():
        authority, _, _, _ = await paired_authority({"name": "Demo", "version": "1", "read_entities": ["sensor.*"]})
        ok = await authority.handle_plaintext("s1", {"type": "get_states", "entity_ids": ["sensor.*"]})
        assert ok["type"] == "states"
        assert "sensor.temp" in ok["states"]
        assert "light.cucina" not in ok["states"]
    asyncio.run(run())


def test_authenticate_requires_consumer_private_key_signature():
    async def run():
        authority = VarcoAuthority(MemoryVarcoStore(), None)
        consumer = generate_consumer_keypair()
        manifest = {"name": "Demo", "version": "1", "read_entities": ["sensor.temp"]}
        pending = await authority.handle_plaintext("request-session", {
            "type": "access_request",
            "consumer_pk": consumer["public_key"],
            "manifest": manifest,
            "nonce": "request-nonce",
            "signature": sign_access_request(consumer["private_key"], "request-nonce", manifest),
        })
        await authority.approve_request(pending["access_request_id"])
        denied = await authority.handle_plaintext("s1", {"type": "authenticate", "consumer_pk": consumer["public_key"], "nonce": "auth-nonce", "signature": "bad"})
        assert denied["code"] == "bad_signature"
        assert "s1" not in authority.sessions
    asyncio.run(run())

def test_history_query_is_read_only_and_requires_history_scope():
    async def run():
        authority, _, _, _ = await paired_authority({"name": "Demo", "version": "1", "history": ["sensor.temp"]})
        ok = await authority.handle_plaintext("s1", {"type": "history_query", "entity_ids": ["sensor.temp"]})
        assert ok["type"] == "history_result"
        denied = await authority.handle_plaintext("s1", {"type": "call_service", "domain": "light", "service": "turn_on", "target": {"entity_id": "light.cucina"}})
        assert denied["code"] == "permission_denied"
    asyncio.run(run())


def test_call_service_cannot_smuggle_extra_or_non_entity_targets_past_action_scope():
    async def run():
        authority, _, hass, _ = await paired_authority({
            "name": "Demo",
            "version": "1",
            "actions": ["light.turn_on@light.cucina"],
        })
        smuggled = await authority.handle_plaintext("s1", {"type": "call_service", "domain": "light", "service": "turn_on", "target": {"entity_id": ["light.cucina", "lock.porta"]}})
        assert smuggled["code"] == "permission_denied"
        area = await authority.handle_plaintext("s1", {"type": "call_service", "domain": "light", "service": "turn_on", "target": {"entity_id": "light.cucina", "area_id": "casa"}})
        assert area["code"] == "permission_denied"
        via_data = await authority.handle_plaintext("s1", {"type": "call_service", "domain": "light", "service": "turn_on", "service_data": {"entity_id": "lock.porta"}})
        assert via_data["code"] == "permission_denied"
        assert hass.services.calls == []
        ok = await authority.handle_plaintext("s1", {"type": "call_service", "domain": "light", "service": "turn_on", "target": {"entity_id": "light.cucina"}})
        assert ok["type"] == "service_called"
        assert len(hass.services.calls) == 1
    asyncio.run(run())


def test_state_changed_does_not_queue_outbox_copies_for_live_delivery():
    async def run():
        authority, _, _, _ = await paired_authority({"name": "Demo", "version": "1", "subscriptions": ["sensor.temp"]})
        await authority.handle_plaintext("s1", {"type": "subscribe_states", "entity_ids": ["sensor.temp"]})
        for value in ("22", "23", "24"):
            events = await authority.state_changed("sensor.temp", {"entity_id": "sensor.temp", "state": value, "attributes": {}})
            assert len(events) == 1
        assert await authority.pop_outbox("s1") == []
    asyncio.run(run())


def test_queue_event_coalesces_state_deltas_latest_state_wins():
    async def run():
        authority, _, _, _ = await paired_authority({"name": "Demo", "version": "1", "subscriptions": ["sensor.temp"]})
        snap = await authority.handle_plaintext("s1", {"type": "subscribe_states", "entity_ids": ["sensor.temp"]})
        sub_id = snap["subscription_id"]
        for value in ("22", "23", "24"):
            authority.queue_event("s1", {"type": "state_delta", "subscription_id": sub_id, "states": {"sensor.temp": {"entity_id": "sensor.temp", "state": value, "attributes": {}}}})
        outbox = await authority.pop_outbox("s1")
        assert len(outbox) == 1
        assert outbox[0]["states"]["sensor.temp"]["state"] == "24"
        assert await authority.pop_outbox("s1") == []
    asyncio.run(run())


def test_queue_event_bounds_outbox_and_drops_oldest():
    async def run():
        from custom_components.varco.authority import OUTBOX_MAX_EVENTS

        authority, _, _, _ = await paired_authority({"name": "Demo", "version": "1", "subscriptions": ["sensor.temp"]})
        for index in range(OUTBOX_MAX_EVENTS + 10):
            authority.queue_event("s1", {"type": "state_delta", "subscription_id": f"sub-{index}", "states": {"sensor.temp": {"state": str(index)}}})
        outbox = await authority.pop_outbox("s1")
        assert len(outbox) == OUTBOX_MAX_EVENTS
        assert outbox[0]["subscription_id"] == "sub-10"
        assert outbox[-1]["subscription_id"] == f"sub-{OUTBOX_MAX_EVENTS + 9}"
    asyncio.run(run())


def test_queue_event_for_unknown_session_is_dropped():
    async def run():
        authority, _, _, _ = await paired_authority({"name": "Demo", "version": "1", "subscriptions": ["sensor.temp"]})
        authority.queue_event("ghost", {"type": "state_delta", "subscription_id": "x", "states": {}})
        assert "ghost" not in authority.sessions
    asyncio.run(run())
