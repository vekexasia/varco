import asyncio
import sys
import types


def _ensure_module(name: str) -> types.ModuleType:
    module = sys.modules.get(name)
    if module is None:
        module = types.ModuleType(name)
        sys.modules[name] = module
    return module


def _install_homeassistant_stubs():
    ha = _ensure_module("homeassistant")

    components = _ensure_module("homeassistant.components")
    persistent_notification = _ensure_module("homeassistant.components.persistent_notification")
    if not hasattr(persistent_notification, "async_create"):
        persistent_notification.async_create = lambda hass, message, title=None, notification_id=None: None
        persistent_notification.async_dismiss = lambda hass, notification_id: None
    components.persistent_notification = persistent_notification

    core = _ensure_module("homeassistant.core")
    if not hasattr(core, "callback"):
        core.callback = lambda func: func

    helpers = _ensure_module("homeassistant.helpers")
    aiohttp_client = _ensure_module("homeassistant.helpers.aiohttp_client")
    if not hasattr(aiohttp_client, "async_get_clientsession"):
        aiohttp_client.async_get_clientsession = lambda hass: None
    config_validation = _ensure_module("homeassistant.helpers.config_validation")
    if not hasattr(config_validation, "string"):
        config_validation.string = str
        config_validation.boolean = bool
    helpers.aiohttp_client = aiohttp_client
    helpers.config_validation = config_validation

    data_entry_flow = _ensure_module("homeassistant.data_entry_flow")
    if not hasattr(data_entry_flow, "FlowResult"):
        data_entry_flow.FlowResult = dict

    config_entries = _ensure_module("homeassistant.config_entries")
    if not hasattr(config_entries, "ConfigFlow"):
        class _FlowBase:
            def async_show_form(self, *, step_id, data_schema=None, errors=None):
                return {"type": "form", "step_id": step_id, "data_schema": data_schema, "errors": errors}

            def async_create_entry(self, *, title, data):
                return {"type": "create_entry", "title": title, "data": data}

            def async_abort(self, *, reason):
                return {"type": "abort", "reason": reason}

        class ConfigFlow(_FlowBase):
            def __init_subclass__(cls, *, domain=None, **kwargs):
                super().__init_subclass__(**kwargs)
                cls._domain = domain

            def _async_current_entries(self):
                return []

            def _get_reconfigure_entry(self):
                return self._reconfigure_entry

            def async_update_reload_and_abort(self, entry, *, data):
                entry.data = data
                entry.reloaded = True
                return {"type": "abort", "reason": "reconfigure_successful"}

        class OptionsFlow(_FlowBase):
            pass

        class ConfigEntry:
            def __init__(self, data):
                self.data = dict(data)
                self.reloaded = False

        config_entries.ConfigFlow = ConfigFlow
        config_entries.OptionsFlow = OptionsFlow
        config_entries.ConfigEntry = ConfigEntry

    ha.components = components
    ha.core = core
    ha.helpers = helpers
    ha.config_entries = config_entries
    ha.data_entry_flow = data_entry_flow


_install_homeassistant_stubs()

from homeassistant import config_entries as ce_stub

from custom_components.varco import _async_resolve_identity
from custom_components.varco.config_flow import VarcoConfigFlow, VarcoOptionsFlow
from custom_components.varco.crypto import generate_authority_keypair
from custom_components.varco.storage import MemoryVarcoStore


def test_identity_generated_once_and_reused():
    async def run():
        store = MemoryVarcoStore()
        first = await _async_resolve_identity(store, {"bridge_ws_url": "wss://a"})
        second = await _async_resolve_identity(store, {"bridge_ws_url": "wss://b"})
        assert first["authority_id"]
        assert first == second
        assert (await store.async_get_identity()) == first

    asyncio.run(run())


def test_identity_migrates_from_entry_data():
    async def run():
        store = MemoryVarcoStore()
        legacy = generate_authority_keypair()
        entry_data = {"bridge_ws_url": "wss://a", **legacy}
        identity = await _async_resolve_identity(store, entry_data)
        assert identity["authority_id"] == legacy["authority_id"]
        assert identity["private_key"] == legacy["private_key"]
        assert (await store.async_get_identity())["authority_id"] == legacy["authority_id"]
        # Stored identity wins over entry data afterwards.
        other = generate_authority_keypair()
        again = await _async_resolve_identity(store, {"bridge_ws_url": "wss://a", **other})
        assert again["authority_id"] == legacy["authority_id"]

    asyncio.run(run())


def test_user_flow_creates_entry_without_keypair():
    async def run():
        flow = VarcoConfigFlow()
        result = await flow.async_step_user({"bridge_ws_url": "wss://bridge.example", "webrtc_enabled": False})
        assert result["type"] == "create_entry"
        assert result["data"] == {"bridge_ws_url": "wss://bridge.example", "webrtc_enabled": False}
        assert "private_key" not in result["data"]
        assert "authority_id" not in result["data"]

    asyncio.run(run())


def test_reconfigure_flow_updates_url():
    async def run():
        entry = ce_stub.ConfigEntry({"bridge_ws_url": "wss://old.example", "webrtc_enabled": True})
        flow = VarcoConfigFlow()
        flow._reconfigure_entry = entry
        form = await flow.async_step_reconfigure(None)
        assert form["type"] == "form"
        result = await flow.async_step_reconfigure({"bridge_ws_url": "wss://new.example", "webrtc_enabled": True})
        assert result["reason"] == "reconfigure_successful"
        assert entry.data["bridge_ws_url"] == "wss://new.example"
        assert entry.reloaded

    asyncio.run(run())


def test_options_flow_updates_entry_data():
    async def run():
        entry = ce_stub.ConfigEntry({"bridge_ws_url": "wss://old.example", "webrtc_enabled": True})
        updates = []

        class FakeConfigEntries:
            def async_update_entry(self, target, data=None):
                if data is not None:
                    target.data = dict(data)
                updates.append(dict(target.data))

        class FakeHass:
            config_entries = FakeConfigEntries()

        flow = VarcoOptionsFlow()
        flow.hass = FakeHass()
        flow.config_entry = entry
        result = await flow.async_step_init({"bridge_ws_url": "wss://new.example", "webrtc_enabled": False})
        assert result["type"] == "create_entry"
        assert entry.data == {"bridge_ws_url": "wss://new.example", "webrtc_enabled": False}
        assert updates

    asyncio.run(run())
