import asyncio
import types
from contextlib import contextmanager

import custom_components.varco.authority as authority_module
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


def test_grant_info_returns_stored_manifest_after_authentication():
    async def run():
        manifest = {"name": "Shared gate", "version": "1", "read_entities": ["sensor.temp"], "subscriptions": ["sensor.temp"], "actions": ["cover.open_cover@cover.gate"]}
        authority, _, _, grant = await paired_authority(manifest)
        info = await authority.handle_plaintext("s1", {"type": "grant_info", "request_id": "info"})
        assert info == {"type": "grant_info", "request_id": "info", "grant_id": grant.grant_id, "manifest": manifest}

    asyncio.run(run())


def test_preapproved_grant_authenticates_without_access_request():
    async def run():
        store = MemoryVarcoStore()
        hass = FakeHass()
        authority = VarcoAuthority(store=store, hass=hass)
        manifest = {"name": "Shared gate", "version": "1", "read_entities": ["sensor.temp"]}
        grant, identity = await authority.create_preapproved_grant(manifest)
        auth = await authority.handle_plaintext("share", channel_binding=TEST_BINDING, message={
            "type": "authenticate",
            "consumer_pk": identity["public_key"],
            "nonce": "auth-nonce",
            "signature": sign_authenticate(identity["private_key"], "auth-nonce", TEST_BINDING),
        })
        assert auth["type"] == "authenticated"
        assert auth["grant_id"] == grant.grant_id
        assert auth["manifest"] == manifest

    asyncio.run(run())


def test_claim_share_mints_grants_until_max_claims():
    async def run():
        store = MemoryVarcoStore()
        authority = VarcoAuthority(store=store, hass=FakeHass())
        manifest = {"name": "Mario gate access", "version": "1", "read_entities": ["sensor.temp"]}
        share, secret = await authority.create_share("Mario gate access", manifest, max_claims=1, note="Mario phone")
        consumer = generate_consumer_keypair()
        claimed = await authority.handle_plaintext("claim", {"type": "claim_share", "share_id": share.share_id, "secret": secret, "consumer_pk": consumer["public_key"]})
        assert claimed["type"] == "share_claimed"
        grant = await store.async_get_grant_by_consumer(consumer["public_key"])
        assert grant.name == "Mario gate access"
        assert grant.note == "Mario phone"
        assert grant.share_id == share.share_id
        other = generate_consumer_keypair()
        denied = await authority.handle_plaintext("claim2", {"type": "claim_share", "share_id": share.share_id, "secret": secret, "consumer_pk": other["public_key"]})
        assert denied["type"] == "error"
        assert denied["code"] == "share_claims_exhausted"

    asyncio.run(run())

def test_same_consumer_can_reuse_claimed_share_link_after_exhaustion():
    async def run():
        store = MemoryVarcoStore()
        authority = VarcoAuthority(store=store, hass=FakeHass())
        manifest = {"name": "Reusable device", "version": "1", "read_entities": ["sensor.temp"]}
        share, secret = await authority.create_share("Reusable device", manifest, max_claims=1)
        consumer = generate_consumer_keypair()

        first = await authority.handle_plaintext("claim", {"type": "claim_share", "share_id": share.share_id, "secret": secret, "consumer_pk": consumer["public_key"]})
        second = await authority.handle_plaintext("claim-again", {"type": "claim_share", "share_id": share.share_id, "secret": secret, "consumer_pk": consumer["public_key"]})

        assert first["type"] == "share_claimed"
        assert second["type"] == "share_claimed"
        assert second["grant_id"] == first["grant_id"]
        assert (await store.async_get_share(share.share_id)).claims_used == 1

    asyncio.run(run())

def test_same_consumer_cannot_collapse_different_share_to_old_grant():
    async def run():
        store = MemoryVarcoStore()
        authority = VarcoAuthority(store=store, hass=FakeHass())
        first_share, first_secret = await authority.create_share("First", {"name": "First", "version": "1", "read_entities": ["sensor.temp"]}, max_claims=1)
        second_share, second_secret = await authority.create_share("Second", {"name": "Second", "version": "1", "read_entities": ["light.cucina"]}, max_claims=1)
        consumer = generate_consumer_keypair()

        first = await authority.handle_plaintext("claim", {"type": "claim_share", "share_id": first_share.share_id, "secret": first_secret, "consumer_pk": consumer["public_key"]})
        second = await authority.handle_plaintext("claim2", {"type": "claim_share", "share_id": second_share.share_id, "secret": second_secret, "consumer_pk": consumer["public_key"]})

        assert first["type"] == "share_claimed"
        assert second["type"] == "error"
        assert second["code"] == "consumer_already_claimed"
        assert (await store.async_get_share(second_share.share_id)).claims_used == 0

    asyncio.run(run())


