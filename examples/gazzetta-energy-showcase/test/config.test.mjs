import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_AUTHORITY_ID, ENERGY_ENTITIES, createReadOnlyManifest, FORCE_RELAY_ONLY, READ_ENTITIES } from '../dist/config.js';

test('showcase requests a read-only grant for only energy entities', () => {
  const manifest = createReadOnlyManifest();
  assert.equal(manifest.name, 'Varco Gazzetta Energy');
  assert.deepEqual(manifest.actions, []);
  assert.deepEqual(manifest.camera_snapshots, []);
  assert.deepEqual(manifest.history, READ_ENTITIES);
  assert.deepEqual(manifest.read_entities, READ_ENTITIES);
  assert.deepEqual(manifest.subscriptions, READ_ENTITIES);
});

test('showcase forces relay-only transport so browser never exposes P2P candidates', () => {
  assert.equal(FORCE_RELAY_ONLY, true);
});

test('showcase defaults to the local Home Assistant synthetic energy Authority', () => {
  assert.equal(DEFAULT_AUTHORITY_ID, '_gZC49yjo_Iqq7vUacDNnzngZJ8QMjHalGiYT7i56cQ');
  assert.deepEqual(ENERGY_ENTITIES, {
    load: 'sensor.powerwall_load_w',
    solar: 'sensor.powerwall_solar_w',
    grid: 'sensor.powerwall_site_w',
    battery: 'sensor.powerwall_battery_w',
    batteryCharge: 'sensor.powerwall_charge',
  });
});
