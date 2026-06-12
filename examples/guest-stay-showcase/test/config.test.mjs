import assert from "node:assert/strict";
import { test } from "node:test";
import { ACTION_SCOPES, COMFORT_ENTITIES, createGuestStayManifest, ENERGY_ENTITIES, HOUSE_ENTITIES, LIGHT_ENTITIES, READ_ENTITIES } from "../dist/config.js";

test("guest manifest grants only room controls and comfort actions", () => {
  const manifest = createGuestStayManifest();
  assert.equal(manifest.name, "Varco Guest Stay");
  assert.deepEqual(manifest.read_entities, READ_ENTITIES);
  assert.deepEqual(manifest.subscriptions, READ_ENTITIES);
  assert.deepEqual(manifest.history, []);
  assert.deepEqual(manifest.camera_snapshots, []);
  assert.deepEqual(manifest.actions, ACTION_SCOPES);

  for (const entity of Object.values(LIGHT_ENTITIES)) {
    assert.ok(manifest.actions.includes(`light.turn_on@${entity}`));
    assert.ok(manifest.actions.includes(`light.turn_off@${entity}`));
  }
  assert.ok(manifest.actions.includes(`climate.set_temperature@${COMFORT_ENTITIES.climate}`));
  assert.equal(manifest.actions.some((scope) => scope.startsWith("lock.")), false);
});

test("guest showcase uses only dedicated guest synthetic entities", () => {
  assert.deepEqual(LIGHT_ENTITIES, {
    kitchen: "light.guest_kitchen",
    livingRoom: "light.guest_living_room",
    bedroom: "light.guest_bedroom",
    terrace: "light.guest_terrace",
  });
  assert.deepEqual(COMFORT_ENTITIES, {
    temperature: "sensor.guest_temperature",
    humidity: "sensor.guest_humidity",
    co2: "sensor.guest_co2",
    climate: "climate.guest_suite_climate",
    cooling: "switch.guest_cooling",
  });
  assert.deepEqual(HOUSE_ENTITIES, {
    frontDoor: "binary_sensor.guest_front_door",
    motion: "binary_sensor.guest_motion",
    coffeeMachine: "switch.guest_coffee_machine",
  });
  assert.deepEqual(ENERGY_ENTITIES, {
    load: "sensor.guest_power_load_w",
    solar: "sensor.guest_solar_w",
    batteryCharge: "sensor.guest_battery_charge",
  });
  assert.equal(READ_ENTITIES.every((entity) => entity.includes(".guest_") || entity === "climate.guest_suite_climate"), true);
});
