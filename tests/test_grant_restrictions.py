import asyncio
from datetime import datetime, timezone

from custom_components.varco.authority import VarcoAuthority
from custom_components.varco.crypto import b64url_encode, generate_consumer_keypair, sign_access_request, sign_authenticate
from custom_components.varco.models import hash_pin
from custom_components.varco.storage import MemoryVarcoStore

TEST_BINDING = b64url_encode(b"\x01" * 32)


class FakeStates:
    def __init__(self):
        self.values = {
            "sensor.temp": {"entity_id": "sensor.temp", "state": "21", "attributes": {}},
            "light.cucina": {"entity_id": "light.cucina", "state": "off", "attributes": {}},
            "camera.porta": {"entity_id": "camera.porta", "state": "idle", "attributes": {}},
        }

    def get(self, entity_id):
        return self.values.get(entity_id)

    def async_entity_ids(self):
        return list(self.values)


class FakeServices:
    def __init__(self):
        self.calls = []

    async def async_call(self, domain, service, service_data, blocking=True, target=None):
        self.calls.append((domain, service, service_data, target, blocking))


class FakeHass:
    def __init__(self):
        self.states = FakeStates()
        self.services = FakeServices()


async def paired_authority(manifest, *, now=None):
    store = MemoryVarcoStore()
    hass = FakeHass()
    authority = VarcoAuthority(
        store=store,
        hass=hass,
        now_provider=(lambda: now) if now else None,
        monotonic_provider=iter_seconds(),
    )
    consumer = generate_consumer_keypair()
    nonce = "request-nonce"
    pending = await authority.handle_plaintext(
        "request-session",
        {
            "type": "access_request",
            "consumer_pk": consumer["public_key"],
            "manifest": manifest,
            "nonce": nonce,
            "signature": sign_access_request(consumer["private_key"], nonce, manifest),
        },
    )
    grant = await authority.approve_request(pending["access_request_id"])
    auth_nonce = "auth-nonce"
    authenticated = await authority.handle_plaintext(
        "s1",
        channel_binding=TEST_BINDING,
        message={
            "type": "authenticate",
            "consumer_pk": consumer["public_key"],
            "nonce": auth_nonce,
            "signature": sign_authenticate(consumer["private_key"], auth_nonce, TEST_BINDING),
        },
    )
    assert authenticated["type"] == "authenticated"
    return authority, store, hass, grant


def iter_seconds():
    current = {"value": 1000.0}

    def next_second():
        current["value"] += 1.0
        return current["value"]

    return next_second


async def set_restrictions(store, grant, restrictions):
    grant.restrictions = restrictions
    await store.async_upsert_grant(grant)


def test_expired_whole_grant_restriction_denies_data_plane_use():
    async def run():
        now = datetime(2026, 6, 9, 12, 0, tzinfo=timezone.utc)
        authority, store, _, grant = await paired_authority(
            {"name": "Demo", "version": "1", "read_entities": ["sensor.temp"]},
            now=now,
        )
        await set_restrictions(
            store,
            grant,
            [
                {
                    "id": "grant-expired",
                    "type": "expiry",
                    "enabled": True,
                    "applies_to": "grant",
                    "params": {"expires_at": "2026-06-09T11:59:00+00:00"},
                }
            ],
        )

        denied = await authority.handle_plaintext("s1", {"type": "get_states", "entity_ids": ["sensor.temp"]})

        assert denied["type"] == "error"
        assert denied["code"] == "permission_denied"
        assert "expired" in denied["message"].lower()
        audit = await store.async_audit_events()
        assert audit[-1]["event"] == "restriction_denied"
        assert audit[-1]["details"]["restriction_id"] == "grant-expired"

    asyncio.run(run())


