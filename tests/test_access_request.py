import asyncio

from custom_components.varco.authority import VarcoAuthority
from custom_components.varco.crypto import generate_consumer_keypair, sign_access_request
from custom_components.varco.models import AccessRequest, AccessStatus
from custom_components.varco.storage import MAX_PENDING_ACCESS_REQUESTS, MemoryVarcoStore


def _request_message(consumer, nonce, manifest=None):
    manifest = manifest or {"name": "Demo", "version": "1.0.0", "read_entities": [], "subscriptions": [], "history": [], "camera_snapshots": [], "actions": []}
    return {
        "type": "access_request",
        "consumer_pk": consumer["public_key"],
        "manifest": manifest,
        "nonce": nonce,
        "signature": sign_access_request(consumer["private_key"], nonce, manifest),
    }


def test_access_request_creates_pending_request_with_pairing_code_and_audit():
    async def run():
        store = MemoryVarcoStore()
        authority = VarcoAuthority(store=store)
        consumer = generate_consumer_keypair()
        manifest = {
        "name": "Demo Dashboard",
        "version": "1.0.0",
        "read_entities": ["sensor.temperatura"],
        "subscriptions": ["sensor.temperatura"],
        "history": [],
        "camera_snapshots": [],
        "actions": [],
        }
        nonce = "nonce-1"

        result = await authority.handle_plaintext("session-1", {
        "type": "access_request",
        "consumer_pk": consumer["public_key"],
        "manifest": manifest,
        "nonce": nonce,
        "signature": sign_access_request(consumer["private_key"], nonce, manifest),
        })

        assert result["type"] == "access_request_pending"
        assert result["pairing_code"]
        requests = await store.async_list_access_requests()
        assert len(requests) == 1
        assert requests[0].status == AccessStatus.PENDING
        assert requests[0].pairing_code == result["pairing_code"]
        audit = await store.async_audit_events()
        assert audit[-1]["event"] == "access_request_received"
        assert "sensor.temperatura" not in str(audit[-1]["details"])
    asyncio.run(run())


def test_repeated_access_request_from_same_consumer_coalesces_into_one_pending_request():
    async def run():
        clock = {"now": 0.0}
        store = MemoryVarcoStore()
        authority = VarcoAuthority(store=store, monotonic_provider=lambda: clock["now"])
        consumer = generate_consumer_keypair()

        first = await authority.handle_plaintext("session-1", _request_message(consumer, "nonce-1"))
        clock["now"] += 10.0
        second = await authority.handle_plaintext("session-1", _request_message(consumer, "nonce-2"))

        assert second["type"] == "access_request_pending"
        assert second["access_request_id"] == first["access_request_id"]
        requests = await store.async_list_access_requests()
        assert len(requests) == 1
        assert requests[0].nonce == "nonce-2"
    asyncio.run(run())


def test_access_request_rate_limited_per_consumer_pk():
    async def run():
        clock = {"now": 0.0}
        store = MemoryVarcoStore()
        authority = VarcoAuthority(store=store, monotonic_provider=lambda: clock["now"])
        consumer = generate_consumer_keypair()
        other = generate_consumer_keypair()

        first = await authority.handle_plaintext("session-1", _request_message(consumer, "nonce-1"))
        assert first["type"] == "access_request_pending"

        clock["now"] += 1.0
        flooded = await authority.handle_plaintext("session-1", _request_message(consumer, "nonce-2"))
        assert flooded["type"] == "error"
        assert flooded["code"] == "rate_limited"

        other_result = await authority.handle_plaintext("session-2", _request_message(other, "nonce-3"))
        assert other_result["type"] == "access_request_pending"

        clock["now"] += 10.0
        retried = await authority.handle_plaintext("session-1", _request_message(consumer, "nonce-4"))
        assert retried["type"] == "access_request_pending"

        requests = await store.async_list_access_requests()
        assert len(requests) == 2
    asyncio.run(run())


def test_pending_access_requests_capped_evicting_oldest():
    async def run():
        store = MemoryVarcoStore()
        for index in range(MAX_PENDING_ACCESS_REQUESTS + 5):
            await store.async_upsert_access_request(AccessRequest(
                request_id=f"req-{index:04d}",
                consumer_pk=f"pk-{index:04d}",
                manifest={},
                nonce=f"nonce-{index}",
                pairing_code="0000",
                created_at=f"2026-01-01T00:00:{index:02d}+00:00" if index < 60 else f"2026-01-01T00:01:{index - 60:02d}+00:00",
            ))

        requests = await store.async_list_access_requests()
        assert len(requests) == MAX_PENDING_ACCESS_REQUESTS
        ids = {request.request_id for request in requests}
        assert "req-0000" not in ids
        assert f"req-{MAX_PENDING_ACCESS_REQUESTS + 4:04d}" in ids
    asyncio.run(run())


def test_access_request_normalizes_camel_case_manifest_to_snake_case():
    async def run():
        store = MemoryVarcoStore()
        authority = VarcoAuthority(store=store)
        consumer = generate_consumer_keypair()
        manifest = {
            "name": "Demo",
            "version": "1.0.0",
            "readEntities": ["sensor.temp"],
            "cameraSnapshots": ["camera.door"],
        }
        result = await authority.handle_plaintext("session-1", _request_message(consumer, "nonce-camel", manifest))
        assert result["type"] == "access_request_pending"
        requests = await store.async_list_access_requests()
        stored = requests[0].manifest
        assert stored["read_entities"] == ["sensor.temp"]
        assert stored["camera_snapshots"] == ["camera.door"]
        assert "readEntities" not in stored
        assert "cameraSnapshots" not in stored
    asyncio.run(run())


def test_access_request_rejects_conflicting_manifest_aliases():
    async def run():
        store = MemoryVarcoStore()
        authority = VarcoAuthority(store=store)
        consumer = generate_consumer_keypair()
        manifest = {
            "name": "Demo",
            "version": "1.0.0",
            "read_entities": ["sensor.temp"],
            "readEntities": ["sensor.other"],
        }
        result = await authority.handle_plaintext("session-1", _request_message(consumer, "nonce-conflict", manifest))
        assert result["type"] == "error"
        assert result["code"] == "invalid_manifest"
        assert await store.async_list_access_requests() == []
    asyncio.run(run())


def test_access_request_rejects_malformed_manifest():
    async def run():
        store = MemoryVarcoStore()
        authority = VarcoAuthority(store=store)
        consumer = generate_consumer_keypair()
        for manifest in (
            {"version": "1.0.0"},  # missing name
            {"name": "", "version": "1.0.0"},  # empty name
            {"name": "Demo", "read_entities": "sensor.temp"},  # scope not a list
            {"name": "Demo", "actions": [{"bad": True}]},  # non-string scope entry
        ):
            result = await authority.handle_plaintext("session-1", _request_message(consumer, "nonce-bad", manifest))
            assert result["type"] == "error", manifest
            assert result["code"] == "invalid_manifest", manifest
        assert await store.async_list_access_requests() == []
    asyncio.run(run())


def test_stored_camel_case_manifest_coerced_on_load():
    from custom_components.varco.models import Grant

    grant = Grant.from_dict({
        "grant_id": "g1",
        "consumer_pk": "pk",
        "manifest": {"name": "Old", "readEntities": ["sensor.temp"], "cameraSnapshots": ["camera.door"]},
    })
    assert grant.manifest["read_entities"] == ["sensor.temp"]
    assert grant.manifest["camera_snapshots"] == ["camera.door"]
