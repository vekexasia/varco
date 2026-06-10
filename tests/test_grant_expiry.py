import asyncio
from datetime import datetime, timedelta, timezone

from custom_components.varco.authority import VarcoAuthority
from custom_components.varco.crypto import generate_consumer_keypair, sign_access_request, sign_authenticate
from custom_components.varco.storage import MemoryVarcoStore

MANIFEST = {"name": "Demo", "version": "1", "read_entities": ["sensor.temp"]}


class FakeStates:
    def get(self, entity_id):
        return {"entity_id": entity_id, "state": "21", "attributes": {}}


class FakeHass:
    def __init__(self):
        self.states = FakeStates()


async def request_access(authority, consumer):
    nonce = "nonce"
    return await authority.handle_plaintext("s1", {
        "type": "access_request",
        "consumer_pk": consumer["public_key"],
        "manifest": MANIFEST,
        "nonce": nonce,
        "signature": sign_access_request(consumer["private_key"], nonce, MANIFEST),
    })


def authenticate_message(consumer):
    auth_nonce = "auth-nonce"
    return {"type": "authenticate", "consumer_pk": consumer["public_key"], "nonce": auth_nonce, "signature": sign_authenticate(consumer["private_key"], auth_nonce)}


def test_expired_grant_rejected_at_authenticate():
    async def run():
        now = {"value": datetime(2026, 1, 1, tzinfo=timezone.utc)}
        store = MemoryVarcoStore()
        authority = VarcoAuthority(store=store, hass=FakeHass(), now_provider=lambda: now["value"])
        consumer = generate_consumer_keypair()
        pending = await request_access(authority, consumer)
        expires_at = (now["value"] + timedelta(hours=1)).isoformat()
        await authority.approve_request(pending["request_id"], expires_at=expires_at)
        now["value"] += timedelta(hours=2)
        denied = await authority.handle_plaintext("s2", authenticate_message(consumer))
        assert denied["type"] == "error"
        assert denied["code"] == "not_authorized"
    asyncio.run(run())


def test_expired_grant_rejected_mid_session_at_require_grant():
    async def run():
        now = {"value": datetime(2026, 1, 1, tzinfo=timezone.utc)}
        store = MemoryVarcoStore()
        authority = VarcoAuthority(store=store, hass=FakeHass(), now_provider=lambda: now["value"])
        consumer = generate_consumer_keypair()
        pending = await request_access(authority, consumer)
        expires_at = (now["value"] + timedelta(hours=1)).isoformat()
        await authority.approve_request(pending["request_id"], expires_at=expires_at)
        auth = await authority.handle_plaintext("s1", authenticate_message(consumer))
        assert auth["type"] == "authenticated"
        ok = await authority.handle_plaintext("s1", {"type": "get_states", "request_id": "r1", "entity_ids": ["sensor.temp"]})
        assert ok["type"] == "states"
        now["value"] += timedelta(hours=2)
        denied = await authority.handle_plaintext("s1", {"type": "get_states", "request_id": "r2", "entity_ids": ["sensor.temp"]})
        assert denied["type"] == "error"
        assert denied["code"] == "grant_revoked"
    asyncio.run(run())


def test_non_expiring_grant_unaffected():
    async def run():
        now = {"value": datetime(2026, 1, 1, tzinfo=timezone.utc)}
        store = MemoryVarcoStore()
        authority = VarcoAuthority(store=store, hass=FakeHass(), now_provider=lambda: now["value"])
        consumer = generate_consumer_keypair()
        pending = await request_access(authority, consumer)
        grant = await authority.approve_request(pending["request_id"])
        assert grant.expires_at is None
        now["value"] += timedelta(days=365)
        auth = await authority.handle_plaintext("s1", authenticate_message(consumer))
        assert auth["type"] == "authenticated"
        ok = await authority.handle_plaintext("s1", {"type": "get_states", "request_id": "r1", "entity_ids": ["sensor.temp"]})
        assert ok["type"] == "states"
    asyncio.run(run())


def test_purge_expired_grants_removes_only_expired():
    async def run():
        now = datetime(2026, 1, 1, tzinfo=timezone.utc)
        store = MemoryVarcoStore()
        authority = VarcoAuthority(store=store, hass=FakeHass(), now_provider=lambda: now)
        expired_consumer = generate_consumer_keypair()
        active_consumer = generate_consumer_keypair()
        forever_consumer = generate_consumer_keypair()

        async def approve(consumer, expires_at):
            nonce = "nonce"
            pending = await authority.handle_plaintext("s1", {
                "type": "access_request",
                "consumer_pk": consumer["public_key"],
                "manifest": MANIFEST,
                "nonce": nonce,
                "signature": sign_access_request(consumer["private_key"], nonce, MANIFEST),
            })
            return await authority.approve_request(pending["request_id"], expires_at=expires_at)

        expired_grant = await approve(expired_consumer, (now - timedelta(hours=1)).isoformat())
        active_grant = await approve(active_consumer, (now + timedelta(hours=1)).isoformat())
        forever_grant = await approve(forever_consumer, None)

        deleted = await store.async_purge_expired_grants(now=now)
        assert deleted == [expired_grant.grant_id]
        assert await store.async_get_grant(expired_grant.grant_id) is None
        assert await store.async_get_grant(active_grant.grant_id) is not None
        assert await store.async_get_grant(forever_grant.grant_id) is not None

        assert await store.async_purge_expired_grants(now=now) == []
    asyncio.run(run())