def test_action_pin_restriction_requires_matching_pin_without_storing_plaintext():
    async def run():
        authority, store, hass, grant = await paired_authority(
            {"name": "Demo", "version": "1", "actions": ["light.turn_on@light.cucina"]}
        )
        pin_hash = hash_pin("1234", salt=b"fixed-test-salt")
        await set_restrictions(
            store,
            grant,
            [
                {
                    "id": "light-pin",
                    "type": "pin",
                    "enabled": True,
                    "applies_to": "light.turn_on@light.cucina",
                    "params": {"pin_hash": pin_hash},
                }
            ],
        )

        missing = await authority.handle_plaintext(
            "s1",
            {"type": "call_service", "domain": "light", "service": "turn_on", "target": {"entity_id": "light.cucina"}},
        )
        wrong = await authority.handle_plaintext(
            "s1",
            {
                "type": "call_service",
                "domain": "light",
                "service": "turn_on",
                "target": {"entity_id": "light.cucina"},
                "pin": "9999",
            },
        )
        ok = await authority.handle_plaintext(
            "s1",
            {
                "type": "call_service",
                "domain": "light",
                "service": "turn_on",
                "target": {"entity_id": "light.cucina"},
                "pin": "1234",
            },
        )

        assert missing["code"] == "permission_denied"
        assert wrong["code"] == "permission_denied"
        assert ok["type"] == "service_called"
        assert len(hass.services.calls) == 1
        stored = await store.async_get_grant(grant.grant_id)
        assert "1234" not in str(stored.as_dict())

    asyncio.run(run())


def test_schedule_restriction_limits_all_write_actions_by_day_and_time():
    async def run():
        now = {"value": datetime(2026, 6, 9, 10, 0, tzinfo=timezone.utc)}
        authority, store, hass, grant = await paired_authority(
            {"name": "Demo", "version": "1", "actions": ["light.turn_on@light.cucina"]},
            now=now["value"],
        )
        authority.now_provider = lambda: now["value"]
        await set_restrictions(
            store,
            grant,
            [
                {
                    "id": "business-hours-writes",
                    "type": "schedule",
                    "enabled": True,
                    "applies_to": "actions",
                    "params": {"days": ["mon", "tue", "wed", "thu", "fri"], "start_time": "08:00", "end_time": "20:00"},
                }
            ],
        )

        allowed = await authority.handle_plaintext(
            "s1",
            {"type": "call_service", "domain": "light", "service": "turn_on", "target": {"entity_id": "light.cucina"}},
        )
        now["value"] = datetime(2026, 6, 9, 21, 0, tzinfo=timezone.utc)
        denied = await authority.handle_plaintext(
            "s1",
            {"type": "call_service", "domain": "light", "service": "turn_on", "target": {"entity_id": "light.cucina"}},
        )

        assert allowed["type"] == "service_called"
        assert denied["code"] == "permission_denied"
        assert len(hass.services.calls) == 1

    asyncio.run(run())


def test_rate_limit_restriction_denies_calls_after_limit_within_window():
    async def run():
        authority, store, hass, grant = await paired_authority(
            {"name": "Demo", "version": "1", "camera_snapshots": ["camera.porta"]}
        )
        await set_restrictions(
            store,
            grant,
            [
                {
                    "id": "camera-hourly-limit",
                    "type": "rate_limit",
                    "enabled": True,
                    "applies_to": "camera",
                    "params": {"limit": 2, "window_seconds": 3600},
                }
            ],
        )

        one = await authority.handle_plaintext("s1", {"type": "camera_snapshot", "entity_id": "camera.porta"})
        two = await authority.handle_plaintext("s1", {"type": "camera_snapshot", "entity_id": "camera.porta"})
        denied = await authority.handle_plaintext("s1", {"type": "camera_snapshot", "entity_id": "camera.porta"})

        assert one["type"] == "camera_snapshot"
        assert two["type"] == "camera_snapshot"
        assert denied["code"] == "permission_denied"
        assert len(hass.services.calls) == 0

    asyncio.run(run())


