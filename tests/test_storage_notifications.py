import asyncio

from custom_components.varco.models import AccessRequest
from custom_components.varco.storage import MemoryVarcoStore


def test_store_notifies_on_saved_data_and_audit_events():
    async def run():
        store = MemoryVarcoStore()
        events = []
        unsubscribe = store.async_listen_changes(events.append)

        await store.async_upsert_access_request(
            AccessRequest(
                request_id="req-1",
                consumer_pk="consumer",
                manifest={"name": "Demo"},
                nonce="nonce",
                pairing_code="123456",
            )
        )
        await store.async_append_audit({"event": "connected"})
        unsubscribe()
        await store.async_append_audit({"event": "ignored"})

        assert [event["kind"] for event in events] == ["data", "audit"]

    asyncio.run(run())
