import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_BRIDGE_URL, pairVarcoConsumer, runVarcoLocalHomeAssistantSmoke, runVarcoSmoke } from '../lib/varco-dev.mjs';

test('runVarcoSmoke requests access, approves through HA, verifies data plane, and deletes the grant', async () => {
  const adminCalls = [];
  const clientCalls = [];
  const admin = {
    async command(type, payload = {}) {
      adminCalls.push({ type, payload });
      if (type === 'varco/info') return { authority_id: 'authority-1' };
      if (type === 'varco/approve_request') return { grant_id: payload.request_id };
      if (type === 'varco/delete_grant') return { grant_id: payload.grant_id };
      throw new Error(type);
    },
  };
  const createClient = (options) => {
    assert.equal(options.authorityId, 'authority-1');
    assert.equal(options.bridgeUrl, DEFAULT_BRIDGE_URL);
    assert.deepEqual(options.manifest.read_entities, ['sensor.powerwall_load_w']);
    return {
      async requestAccess() { clientCalls.push('requestAccess'); return { request_id: 'req-1', pairing_code: '123456', status: 'pending' }; },
      async connect() { clientCalls.push('connect'); },
      async getStates(entityIds) { clientCalls.push(['getStates', entityIds]); return { 'sensor.powerwall_load_w': { state: '1200' } }; },
      async queryHistory(entityIds) { clientCalls.push(['queryHistory', entityIds]); return { 'sensor.powerwall_load_w': [] }; },
      async callService(domain, service, data) { clientCalls.push(['callService', domain, service, data]); },
      async close() { clientCalls.push('close'); },
    };
  };

  const result = await runVarcoSmoke({ admin, createClient, log: () => {} });

  assert.equal(result.authorityId, 'authority-1');
  assert.equal(result.requestId, 'req-1');
  assert.equal(result.grantId, 'req-1');
  assert.deepEqual(adminCalls, [
    { type: 'varco/info', payload: {} },
    { type: 'varco/approve_request', payload: { request_id: 'req-1' } },
    { type: 'varco/delete_grant', payload: { grant_id: 'req-1' } },
  ]);
  assert.deepEqual(clientCalls, [
    'requestAccess',
    'connect',
    ['getStates', ['sensor.powerwall_load_w']],
    ['queryHistory', ['sensor.powerwall_load_w']],
    ['callService', 'switch', 'turn_on', { entity_id: 'switch.ev_charger' }],
    ['callService', 'switch', 'turn_off', { entity_id: 'switch.ev_charger' }],
    'close',
  ]);
});

test('runVarcoLocalHomeAssistantSmoke verifies hass-first mode against Home Assistant APIs without pairing', async () => {
  const adminCalls = [];
  let switchState = 'off';
  const admin = {
    async command(type, payload = {}) {
      adminCalls.push({ type, payload });
      if (type === 'call_service') {
        if (payload.target?.entity_id === 'switch.ev_charger' && payload.service === 'turn_on') switchState = 'on';
        if (payload.target?.entity_id === 'switch.ev_charger' && payload.service === 'turn_off') switchState = 'off';
        return { context: { id: 'context-1' } };
      }
      if (type === 'get_states') return [
        { entity_id: 'sensor.powerwall_load_w', state: '1200', attributes: {} },
        { entity_id: 'switch.ev_charger', state: switchState, attributes: {} },
      ];
      if (type === 'history/history_during_period') return { 'sensor.powerwall_load_w': [{ state: '1200' }] };
      if (type === 'varco/access_requests') return [];
      throw new Error(type);
    },
    close() { adminCalls.push({ type: 'close', payload: {} }); },
  };
  const createClient = (options) => {
    assert.equal(options.hass.states['switch.ev_charger'].state, 'off');
    assert.equal(options.authorityId, 'local-mode-must-ignore-authority');
    let subscriptionCallback;
    return {
      async requestAccess() { return { request_id: 'local', pairing_code: '', status: 'approved', mode: 'home-assistant' }; },
      async connect() {},
      async getStates(entityIds) { return Object.fromEntries(entityIds.map((entityId) => [entityId, options.hass.states[entityId] ?? null])); },
      async subscribeEntities(entityIds, cb) {
        subscriptionCallback = cb;
        cb({ type: 'state_snapshot', subscription_id: 'local-1', states: Object.fromEntries(entityIds.map((entityId) => [entityId, options.hass.states[entityId] ?? null])) });
        return 'local-1';
      },
      updateHass(nextHass) { subscriptionCallback?.({ type: 'state_delta', subscription_id: 'local-1', states: { 'switch.ev_charger': nextHass.states['switch.ev_charger'] } }); },
      async queryHistory(entityIds, range) { return options.hass.callWS({ type: 'history/history_during_period', entity_ids: entityIds, ...range }); },
      async callService(domain, service, data) { const { entity_id, ...serviceData } = data; await options.hass.callService(domain, service, serviceData, { entity_id }); },
      async unsubscribe() {},
      async close() {},
    };
  };

  const result = await runVarcoLocalHomeAssistantSmoke({ admin, createClient, log: () => {} });

  assert.equal(result.mode, 'home-assistant');
  assert.deepEqual(result.historyEntities, ['sensor.powerwall_load_w']);
  assert.equal(adminCalls.some((call) => call.type.startsWith('varco/')), false);
});