def test_set_grant_restrictions_hashes_pin_params_before_storage():
    async def run():
        authority, store, _, grant = await paired_authority(
            {"name": "Demo", "version": "1", "actions": ["light.turn_on@light.cucina"]}
        )

        updated = await authority.set_grant_restrictions(
            grant.grant_id,
            [
                {
                    "id": "owner-pin",
                    "type": "pin",
                    "enabled": True,
                    "applies_to": "light.turn_on@light.cucina",
                    "params": {"pin": "4321"},
                }
            ],
        )

        stored = await store.async_get_grant(grant.grant_id)
        assert updated.restrictions == stored.restrictions
        assert "4321" not in str(stored.as_dict())
        assert stored.restrictions[0]["params"]["pin_hash"].startswith("pbkdf2_sha256$")
        assert "pin" not in stored.restrictions[0]["params"]

    asyncio.run(run())

def test_subscription_restrictions_preserve_read_scope_subscription_fallback():
    async def run():
        authority, store, _, grant = await paired_authority(
            {
                "name": "Demo",
                "version": "1",
                "read_entities": ["sensor.temp"],
                "subscriptions": ["light.cucina"],
            },
            now=datetime(2026, 6, 9, 12, 0, tzinfo=timezone.utc),
        )
        await set_restrictions(
            store,
            grant,
            [
                {
                    "id": "subscription-hours",
                    "type": "schedule",
                    "enabled": True,
                    "applies_to": "subscriptions",
                    "params": {"days": ["mon", "tue", "wed", "thu", "fri"], "start_time": "00:00", "end_time": "23:59"},
                }
            ],
        )

        read_scope_subscription = await authority.handle_plaintext("s1", {"type": "subscribe_states", "entity_ids": ["sensor.temp"]})
        explicit_subscription = await authority.handle_plaintext("s1", {"type": "subscribe_states", "entity_ids": ["light.cucina"]})

        assert read_scope_subscription["type"] == "state_snapshot"
        assert explicit_subscription["type"] == "state_snapshot"

    asyncio.run(run())


def test_set_grant_restrictions_hashes_top_level_pin_before_storage():
    async def run():
        authority, store, _, grant = await paired_authority(
            {"name": "Demo", "version": "1", "actions": ["light.turn_on@light.cucina"]}
        )

        await authority.set_grant_restrictions(
            grant.grant_id,
            [
                {
                    "id": "owner-pin",
                    "type": "pin",
                    "enabled": True,
                    "applies_to": "light.turn_on@light.cucina",
                    "pin": "4321",
                }
            ],
        )

        stored = await store.async_get_grant(grant.grant_id)
        assert "4321" not in str(stored.as_dict())
        assert stored.restrictions[0]["params"]["pin_hash"].startswith("pbkdf2_sha256$")
        assert "pin" not in stored.restrictions[0]

    asyncio.run(run())


# ── Multi-restriction tests ────────────────────────────────────────────────


def test_schedule_fails_fast_before_pin_is_evaluated():
    """If the schedule restriction denies first, the PIN restriction is never reached.
    This verifies fail-fast order: the action must be denied for both 'no pin' AND
    'correct pin' when outside the schedule window."""
    async def run():
        now = {"value": datetime(2026, 6, 9, 23, 0, tzinfo=timezone.utc)}  # outside 08:00-20:00
        authority, store, hass, grant = await paired_authority(
            {"name": "Demo", "version": "1", "actions": ["light.turn_on@light.cucina"]},
            now=now["value"],
        )
        authority.now_provider = lambda: now["value"]
        pin_hash = hash_pin("9999", salt=b"test-salt-order")
        await set_restrictions(store, grant, [
            {
                "id": "schedule",
                "type": "schedule",
                "enabled": True,
                "applies_to": "actions",
                "params": {"days": ["mon","tue","wed","thu","fri"], "start_time": "08:00", "end_time": "20:00"},
            },
            {
                "id": "action-pin",
                "type": "pin",
                "enabled": True,
                "applies_to": "light.turn_on@light.cucina",
                "params": {"pin_hash": pin_hash},
            },
        ])

        # Without pin — schedule fires first
        denied_no_pin = await authority.handle_plaintext("s1", {
            "type": "call_service", "domain": "light", "service": "turn_on",
            "target": {"entity_id": "light.cucina"},
        })
        # With correct pin — schedule still fires first, pin never saves it
        denied_with_pin = await authority.handle_plaintext("s1", {
            "type": "call_service", "domain": "light", "service": "turn_on",
            "target": {"entity_id": "light.cucina"}, "pin": "9999",
        })

        assert denied_no_pin["code"] == "permission_denied"
        assert denied_with_pin["code"] == "permission_denied"
        assert len(hass.services.calls) == 0

        # Audit shows schedule denied, not pin
        events = await store.async_audit_events()
        restriction_denials = [e for e in events if e["event"] == "restriction_denied"]
        assert all(e["details"]["restriction_id"] == "schedule" for e in restriction_denials)

    asyncio.run(run())


