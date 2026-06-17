import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShareCards, callShareAction, renderShareCards } from '../dist/index.js';

const manifest = {
  name: 'Shared home',
  version: '1',
  read_entities: ['light.porch', 'cover.gate', 'sensor.temp'],
  subscriptions: ['light.porch', 'cover.gate'],
  actions: [
    'light.turn_on@light.porch',
    'light.turn_off@light.porch',
    'cover.open_cover@cover.gate',
    'cover.close_cover@cover.gate',
    'cover.stop_cover@cover.gate',
  ],
};

const states = {
  'light.porch': { entity_id: 'light.porch', state: 'on', attributes: { friendly_name: 'Porch light', brightness: 128 } },
  'cover.gate': { entity_id: 'cover.gate', state: 'closed', attributes: { friendly_name: 'Front gate', current_position: 0 } },
  'sensor.temp': { entity_id: 'sensor.temp', state: '21.4', attributes: { friendly_name: 'Outside temperature', unit_of_measurement: '°C' } },
};

test('share UI builds entity cards from the granted manifest and states', () => {
  const cards = buildShareCards(manifest, states);
  assert.deepEqual(cards.map((card) => [card.entityId, card.domain, card.title]), [
    ['light.porch', 'light', 'Porch light'],
    ['cover.gate', 'cover', 'Front gate'],
    ['sensor.temp', 'sensor', 'Outside temperature'],
  ]);
  assert.deepEqual(cards[0].controls.map((control) => control.kind), ['toggle']);
  assert.equal(cards[0].controls[0].on, true);
  assert.equal(cards[0].attributes.brightnessPct, 50);
  assert.deepEqual(cards[1].controls.map((control) => control.service), ['open_cover', 'stop_cover', 'close_cover']);
  assert.equal(cards[2].controls.length, 0);
  assert.equal(cards[2].displayValue, '21.4 °C');
});

test('share UI renderer exposes accessible controls for granted entity actions only', () => {
  const html = renderShareCards(buildShareCards(manifest, states));
  assert.match(html, /<section[^>]+data-entity="light\.porch"/);
  assert.match(html, /<input[^>]+type="checkbox"[^>]+role="switch"[^>]+data-toggle[^>]+checked>/);
  assert.match(html, /<button[^>]+data-service="open_cover"[^>]+aria-label="Open"[^>]*><svg/);
  assert.match(html, /Outside temperature/);
  assert.doesNotMatch(html, /data-service="unlock"/);
});

test('share UI action prompts for a PIN and retries PIN-restricted service calls', async () => {
  const calls = [];
  const client = {
    async callService(domain, service, data) {
      calls.push([domain, service, data]);
      if (calls.length === 1) throw Object.assign(new Error('Restriction denied: pin_required'), { code: 'permission_denied' });
    },
  };

  await callShareAction(client, { domain: 'lock', service: 'unlock', entityId: 'lock.front_door' }, () => '1234');

  assert.deepEqual(calls, [
    ['lock', 'unlock', { entity_id: 'lock.front_door' }],
    ['lock', 'unlock', { entity_id: 'lock.front_door', pin: '1234' }],
  ]);
});