def test_concurrent_claims_only_mint_max_claims():
    async def run():
        store = MemoryVarcoStore()
        authority = VarcoAuthority(store=store, hass=FakeHass())
        manifest = {"name": "One seat", "version": "1", "read_entities": ["sensor.temp"]}
        share, secret = await authority.create_share("One seat", manifest, max_claims=1)
        consumers = [generate_consumer_keypair() for _ in range(8)]

        results = await asyncio.gather(*[
            authority.handle_plaintext(f"claim-{idx}", {"type": "claim_share", "share_id": share.share_id, "secret": secret, "consumer_pk": consumer["public_key"]})
            for idx, consumer in enumerate(consumers)
        ])

        assert sum(result["type"] == "share_claimed" for result in results) == 1
        assert sum(result.get("code") == "share_claims_exhausted" for result in results) == 7
        assert len(await store.async_list_grants()) == 1
        assert (await store.async_get_share(share.share_id)).claims_used == 1

    asyncio.run(run())
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
        assert ok["truncated"] is False
        assert ok["range_clamped"] is False
        denied = await authority.handle_plaintext("s1", {"type": "call_service", "domain": "light", "service": "turn_on", "target": {"entity_id": "light.cucina"}})
        assert denied["code"] == "permission_denied"
    asyncio.run(run())


def test_history_query_rejects_too_many_entities():
    async def run():
        authority, store, _, _ = await paired_authority({"name": "Demo", "version": "1", "history": ["sensor.*"]})
        entity_ids = [f"sensor.temp_{i}" for i in range(11)]
        rejected = await authority.handle_plaintext("s1", {"type": "history_query", "entity_ids": entity_ids})
        assert rejected["code"] == "history_limit_exceeded"
        events = await store.async_audit_events()
        assert events[-1]["event"] == "history_query_limited"
        assert events[-1]["details"]["reason"] == "too_many_entities"
    asyncio.run(run())


def test_history_query_clamps_time_range_and_truncates_results():
    async def run():
        from custom_components.varco.authority import MAX_HISTORY_DAYS, MAX_HISTORY_POINTS_PER_ENTITY

        authority, store, hass, _ = await paired_authority({"name": "Demo", "version": "1", "history": ["sensor.temp"]})
        seen = {}

        async def varco_history(entity_ids, message):
            seen["message"] = message
            return {entity_id: [{"t": "x", "state": "1", "v": 1.0}] * (MAX_HISTORY_POINTS_PER_ENTITY + 100) for entity_id in entity_ids}

        hass.varco_history = varco_history
        result = await authority.handle_plaintext("s1", {
            "type": "history_query",
            "entity_ids": ["sensor.temp"],
            "start_time": "2000-01-01T00:00:00+00:00",
        })
        assert result["type"] == "history_result"
        assert result["range_clamped"] is True
        assert result["truncated"] is True
        assert len(result["history"]["sensor.temp"]) == MAX_HISTORY_POINTS_PER_ENTITY
        from datetime import datetime, timedelta, timezone
        start = datetime.fromisoformat(seen["message"]["start_time"])
        end = datetime.fromisoformat(seen["message"]["end_time"])
        assert end - start <= timedelta(days=MAX_HISTORY_DAYS)
        events = await store.async_audit_events()
        assert events[-1]["event"] == "history_query_limited"
        assert events[-1]["details"]["truncated"] is True
        assert events[-1]["details"]["range_clamped"] is True
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


def test_data_plane_rate_limit_rejects_with_rate_limited_and_audits_without_payloads():
    async def run():
        authority, store, _, _ = await paired_authority({"name": "Demo", "version": "1", "read_entities": ["sensor.temp"]})
        clock = {"now": 1000.0}
        authority.monotonic_provider = lambda: clock["now"]
        authority.data_plane_rate_limit = 3
        for i in range(3):
            ok = await authority.handle_plaintext("s1", {"type": "get_states", "request_id": f"r{i}", "entity_ids": ["sensor.temp"]})
            assert ok["type"] == "states"
        limited = await authority.handle_plaintext("s1", {"type": "get_states", "request_id": "r3", "entity_ids": ["sensor.temp"]})
        assert limited["type"] == "error"
        assert limited["code"] == "rate_limited"
        events = await store.async_audit_events()
        assert events[-1]["event"] == "rate_limited"
        assert "sensor.temp" not in str(events[-1])
        # Window expiry restores capacity.
        clock["now"] += authority.data_plane_rate_window + 1
        again = await authority.handle_plaintext("s1", {"type": "get_states", "request_id": "r4", "entity_ids": ["sensor.temp"]})
        assert again["type"] == "states"
    asyncio.run(run())