def test_schedule_passes_then_pin_still_required():
    """When inside the schedule window the PIN restriction must still be evaluated.
    Correct PIN: allowed. No PIN or wrong PIN: denied."""
    async def run():
        now = {"value": datetime(2026, 6, 9, 10, 0, tzinfo=timezone.utc)}  # inside 08:00-20:00, Mon
        authority, store, hass, grant = await paired_authority(
            {"name": "Demo", "version": "1", "actions": ["light.turn_on@light.cucina"]},
            now=now["value"],
        )
        authority.now_provider = lambda: now["value"]
        pin_hash = hash_pin("1234", salt=b"test-salt-second")
        await set_restrictions(store, grant, [
            {
                "id": "schedule",
                "type": "schedule",
                "enabled": True,
                "applies_to": "actions",
                "params": {"days": ["mon","tue","wed","thu","fri"], "start_time": "08:00", "end_time": "20:00"},
            },
            {
                "id": "action-pin",
                "type": "pin",
                "enabled": True,
                "applies_to": "light.turn_on@light.cucina",
                "params": {"pin_hash": pin_hash},
            },
        ])

        denied_no_pin = await authority.handle_plaintext("s1", {
            "type": "call_service", "domain": "light", "service": "turn_on",
            "target": {"entity_id": "light.cucina"},
        })
        denied_wrong_pin = await authority.handle_plaintext("s1", {
            "type": "call_service", "domain": "light", "service": "turn_on",
            "target": {"entity_id": "light.cucina"}, "pin": "0000",
        })
        allowed = await authority.handle_plaintext("s1", {
            "type": "call_service", "domain": "light", "service": "turn_on",
            "target": {"entity_id": "light.cucina"}, "pin": "1234",
        })

        assert denied_no_pin["code"] == "permission_denied"
        assert denied_wrong_pin["code"] == "permission_denied"
        assert allowed["type"] == "service_called"
        assert len(hass.services.calls) == 1

        # PIN denial should reference action-pin, not schedule
        events = await store.async_audit_events()
        pin_denials = [e for e in events if e["event"] == "restriction_denied"
                       and e["details"]["restriction_id"] == "action-pin"]
        assert len(pin_denials) == 2  # no-pin and wrong-pin

    asyncio.run(run())


