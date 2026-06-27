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

test('dashboard share controls are opt-in per non-sensor entity', () => {
  const panel = new VarcoPanel();
  const result = {
    manifest: {},
    entities: [
      { entity_id: 'sensor.temp', selected: true, scopes: { read: true, subscriptions: true } },
      { entity_id: 'switch.ev', selected: true, scopes: { read: true, subscriptions: true } },
    ],
  };
  assert.deepEqual(panel.previewManifest(result).actions, []);
  panel.toggleActionEntity('switch.ev', true);
  assert.deepEqual(panel.previewManifest(result).actions, ['switch.*@switch.ev']);
  panel.toggleActionEntity('switch.ev', false);
  assert.deepEqual(panel.previewManifest(result).actions, []);
});

test('timelineItems synthesizes request/grant state, deduplicates created grants, and sorts newest first', () => {
  const panel = new VarcoPanel();
  const items = panel.timelineItems({
    info: { authority_id: 'auth', relay: {} },
    requests: [
      { request_id: 'req-p', status: 'pending', pairing_code: '123456', consumer_pk: 'pk', created_at: '2024-01-05T00:00:00Z', manifest: { name: 'Pending app' } },
      { request_id: 'req-done', status: 'approved', pairing_code: '123456', consumer_pk: 'pk', created_at: '2024-01-06T00:00:00Z', manifest: { name: 'Approved app' } },
    ],
    grants: [
      { grant_id: 'g-created', consumer_pk: 'pk', created_at: '2024-01-04T00:00:00Z', manifest: { name: 'Already audited' } },
      { grant_id: 'g-exp', consumer_pk: 'pk', created_at: '2024-01-01T00:00:00Z', expires_at: '2024-01-03T00:00:00Z', manifest: { name: 'Expired app' } },
      { grant_id: 'g-rev', consumer_pk: 'pk', revoked: true, revoked_at: '2024-01-02T00:00:00Z', manifest: { name: 'Revoked app' } },
      { grant_id: 'g-active', consumer_pk: 'pk', created_at: '2024-01-01T00:00:00Z', manifest: { name: 'Active app' } },
    ],
    audit: [{ ts: '2024-01-04T00:00:00Z', event: 'grant_created', grant_id: 'g-created', details: { manifest_name: 'Already audited' } }],
    shares: [],
  });

  assert.deepEqual(items.map((item) => `${item.event}:${item.grant_id}`), [
    'access_request_pending:req-p',
    'grant_created:g-created',
    'grant_expired:g-exp',
    'grant_revoked:g-rev',
    'grant_active:g-active',
  ]);
  assert.equal(items.find((item) => item.event === 'access_request_pending').request_id, 'req-p');
  assert.equal(items.find((item) => item.event === 'access_request_pending').details.manifest_name, 'Pending app');
  assert.equal(items.filter((item) => item.grant_id === 'g-created').length, 1);
});
