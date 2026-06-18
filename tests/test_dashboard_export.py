from custom_components.varco.dashboard_export import build_dashboard_export, harvest_lovelace_config


class FakeStates:
    def __init__(self):
        self.values = {
            "sensor.temp": {
                "state": "21.4",
                "attributes": {
                    "friendly_name": "Kitchen temperature",
                    "unit_of_measurement": "°C",
                    "device_class": "temperature",
                    "secret": "not exported",
                },
            },
            "light.kitchen": {"state": "off", "attributes": {"friendly_name": "Kitchen light", "brightness": 0}},
            "camera.door": {"state": "idle", "attributes": {"friendly_name": "Door camera"}},
        }

    def get(self, entity_id):
        return self.values.get(entity_id)


class FakeHass:
    def __init__(self):
        self.states = FakeStates()


def test_harvest_reads_subscriptions_history_camera_and_dynamic_warnings():
    config = {
        "views": [
            {
                "title": "Main",
                "cards": [
                    {"type": "entities", "entities": ["sensor.temp", {"entity": "light.kitchen"}]},
                    {"type": "history-graph", "entities": ["sensor.temp"]},
                    {"type": "picture-glance", "camera_image": "camera.door", "entities": ["light.kitchen"]},
                    {"type": "custom:auto-entities", "filter": {"include": [{"domain": "sensor"}]}},
                    {"type": "tile", "entity": "sensor.temp"},
                    {"type": "conditional", "conditions": [{"entity": "binary_sensor.motion", "state": "on"}], "card": {"type": "entities", "entities": ["sensor.temp"]}},
                ],
            }
        ]
    }

    harvest = harvest_lovelace_config(config)

    assert harvest["read_entities"] == ["binary_sensor.motion", "light.kitchen", "sensor.temp"]
    assert harvest["subscriptions"] == ["binary_sensor.motion", "light.kitchen", "sensor.temp"]
    assert harvest["history"] == ["sensor.temp"]
    assert harvest["camera_snapshots"] == ["camera.door"]
    assert any("Custom card" in warning["message"] for warning in harvest["warnings"])
    assert any("tile card" in warning["message"] for warning in harvest["warnings"])


def test_build_export_prunes_manifest_and_includes_trimmed_catalog_and_brief_bootstrap():
    config = {
        "views": [
            {
                "title": "Main",
                "cards": [
                    {"type": "entities", "entities": ["sensor.temp", "light.kitchen"]},
                    {"type": "history-graph", "entities": ["sensor.temp"]},
                    {"type": "picture-glance", "camera_image": "camera.door", "entities": ["light.kitchen"]},
                ],
            },
            {"title": "Ignored", "cards": [{"type": "entities", "entities": ["sensor.ignored"]}]},
        ]
    }

    export = build_dashboard_export(
        config,
        hass=FakeHass(),
        authority_id="AUTHORITY",
        bridge_url="wss://bridge.example/ws",
        selected_entities=["sensor.temp", "camera.door"],
        dashboard_title="Casa",
        dashboard_url_path="lovelace",
        view_index=0,
    )

    assert export["manifest"] == {
        "name": "Casa / Main",
        "version": "0.1.0",
        "read_entities": ["sensor.temp"],
        "subscriptions": ["sensor.temp"],
        "history": ["sensor.temp"],
        "camera_snapshots": ["camera.door"],
        "actions": [],
        "dashboard": {
            "title": "Casa",
            "url_path": "lovelace",
            "view_title": "Main",
            "cards": [
                {"type": "entities", "title": "Entities", "entities": ["sensor.temp"]},
                {"type": "history-graph", "title": "History graph", "entities": ["sensor.temp"]},
                {"type": "picture-glance", "title": "Picture glance", "entities": ["camera.door"]},
            ],
        },
    }
    catalog = {entry["entity_id"]: entry for entry in export["catalog"]}
    assert catalog["sensor.temp"]["friendly_name"] == "Kitchen temperature"
    assert catalog["sensor.temp"]["state_snapshot"]["state"] == "21.4"
    assert catalog["sensor.temp"]["state_snapshot"]["unit_of_measurement"] == "°C"
    assert "secret" not in catalog["sensor.temp"]["state_snapshot"]["attributes"]
    assert "AUTHORITY" in export["brief"]
    assert "wss://bridge.example/ws" in export["brief"]
    assert "ask the user which entities need write or history" in export["brief"]