def test_rate_limit_counter_does_not_increment_when_pin_fails():
    """Rate-limit counters must only increment when ALL stateless checks pass.
    If the PIN restriction denies, the rate-limit counter must not tick."""
    async def run():
        authority, store, hass, grant = await paired_authority(
            {"name": "Demo", "version": "1", "actions": ["light.turn_on@light.cucina"]},
        )
        pin_hash = hash_pin("7777", salt=b"test-salt-rate")
        await set_restrictions(store, grant, [
            {
                "id": "action-pin",
                "type": "pin",
                "enabled": True,
                "applies_to": "actions",
                "params": {"pin_hash": pin_hash},
            },
            {
                "id": "rate",
                "type": "rate_limit",
                "enabled": True,
                "applies_to": "actions",
                "params": {"limit": 2, "window_seconds": 3600},
            },
        ])

        # Five wrong-pin attempts — none should tick the rate counter
        for _ in range(5):
            r = await authority.handle_plaintext("s1", {
                "type": "call_service", "domain": "light", "service": "turn_on",
                "target": {"entity_id": "light.cucina"}, "pin": "wrong",
            })
            assert r["code"] == "permission_denied"

        # Two correct-pin attempts — both should succeed (limit=2, counter was 0)
        ok1 = await authority.handle_plaintext("s1", {
            "type": "call_service", "domain": "light", "service": "turn_on",
            "target": {"entity_id": "light.cucina"}, "pin": "7777",
        })
        ok2 = await authority.handle_plaintext("s1", {
            "type": "call_service", "domain": "light", "service": "turn_on",
            "target": {"entity_id": "light.cucina"}, "pin": "7777",
        })
        # Third correct attempt — now rate limited
        denied = await authority.handle_plaintext("s1", {
            "type": "call_service", "domain": "light", "service": "turn_on",
            "target": {"entity_id": "light.cucina"}, "pin": "7777",
        })

        assert ok1["type"] == "service_called"
        assert ok2["type"] == "service_called"
        assert denied["code"] == "permission_denied"
        assert len(hass.services.calls) == 2

    asyncio.run(run())


def test_two_restrictions_both_pass_allows_the_action():
    """Sanity check: when all restrictions match and all pass, the action goes through."""
    async def run():
        now = {"value": datetime(2026, 6, 9, 12, 0, tzinfo=timezone.utc)}  # Tue 12:00
        authority, store, hass, grant = await paired_authority(
            {"name": "Demo", "version": "1", "actions": ["light.turn_on@light.cucina"]},
            now=now["value"],
        )
        authority.now_provider = lambda: now["value"]
        pin_hash = hash_pin("4242", salt=b"test-salt-both-pass")
        await set_restrictions(store, grant, [
            {
                "id": "schedule",
                "type": "schedule",
                "enabled": True,
                "applies_to": "actions",
                "params": {"days": ["mon","tue","wed","thu","fri"], "start_time": "08:00", "end_time": "20:00"},
            },
            {
                "id": "pin",
                "type": "pin",
                "enabled": True,
                "applies_to": "light.turn_on@light.cucina",
                "params": {"pin_hash": pin_hash},
            },
        ])

        result = await authority.handle_plaintext("s1", {
            "type": "call_service", "domain": "light", "service": "turn_on",
            "target": {"entity_id": "light.cucina"}, "pin": "4242",
        })
        assert result["type"] == "service_called"
        assert len(hass.services.calls) == 1

    asyncio.run(run())


# Template restriction tests


class TemplateHass(FakeHass):
    def __init__(self):
        super().__init__()
        self.template_result = "True"
        self.rendered = []

    async def varco_render_template(self, value_template):
        self.rendered.append(value_template)
        if isinstance(self.template_result, Exception):
            raise self.template_result
        return self.template_result


async def paired_template_authority(manifest):
    authority, store, _, grant = await paired_authority(manifest)
    hass = TemplateHass()
    authority.hass = hass
    return authority, store, hass, grant


def test_template_restriction_allows_when_template_is_truthy():
    async def run():
        authority, store, hass, grant = await paired_template_authority(
            {"name": "Demo", "version": "1", "actions": ["light.turn_on@light.cucina"]}
        )
        await set_restrictions(store, grant, [
            {
                "id": "alarm-disarmed",
                "type": "template",
                "enabled": True,
                "applies_to": "light.turn_on@light.cucina",
                "params": {"value_template": "{{ is_state('alarm_control_panel.home_alarm', 'disarmed') }}"},
            },
        ])
        result = await authority.handle_plaintext("s1", {
            "type": "call_service", "domain": "light", "service": "turn_on",
            "target": {"entity_id": "light.cucina"},
        })
        assert result["type"] == "service_called"
        assert hass.rendered == ["{{ is_state('alarm_control_panel.home_alarm', 'disarmed') }}"]

    asyncio.run(run())


