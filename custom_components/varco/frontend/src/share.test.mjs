import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.HTMLElement = class {};
globalThis.customElements = { define() {} };

const { parseShareClaims, SHARE_MAX_CLAIMS, VarcoPanel } = await import('../panel.js');

test('share claims accepts only bounded plain positive integers', () => {
  assert.equal(parseShareClaims('1'), 1);
  assert.equal(parseShareClaims(String(SHARE_MAX_CLAIMS)), SHARE_MAX_CLAIMS);
  for (const value of ['', '0', '-1', '1.5', '1e3', String(SHARE_MAX_CLAIMS + 1)]) {
    assert.equal(parseShareClaims(value), null, value);
  }
});

test('dashboard share manifest preserves harvested dashboard metadata', () => {
  const panel = new VarcoPanel();
  const result = {
    manifest: {
      dashboard: { title: 'Casa', view_title: 'Main', cards: [{ title: 'Kitchen', entities: ['sensor.temp', 'switch.ev'] }] },
    },
    entities: [
      { entity_id: 'sensor.temp', selected: true, scopes: { read: true, subscriptions: true, history: false, camera_snapshots: false } },
      { entity_id: 'switch.ev', selected: false, scopes: { read: true, subscriptions: true, history: false, camera_snapshots: false } },
    ],
  };
  assert.deepEqual(panel.previewManifest(result).dashboard.cards[0].entities, ['sensor.temp']);
});