test('pairVarcoConsumer creates and approves a reusable development grant without cleanup', async () => {
  const adminCalls = [];
  const admin = {
    async command(type, payload = {}) {
      adminCalls.push({ type, payload });
      if (type === 'varco/info') return { authority_id: 'authority-1' };
      if (type === 'varco/approve_request') return { grant_id: 'grant-1' };
      throw new Error(type);
    },
  };
  const createClient = () => ({
    consumerPublicKey: 'consumer-1',
    async requestAccess() { return { request_id: 'req-1', pairing_code: '123456', status: 'pending' }; },
    async connect() {},
    async close() {},
  });

  const result = await pairVarcoConsumer({ admin, createClient, log: () => {} });

  assert.deepEqual(result, { authorityId: 'authority-1', requestId: 'req-1', grantId: 'grant-1', consumerPublicKey: 'consumer-1' });
  assert.deepEqual(adminCalls, [
    { type: 'varco/info', payload: {} },
    { type: 'varco/approve_request', payload: { request_id: 'req-1' } },
  ]);
});

test('runVarcoRestrictionsSmoke verifies add/remove/PIN/rate-limit grant restrictions without a live HA', async () => {
  const adminCalls = [];
  const restrictions = { current: [] };

  const state = { value: 'off' };
  const subscriptionCallbacks = [];
  const admin = {
    async command(type, payload = {}) {
      adminCalls.push({ type, payload });
      if (type === 'varco/info') return { authority_id: 'authority-1' };
      if (type === 'varco/approve_request') return { grant_id: payload.request_id };
      if (type === 'varco/delete_grant') return {};
      if (type === 'varco/update_grant_restrictions') {
        restrictions.current = payload.restrictions ?? [];
        return {};
      }
      if (type === 'call_service') {
        state.value = payload.service === 'turn_on' ? 'on' : 'off';
        if (!restrictions.current.length) {
          for (const cb of subscriptionCallbacks) cb({ type: 'state_delta', states: { [payload.target.entity_id]: { state: state.value } } });
        }
        return {};
      }
      if (type === 'get_states') return [{ entity_id: 'switch.ev_charger', state: state.value }];
      throw new Error(`Unexpected admin command: ${type}`);
    },
  };

  let callCount = 0;
  const createClient = () => ({
    async requestAccess() { return { request_id: 'req-1', pairing_code: '123456', status: 'pending' }; },
    async connect() {},
    async subscribeEntities(entityIds, cb) {
      subscriptionCallbacks.push(cb);
      cb({ type: 'state_snapshot', subscription_id: 'sub-1', states: Object.fromEntries(entityIds.map((entityId) => [entityId, { state: state.value }])) });
      return 'sub-1';
    },
    async callService(domain, service, data) {
      callCount++;
      const active = restrictions.current;
      // Simulate expiry restriction.
      const expiry = active.find((r) => r.type === 'expiry' && r.enabled !== false);
      if (expiry) {
        const err = new Error('permission_denied: expired');
        err.code = 'permission_denied';
        throw err;
      }
      // Simulate PIN restriction on switch.turn_on.
      const pin = active.find((r) => r.type === 'pin' && r.enabled !== false);
      if (pin && service === 'turn_on') {
        if (!data?.pin || data.pin !== '9876') {
          const err = new Error('permission_denied: pin_required');
          err.code = 'permission_denied';
          throw err;
        }
      }
      // Simulate rate limit (limit:2 per window).
      const rate = active.find((r) => r.type === 'rate_limit' && r.enabled !== false);
      if (rate) {
        rate._hits = (rate._hits ?? 0) + 1;
        if (rate._hits > (rate.params?.limit ?? 2)) {
          const err = new Error('permission_denied: rate_limited');
          err.code = 'permission_denied';
          throw err;
        }
      }
      state.value = service === 'turn_on' ? 'on' : 'off';
      if (!active.length) {
        for (const cb of subscriptionCallbacks) cb({ type: 'state_delta', states: { 'switch.ev_charger': { state: state.value } } });
      }
    },
    async close() {},
  });

  const { runVarcoRestrictionsSmoke } = await import('../lib/varco-dev.mjs');
  const result = await runVarcoRestrictionsSmoke({ admin, createClient, bridgeUrl: 'ws://mock', log: () => {} });

  assert.ok(result.deniedByExpiry, 'should be denied by expiry');
  assert.ok(result.deniedByPin, 'should be denied without PIN');
  assert.ok(result.deniedByWrongPin, 'should be denied with wrong PIN');
  assert.ok(result.deniedByRateLimit, 'should be denied by rate limit');
  assert.ok(result.subscriptionInvalidated, 'should stop subscription deltas after restriction update');

  // Verify the admin was asked to update and clear restrictions.
  const updateCalls = adminCalls.filter((c) => c.type === 'varco/update_grant_restrictions');
  assert.ok(updateCalls.length >= 3, 'should have set and cleared restrictions at least 3 times');
  assert.deepEqual(updateCalls.at(-1).payload.restrictions, [], 'last update should clear restrictions');
});
