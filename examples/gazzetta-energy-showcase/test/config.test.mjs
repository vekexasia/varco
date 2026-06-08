import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COMFORT_ENTITIES,
  DEFAULT_AUTHORITY_ID,
  ENERGY_ENTITIES,
  FORCE_RELAY_ONLY,
  HISTORY_ENTITIES,
  LIGHT_ENTITIES,
  READ_ENTITIES,
  SECURITY_ENTITIES,
  UTILITY_ENTITIES,
  createReadOnlyManifest,
} from '../dist/config.js';

test('showcase requests a read-only grant for all public demo entities', () => {
  const manifest = createReadOnlyManifest();
  assert.equal(manifest.name, 'Varco Gazzetta Home');
  assert.deepEqual(manifest.actions, []);
  assert.deepEqual(manifest.camera_snapshots, []);
  assert.deepEqual(manifest.history, HISTORY_ENTITIES);
  assert.deepEqual(manifest.read_entities, READ_ENTITIES);
  assert.deepEqual(manifest.subscriptions, READ_ENTITIES);
});

test('showcase allows P2P upgrade in production while keeping relay fallback', () => {
  assert.equal(FORCE_RELAY_ONLY, false);
});

test('showcase defaults to the remote Home Assistant synthetic Authority and entity set', () => {
  assert.equal(DEFAULT_AUTHORITY_ID, '3j3rQeFlaFN1KOphZ2E4b7fFWoZSjF1A6KqgsntDhUg');
  assert.deepEqual(ENERGY_ENTITIES, {
    load: 'sensor.powerwall_load_w',
    solar: 'sensor.powerwall_solar_w',
    grid: 'sensor.powerwall_site_w',
    battery: 'sensor.powerwall_battery_w',
    batteryCharge: 'sensor.powerwall_charge',
  });
  assert.deepEqual(COMFORT_ENTITIES, {
    outdoorTemperature: 'sensor.outdoor_temperature',
    outdoorHumidity: 'sensor.outdoor_humidity',
    livingRoomTemperature: 'sensor.living_room_temperature',
    livingRoomHumidity: 'sensor.living_room_humidity',
    co2: 'sensor.air_quality_co2',
    climate: 'climate.living_room_climate',
    cooling: 'switch.living_room_cooling',
  });
  assert.deepEqual(LIGHT_ENTITIES, {
    kitchen: 'light.kitchen_pendants',
    livingRoom: 'light.living_room_lamps',
    studio: 'light.studio_desk',
    garden: 'light.garden_string_lights',
  });
  assert.deepEqual(SECURITY_ENTITIES, {
    frontDoor: 'binary_sensor.front_door',
    kitchenMotion: 'binary_sensor.kitchen_motion',
    garageDoor: 'binary_sensor.garage_door',
  });
  assert.deepEqual(UTILITY_ENTITIES, {
    evCharger: 'switch.ev_charger',
    evCharge: 'sensor.ev_charge',
    coffeeMachine: 'switch.coffee_machine',
  });
});