def test_template_restriction_denies_when_template_is_falsy():
    async def run():
        authority, store, hass, grant = await paired_template_authority(
            {"name": "Demo", "version": "1", "actions": ["light.turn_on@light.cucina"]}
        )
        hass.template_result = "False"
        await set_restrictions(store, grant, [
            {
                "id": "alarm-disarmed",
                "type": "template",
                "enabled": True,
                "applies_to": "light.turn_on@light.cucina",
                "params": {"value_template": "{{ is_state('alarm_control_panel.home_alarm', 'disarmed') }}"},
            },
        ])
        denied = await authority.handle_plaintext("s1", {
            "type": "call_service", "domain": "light", "service": "turn_on",
            "target": {"entity_id": "light.cucina"},
        })
        assert denied["code"] == "permission_denied"
        assert "template_denied" in denied["message"]
        assert len(hass.services.calls) == 0
        events = await store.async_audit_events()
        assert events[-1]["event"] == "restriction_denied"
        assert events[-1]["details"]["restriction_id"] == "alarm-disarmed"
        assert events[-1]["details"]["reason"] == "template_denied"

    asyncio.run(run())


def test_template_restriction_fails_closed_on_template_error_without_leaking_details():
    async def run():
        authority, store, hass, grant = await paired_template_authority(
            {"name": "Demo", "version": "1", "read_entities": ["sensor.temp"]}
        )
        hass.template_result = ValueError("state of sensor.secret is 42")
        await set_restrictions(store, grant, [
            {
                "id": "broken-template",
                "type": "template",
                "enabled": True,
                "applies_to": "read",
                "params": {"value_template": "{{ broken("},
            },
        ])
        denied = await authority.handle_plaintext("s1", {"type": "get_states", "entity_ids": ["sensor.temp"]})
        assert denied["code"] == "permission_denied"
        assert "template_error" in denied["message"]
        events = await store.async_audit_events()
        assert events[-1]["event"] == "restriction_denied"
        assert events[-1]["details"]["reason"] == "template_error"
        assert "sensor.secret" not in str(events)
        assert "42" not in str(events[-1])

    asyncio.run(run())


def test_template_restriction_denies_when_template_missing():
    async def run():
        authority, store, hass, grant = await paired_template_authority(
            {"name": "Demo", "version": "1", "read_entities": ["sensor.temp"]}
        )
        await set_restrictions(store, grant, [
            {"id": "empty-template", "type": "template", "enabled": True, "applies_to": "read", "params": {}},
        ])
        denied = await authority.handle_plaintext("s1", {"type": "get_states", "entity_ids": ["sensor.temp"]})
        assert denied["code"] == "permission_denied"
        assert "template_not_configured" in denied["message"]
        assert hass.rendered == []

    asyncio.run(run())


def test_template_restriction_only_applies_to_matching_operations():
    async def run():
        authority, store, hass, grant = await paired_template_authority(
            {"name": "Demo", "version": "1", "read_entities": ["sensor.temp"], "actions": ["light.turn_on@light.cucina"]}
        )
        hass.template_result = "False"
        await set_restrictions(store, grant, [
            {
                "id": "actions-only",
                "type": "template",
                "enabled": True,
                "applies_to": "actions",
                "params": {"value_template": "{{ false }}"},
            },
        ])
        read = await authority.handle_plaintext("s1", {"type": "get_states", "entity_ids": ["sensor.temp"]})
        denied = await authority.handle_plaintext("s1", {
            "type": "call_service", "domain": "light", "service": "turn_on",
            "target": {"entity_id": "light.cucina"},
        })
        assert read["type"] == "states"
        assert denied["code"] == "permission_denied"

    asyncio.run(run())