def test_data_plane_rate_limit_weighs_expensive_operations_more():
    async def run():
        authority, _, _, _ = await paired_authority({"name": "Demo", "version": "1", "history": ["sensor.temp"]})
        clock = {"now": 1000.0}
        authority.monotonic_provider = lambda: clock["now"]
        authority.data_plane_rate_limit = 10
        # history_query weighs 5, so only 2 fit in a budget of 10.
        for i in range(2):
            ok = await authority.handle_plaintext("s1", {"type": "history_query", "request_id": f"h{i}", "entity_ids": ["sensor.temp"]})
            assert ok["type"] == "history_result"
        limited = await authority.handle_plaintext("s1", {"type": "history_query", "request_id": "h2", "entity_ids": ["sensor.temp"]})
        assert limited["type"] == "error"
        assert limited["code"] == "rate_limited"
    asyncio.run(run())


def test_data_plane_rate_limit_is_per_consumer():
    async def run():
        authority_a, _, _, _ = await paired_authority({"name": "A", "version": "1", "read_entities": ["sensor.temp"]})
        authority_a.data_plane_rate_limit = 1
        ok = await authority_a.handle_plaintext("s1", {"type": "get_states", "request_id": "a1", "entity_ids": ["sensor.temp"]})
        assert ok["type"] == "states"
        limited = await authority_a.handle_plaintext("s1", {"type": "get_states", "request_id": "a2", "entity_ids": ["sensor.temp"]})
        assert limited["code"] == "rate_limited"

        # A second consumer on the same authority keeps its own budget.
        consumer2 = generate_consumer_keypair()
        nonce = "nonce-2"
        manifest = {"name": "B", "version": "1", "read_entities": ["sensor.temp"]}
        pending = await authority_a.handle_plaintext("s2", {
            "type": "access_request",
            "consumer_pk": consumer2["public_key"],
            "manifest": manifest,
            "nonce": nonce,
            "signature": sign_access_request(consumer2["private_key"], nonce, manifest),
        })
        await authority_a.approve_request(pending["access_request_id"])
        auth = await authority_a.handle_plaintext("s2", channel_binding=TEST_BINDING, message={"type": "authenticate", "consumer_pk": consumer2["public_key"], "nonce": "auth-2", "signature": sign_authenticate(consumer2["private_key"], "auth-2", TEST_BINDING)})
        assert auth["type"] == "authenticated"
        ok2 = await authority_a.handle_plaintext("s2", {"type": "get_states", "request_id": "b1", "entity_ids": ["sensor.temp"]})
        assert ok2["type"] == "states"
    asyncio.run(run())


@contextmanager
def fake_registries(areas=(), devices=(), labels=(), area_entities=None, device_entities=None, label_entities=None, area_devices=None, label_devices=None):
    area_entities = area_entities or {}
    device_entities = device_entities or {}
    label_entities = label_entities or {}
    area_devices = area_devices or {}
    label_devices = label_devices or {}

    def entries(ids):
        return [types.SimpleNamespace(entity_id=i, id=i) for i in ids]

    area_reg = types.SimpleNamespace(async_get_area=lambda area_id: area_id if area_id in areas else None)
    dev_reg = types.SimpleNamespace(async_get=lambda device_id: device_id if device_id in devices else None)
    label_reg = types.SimpleNamespace(async_get_label=lambda label_id: label_id if label_id in labels else None)
    ent_reg = types.SimpleNamespace()

    area_registry = types.SimpleNamespace(async_get=lambda hass: area_reg)
    device_registry = types.SimpleNamespace(
        async_get=lambda hass: dev_reg,
        async_entries_for_area=lambda reg, area_id: entries(area_devices.get(area_id, [])),
        async_entries_for_label=lambda reg, label_id: entries(label_devices.get(label_id, [])),
    )
    entity_registry = types.SimpleNamespace(
        async_get=lambda hass: ent_reg,
        async_entries_for_area=lambda reg, area_id: entries(area_entities.get(area_id, [])),
        async_entries_for_label=lambda reg, label_id: entries(label_entities.get(label_id, [])),
        async_entries_for_device=lambda reg, device_id, include_disabled_entities=False: entries(device_entities.get(device_id, [])),
    )
    label_registry = types.SimpleNamespace(async_get=lambda hass: label_reg)

    original = authority_module._registry_modules
    authority_module._registry_modules = lambda: (area_registry, device_registry, entity_registry, label_registry)
    try:
        yield
    finally:
        authority_module._registry_modules = original


