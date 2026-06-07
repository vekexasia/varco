import asyncio

from custom_components.varco.authority import VarcoAuthority
from custom_components.varco.crypto import generate_consumer_keypair, sign_access_request
from custom_components.varco.models import AccessStatus
from custom_components.varco.storage import MemoryVarcoStore


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