def test_call_service_resolves_area_device_and_label_targets_against_entity_scopes():
    async def run():
        authority, _, hass, _ = await paired_authority({
            "name": "Demo",
            "version": "1",
            "actions": ["light.turn_on@light.cucina", "light.turn_on@light.salotto"],
        })
        with fake_registries(
            areas={"cucina"},
            devices={"dev1"},
            labels={"mood"},
            area_entities={"cucina": ["light.cucina"]},
            area_devices={"cucina": ["dev1"]},
            device_entities={"dev1": ["light.salotto"]},
            label_entities={"mood": ["light.cucina", "lock.porta"]},
        ):
            # Area resolving (directly and via its device) to authorized entities: allowed.
            ok = await authority.handle_plaintext("s1", {"type": "call_service", "domain": "light", "service": "turn_on", "target": {"area_id": "cucina"}})
            assert ok["type"] == "service_called"
            # Original target is forwarded untouched so HA does its own resolution.
            assert hass.services.calls[-1][3] == {"area_id": "cucina"}
            # Device target resolving to an authorized entity: allowed.
            ok = await authority.handle_plaintext("s1", {"type": "call_service", "domain": "light", "service": "turn_on", "target": {"device_id": "dev1"}})
            assert ok["type"] == "service_called"
            # Label resolving to a mix with one unauthorized entity: denied.
            denied = await authority.handle_plaintext("s1", {"type": "call_service", "domain": "light", "service": "turn_on", "target": {"label_id": "mood"}})
            assert denied["code"] == "permission_denied"
            # Unknown area id is unresolvable: denied.
            denied = await authority.handle_plaintext("s1", {"type": "call_service", "domain": "light", "service": "turn_on", "target": {"area_id": "sconosciuta"}})
            assert denied["code"] == "permission_denied"
            # Mixed entity + area target checks the union: denied when the entity part fails.
            denied = await authority.handle_plaintext("s1", {"type": "call_service", "domain": "light", "service": "turn_on", "target": {"entity_id": "lock.porta", "area_id": "cucina"}})
            assert denied["code"] == "permission_denied"
            assert len(hass.services.calls) == 2
    asyncio.run(run())


def test_authenticate_records_last_used_at_on_grant():
    async def run():
        authority, store, _, grant = await paired_authority({"name": "Demo", "version": "1", "read_entities": ["sensor.temp"]})
        stored = await store.async_get_grant(grant.grant_id)
        assert stored.last_used_at is not None
        # A grant that has never authenticated stays at last_used_at None
        fresh = generate_consumer_keypair()
        manifest = {"name": "Orphan", "version": "1", "read_entities": ["sensor.temp"]}
        pending = await authority.handle_plaintext("s2", {
            "type": "access_request",
            "consumer_pk": fresh["public_key"],
            "manifest": manifest,
            "nonce": "fresh-nonce",
            "signature": sign_access_request(fresh["private_key"], "fresh-nonce", manifest),
        })
        orphan_grant = await authority.approve_request(pending["access_request_id"])
        assert (await store.async_get_grant(orphan_grant.grant_id)).last_used_at is None
    asyncio.run(run())


def test_lost_identity_can_repair_with_new_key_and_owner_deletes_orphan():
    async def run():
        # Consumer pairs, then loses browser storage: a new keypair is generated.
        authority, store, _, old_grant = await paired_authority({"name": "Demo", "version": "1", "read_entities": ["sensor.temp"]})
        new_consumer = generate_consumer_keypair()
        manifest = {"name": "Demo", "version": "1", "read_entities": ["sensor.temp"]}
        # Old grant does not authenticate the new key.
        denied = await authority.handle_plaintext("s2", channel_binding=TEST_BINDING, message={
            "type": "authenticate",
            "consumer_pk": new_consumer["public_key"],
            "nonce": "n2",
            "signature": sign_authenticate(new_consumer["private_key"], "n2", TEST_BINDING),
        })
        assert denied["code"] == "not_authorized"
        # Re-pair: new access_request with the new key, owner approves.
        pending = await authority.handle_plaintext("s2", {
            "type": "access_request",
            "consumer_pk": new_consumer["public_key"],
            "manifest": manifest,
            "nonce": "n3",
            "signature": sign_access_request(new_consumer["private_key"], "n3", manifest),
        })
        new_grant = await authority.approve_request(pending["access_request_id"])
        auth = await authority.handle_plaintext("s2", channel_binding=TEST_BINDING, message={
            "type": "authenticate",
            "consumer_pk": new_consumer["public_key"],
            "nonce": "n4",
            "signature": sign_authenticate(new_consumer["private_key"], "n4", TEST_BINDING),
        })
        assert auth["type"] == "authenticated"
        assert auth["grant_id"] == new_grant.grant_id
        # Owner spots the orphaned grant (stale last_used_at) and deletes it.
        await authority.delete_grant(old_grant.grant_id)
        grants = await store.async_list_grants()
        assert [g.grant_id for g in grants] == [new_grant.grant_id]
    asyncio.run(run())
